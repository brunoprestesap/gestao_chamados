'use client';

import {
  Building2,
  Camera,
  CameraOff,
  CheckCircle2,
  CloudDownload,
  DatabaseZap,
  Loader2,
  MapPin,
  PackagePlus,
  ScanLine,
  SearchX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ehCodigoInterno, normalizarCodigo } from '@/lib/ativos/codigo';
import { cn, formatDateTime } from '@/lib/utils';
import {
  apagarPacote,
  descartarOperacao,
  gerarClientOpId,
  gerarCodigoProvisorio,
  guardarOperacao,
  lerPacote,
  limparResolvidasAntigas,
  listarOperacoes,
  type OperacaoCadastroEnviada,
  type OperacaoConferenciaEnviada,
  type OperacaoGuardada,
  type PacoteGuardado,
  type ResultadoSincronizacao,
  salvarPacote,
  sincronizarFila,
} from '@/lib/vistoria-offline';
import {
  CAMPOS_TECNICOS,
  type CampoTecnico,
  ESTADO_OPERACAO_LABELS,
} from '@/shared/vistoria/vistoria.constants';
import {
  type AtivoDoPacote,
  type LocalDoPacote,
  OperacaoCadastroSchema,
  type PacoteVistoria,
} from '@/shared/vistoria/vistoria.schemas';

import { useLeitorCamera } from '../../../_components/useLeitorCamera';
import { CriarLocalCampo } from './CriarLocalCampo';
import { codigoNaTela, FilaVistoria } from './FilaVistoria';
import { FormCadastro, type ValoresCadastro } from './FormCadastro';
import { FormConferencia, type ValoresTecnicos } from './FormConferencia';
import { ItemCadastrado } from './ItemCadastrado';
import { SeloAusenteSicam } from './SeloAusenteSicam';

type EstadoPacote = 'carregando' | 'pronto' | 'sem_campanha' | 'sem_pacote' | 'sem_banco';
type ResultadoDownload = 'ok' | 'sem_campanha' | 'falha';

const AVISO_SYNC: Record<ResultadoSincronizacao['estado'], string | null> = {
  ok: null,
  sessao_expirada: 'Entre de novo para enviar.',
  sem_conexao: 'Sem sinal. As conferências ficam guardadas e sobem quando a conexão voltar.',
  erro_servidor: 'O servidor não respondeu. Tente sincronizar de novo.',
};

function assinarConexao(avisar: () => void) {
  window.addEventListener('online', avisar);
  window.addEventListener('offline', avisar);
  return () => {
    window.removeEventListener('online', avisar);
    window.removeEventListener('offline', avisar);
  };
}

/** Só para mostrar o selo; a sincronização nunca depende disto (AC-6). */
function useOnline(): boolean {
  return useSyncExternalStore(
    assinarConexao,
    () => navigator.onLine,
    () => true,
  );
}

function subarvore(locais: LocalDoPacote[], predio: LocalDoPacote): LocalDoPacote[] {
  return locais.filter((l) => l.id === predio.id || l.caminho.startsWith(`${predio.caminho}/`));
}

type CadastroGuardado = OperacaoGuardada & { operacao: OperacaoCadastroEnviada };

function ehCadastro(o: OperacaoGuardada): o is CadastroGuardado {
  return o.operacao.tipo === 'cadastro';
}

/** O ativo da operação: o conferido, ou o que o cadastro criou (ou achou) no servidor. */
function ativoIdDaOperacao(o: OperacaoGuardada): string | undefined {
  return o.operacao.tipo === 'cadastro' ? o.resultado?.ativoId : o.operacao.ativoId;
}

/** Campos técnicos preenchidos, já sem espaço nas pontas. */
function tecnicosPreenchidos(valores: Record<CampoTecnico, string>) {
  const campos: Partial<Record<CampoTecnico, string>> = {};
  for (const campo of CAMPOS_TECNICOS) {
    const v = valores[campo].trim();
    if (v) campos[campo] = v;
  }
  return campos;
}

/** O novo local entra logo depois da subárvore do pai, para o recuo da lista continuar certo. */
function inserirLocal(
  locais: LocalDoPacote[],
  novo: LocalDoPacote,
  pai: LocalDoPacote,
): LocalDoPacote[] {
  let fim = locais.findIndex((l) => l.id === pai.id) + 1;
  while (fim > 0 && fim < locais.length && locais[fim].caminho.startsWith(`${pai.caminho}/`)) {
    fim++;
  }
  if (fim === 0) fim = locais.length;
  return [...locais.slice(0, fim), novo, ...locais.slice(fim)];
}

/** Nome do local abaixo do prédio, com o recuo da árvore. */
function rotuloLocal(local: LocalDoPacote, predio: LocalDoPacote): string {
  if (local.id === predio.id) return `${predio.nome} (o próprio prédio)`;
  const resto = local.caminho.slice(predio.caminho.length + 1);
  const nivel = resto.split('/').length - 1;
  return `${'  '.repeat(nivel)}${local.nome}`;
}

/**
 * Tela de campo da vistoria (spec 0012, AC-3 a AC-15). Com ou sem sinal, a
 * conferência e o cadastro sempre vão para a fila do aparelho e depois para a
 * sincronização: não existe um caminho online separado.
 */
export function CampoVistoria({
  userId,
  podeCriarLocal,
}: {
  userId: string;
  podeCriarLocal: boolean;
}) {
  const online = useOnline();
  const [guardado, setGuardado] = useState<PacoteGuardado | null>(null);
  const [estadoPacote, setEstadoPacote] = useState<EstadoPacote>('carregando');
  const [baixando, setBaixando] = useState(false);
  const [avisoPacote, setAvisoPacote] = useState<string | null>(null);
  const [operacoes, setOperacoes] = useState<OperacaoGuardada[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizandoRef = useRef(false);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);
  const [predioId, setPredioId] = useState('');
  const [localId, setLocalId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<AtivoDoPacote | null>(null);
  // Cadastro aberto: o código lido que não estava no pacote, ou `null` (sem tombo).
  const [cadastrando, setCadastrando] = useState<{ codigo: string | null } | null>(null);
  // Um cadastro da fila aberto pela lista da sala ou lendo o mesmo código de novo.
  const [itemFilaId, setItemFilaId] = useState<string | null>(null);

  const recarregarFila = useCallback(async () => {
    setOperacoes(await listarOperacoes(userId));
  }, [userId]);

  const sincronizar = useCallback(async () => {
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
    try {
      const r = await sincronizarFila(userId);
      setAvisoSync(AVISO_SYNC[r.estado]);
    } catch {
      setAvisoSync('Não foi possível ler a fila guardada neste aparelho.');
    } finally {
      sincronizandoRef.current = false;
      setSincronizando(false);
      await recarregarFila().catch(() => {});
    }
  }, [userId, recarregarFila]);

  const baixarPacote = useCallback(async (): Promise<ResultadoDownload> => {
    setBaixando(true);
    setAvisoPacote(null);
    try {
      const res = await fetch('/api/vistoria/pacote', { cache: 'no-store' });
      if (res.status === 409) {
        await apagarPacote(userId);
        setGuardado(null);
        setEstadoPacote('sem_campanha');
        return 'sem_campanha';
      }
      if (!res.ok) {
        setAvisoPacote(
          res.status === 401
            ? 'Sua sessão expirou. Entre de novo para atualizar o pacote.'
            : 'Não foi possível baixar o pacote agora.',
        );
        return 'falha';
      }
      const pacote = (await res.json()) as PacoteVistoria;
      await salvarPacote(userId, pacote);
      setGuardado((await lerPacote(userId)) ?? null);
      setEstadoPacote('pronto');
      return 'ok';
    } catch {
      setAvisoPacote('Sem sinal: usando o pacote guardado neste aparelho.');
      return 'falha';
    } finally {
      setBaixando(false);
    }
  }, [userId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let salvo: PacoteGuardado | undefined;
      try {
        await limparResolvidasAntigas(userId);
        const [p, ops] = await Promise.all([lerPacote(userId), listarOperacoes(userId)]);
        salvo = p;
        if (!vivo) return;
        setOperacoes(ops);
        if (salvo) {
          setGuardado(salvo);
          setEstadoPacote('pronto');
        }
      } catch {
        if (vivo) setEstadoPacote('sem_banco');
        return;
      }
      const r = await baixarPacote();
      if (!vivo) return;
      if (r === 'falha' && !salvo) setEstadoPacote('sem_pacote');
      await sincronizar();
    })();
    return () => {
      vivo = false;
    };
  }, [userId, baixarPacote, sincronizar]);

  useEffect(() => {
    const aoVoltar = () => void sincronizar();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [sincronizar]);

  const pacote = guardado?.pacote ?? null;
  const predios = pacote?.locais.filter((l) => l.tipo === 'predio') ?? [];
  const predio = predios.find((p) => p.id === predioId) ?? null;
  const locaisDoPredio = pacote && predio ? subarvore(pacote.locais, predio) : [];
  const local = locaisDoPredio.find((l) => l.id === localId) ?? null;

  // O que já foi conferido nesta campanha: o que veio no pacote e o que está na fila.
  const conferidos = new Map<string, string>();
  const opsDaCampanha = operacoes.filter(
    (o) => o.operacao.campanhaId === pacote?.campanha.id && o.estado !== 'recusada',
  );
  for (const c of pacote?.conferidos ?? []) {
    conferidos.set(c.ativoId, `Conferido por ${c.autorNome}`);
  }
  for (const o of opsDaCampanha) {
    const ativoId = ativoIdDaOperacao(o);
    if (!ativoId || conferidos.has(ativoId)) continue;
    conferidos.set(
      ativoId,
      o.estado === 'pendente'
        ? 'Conferido por você, aguardando envio'
        : o.estado === 'ja_conferido'
          ? `Conferido por ${o.resultado?.conferidoPor ?? 'outra pessoa'}`
          : 'Conferido por você',
    );
  }

  // Cadastros desta campanha que o pacote ainda não traz (o pacote antigo não tem o ativo novo).
  const idsNoPacote = new Set((pacote?.ativos ?? []).map((a) => a.id));
  const cadastros = opsDaCampanha
    .filter(ehCadastro)
    .filter((o) => !(o.resultado?.ativoId && idsNoPacote.has(o.resultado.ativoId)));
  const cadastrosDaSala = cadastros.filter((o) => o.operacao.localizacaoId === localId);
  const itemFila = operacoes.find((o) => o.clientOpId === itemFilaId) ?? null;

  const ativosDaSala = (pacote?.ativos ?? [])
    .filter(
      (a) =>
        a.localizacaoId === localId ||
        opsDaCampanha.some(
          (o) => ativoIdDaOperacao(o) === a.id && o.operacao.localizacaoId === localId,
        ),
    )
    .sort(
      (a, b) =>
        Number(conferidos.has(a.id)) - Number(conferidos.has(b.id)) ||
        a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
    );

  /** Fecha o que estiver aberto (conferência, cadastro, item da fila) e o aviso de código. */
  function fecharPainel() {
    setSelecionado(null);
    setCadastrando(null);
    setItemFilaId(null);
    setNaoEncontrado(null);
  }

  /** O cadastro da fila com este código, provisório ou definitivo (AC-11). */
  function cadastroDaFila(c: string) {
    return cadastros.find((o) => o.rotulo.codigo === c || o.resultado?.codigo === c);
  }

  function abrirPorCodigo(bruto: string) {
    const c = normalizarCodigo(bruto);
    if (!c || !pacote) return;
    fecharPainel();
    const achado = pacote.ativos.find((a) => a.codigo === c);
    const daFila = achado ? undefined : cadastroDaFila(c);
    if (achado) setSelecionado(achado);
    else if (daFila) setItemFilaId(daFila.clientOpId);
    else {
      setNaoEncontrado(c);
      return;
    }
    setCodigo('');
  }

  // A câmera (só em contexto seguro) cai no mesmo caminho do código digitado.
  const {
    disponivel: cameraDisponivel,
    lendo: cameraLendo,
    abrindo: cameraAbrindo,
    erro: erroCamera,
    videoRef,
    iniciar: iniciarCamera,
    parar: pararCamera,
  } = useLeitorCamera((valor) => abrirPorCodigo(valor));

  async function guardarEEnviar(op: OperacaoGuardada): Promise<boolean> {
    try {
      await guardarOperacao(op);
    } catch {
      toast.error('Não foi possível guardar neste aparelho. Libere espaço e tente de novo.');
      return false;
    }
    await recarregarFila();
    void sincronizar();
    return true;
  }

  async function confirmar(ativo: AtivoDoPacote, valores: ValoresTecnicos) {
    if (!pacote || !local) return;
    // Só vai o que a pessoa mudou: um pacote velho não sobrescreve um valor mais novo (AC-4).
    const campos = tecnicosPreenchidos(valores);
    for (const campo of CAMPOS_TECNICOS) {
      if (campos[campo] === (ativo[campo] ?? '').trim()) delete campos[campo];
    }
    const clientOpId = gerarClientOpId();
    const agora = new Date().toISOString();
    const operacao: OperacaoConferenciaEnviada = {
      clientOpId,
      tipo: 'conferencia',
      campanhaId: pacote.campanha.id,
      ativoId: ativo.id,
      localizacaoId: local.id,
      ...campos,
      conferidoEm: agora,
    };
    const ok = await guardarEEnviar({
      clientOpId,
      userId,
      estado: 'pendente',
      criadaEm: agora,
      operacao,
      rotulo: { codigo: ativo.codigo, descricao: ativo.descricao, local: local.caminho },
    });
    if (ok) setSelecionado(null);
  }

  /** Cadastro em campo (AC-11, AC-12): devolve o erro para o formulário, ou `null`. */
  async function cadastrar(valores: ValoresCadastro): Promise<string | null> {
    if (!pacote || !local) return 'Escolha o local primeiro.';
    const clientOpId = gerarClientOpId();
    const agora = new Date().toISOString();
    const operacao: OperacaoCadastroEnviada = {
      clientOpId,
      tipo: 'cadastro',
      campanhaId: pacote.campanha.id,
      origemCodigo: valores.origemCodigo,
      ...(valores.origemCodigo === 'patrimonio' && { tombamento: valores.tombamento }),
      descricao: valores.descricao,
      categoriaId: valores.categoriaId,
      tierManutencao: valores.tierManutencao,
      localizacaoId: local.id,
      ...tecnicosPreenchidos(valores),
      conferidoEm: agora,
    };
    const parsed = OperacaoCadastroSchema.safeParse(operacao);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Confira os campos.';

    let codigoTela: string;
    if (parsed.data.origemCodigo === 'patrimonio' && parsed.data.tombamento) {
      codigoTela = normalizarCodigo(parsed.data.tombamento);
      // O tombo já está no pacote ou na fila: abre o que existe em vez de cadastrar de novo.
      const noPacote = pacote.ativos.find((a) => a.codigo === codigoTela);
      const naFila = noPacote ? undefined : cadastroDaFila(codigoTela);
      if (noPacote || naFila) {
        fecharPainel();
        if (noPacote) setSelecionado(noPacote);
        else if (naFila) setItemFilaId(naFila.clientOpId);
        return null;
      }
    } else {
      codigoTela = gerarCodigoProvisorio();
    }

    const ok = await guardarEEnviar({
      clientOpId,
      userId,
      estado: 'pendente',
      criadaEm: agora,
      operacao: { ...operacao, descricao: parsed.data.descricao },
      rotulo: { codigo: codigoTela, descricao: parsed.data.descricao, local: local.caminho },
    });
    if (!ok) return 'Não foi possível guardar neste aparelho.';
    fecharPainel();
    setItemFilaId(clientOpId);
    return null;
  }

  /** Local criado em campo pela gestão (AC-14): entra no pacote do aparelho na hora. */
  async function aoCriarLocal(novo: LocalDoPacote, pai: LocalDoPacote) {
    if (!guardado) return;
    const atualizado: PacoteVistoria = {
      ...guardado.pacote,
      locais: inserirLocal(guardado.pacote.locais, novo, pai),
    };
    try {
      await salvarPacote(userId, atualizado);
      setGuardado((await lerPacote(userId)) ?? null);
    } catch {
      setGuardado({ ...guardado, pacote: atualizado });
    }
    fecharPainel();
    setLocalId(novo.id);
    toast.success(`Local ${novo.nome} criado.`);
  }

  async function descartar(clientOpId: string) {
    await descartarOperacao(userId, clientOpId);
    await recarregarFila();
  }

  const fila = (
    <FilaVistoria
      operacoes={operacoes}
      sincronizando={sincronizando}
      aviso={avisoSync}
      onSincronizar={() => void sincronizar()}
      onDescartar={(id) => void descartar(id)}
    />
  );

  if (estadoPacote === 'carregando') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Preparando o campo…
      </div>
    );
  }

  if (estadoPacote === 'sem_banco') {
    return (
      <Aviso icone={<DatabaseZap className="h-6 w-6" aria-hidden />} titulo="Sem como guardar">
        Este navegador não deixa o Sigma guardar dados no aparelho (navegação privada, por exemplo).
        Abra o Sigma numa janela comum para vistoriar sem sinal.
      </Aviso>
    );
  }

  if (estadoPacote === 'sem_campanha' || estadoPacote === 'sem_pacote') {
    return (
      <div className="space-y-6">
        {estadoPacote === 'sem_campanha' ? (
          <Aviso
            icone={<MapPin className="h-6 w-6" aria-hidden />}
            titulo="Nenhuma campanha aberta"
          >
            Quando a gestão abrir uma campanha de vistoria, o campo fica disponível aqui.
          </Aviso>
        ) : (
          <Aviso
            icone={<WifiOff className="h-6 w-6" aria-hidden />}
            titulo="Sem pacote neste aparelho"
          >
            Abra esta tela com sinal pelo menos uma vez para baixar a lista dos equipamentos.
            <Button
              variant="outline"
              className="mt-4 rounded-xl"
              disabled={baixando}
              onClick={() => void baixarPacote()}
            >
              <CloudDownload className="h-4 w-4" aria-hidden />
              Tentar de novo
            </Button>
          </Aviso>
        )}
        {operacoes.length > 0 && fila}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <section
          aria-label="Pacote do campo"
          className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{pacote?.campanha.nome}</p>
            <p className="text-muted-foreground">
              Pacote baixado em {guardado ? formatDateTime(guardado.pacote.geradoEm) : '—'}
            </p>
            {avisoPacote && (
              <p className="mt-1 text-amber-700 dark:text-amber-400">{avisoPacote}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                online
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}
            >
              {online ? (
                <Wifi className="h-3 w-3" aria-hidden />
              ) : (
                <WifiOff className="h-3 w-3" aria-hidden />
              )}
              {online ? 'Com sinal' : 'Sem sinal'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={baixando}
              onClick={() => void baixarPacote()}
            >
              {baixando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CloudDownload className="h-4 w-4" aria-hidden />
              )}
              Atualizar pacote
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="titulo-onde"
          className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6"
        >
          <h2 id="titulo-onde" className="flex items-center gap-2.5 text-base font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            Onde você está
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="campo-predio">Prédio</Label>
              <select
                id="campo-predio"
                value={predioId}
                onChange={(e) => {
                  setPredioId(e.target.value);
                  setLocalId('');
                  fecharPainel();
                }}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Escolha o prédio</option>
                {predios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campo-local">Andar, sala ou área</Label>
              <select
                id="campo-local"
                value={localId}
                disabled={!predio}
                onChange={(e) => {
                  setLocalId(e.target.value);
                  fecharPainel();
                }}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="">Escolha o local</option>
                {predio &&
                  locaisDoPredio.map((l) => (
                    <option key={l.id} value={l.id}>
                      {rotuloLocal(l, predio)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {podeCriarLocal && predio && (
            <CriarLocalCampo
              key={(local ?? predio).id}
              pai={local ?? predio}
              online={online}
              onCriado={(novo) => aoCriarLocal(novo, local ?? predio)}
            />
          )}

          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              abrirPorCodigo(codigo);
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="campo-codigo">Tombamento ou código MNT</Label>
              <Input
                id="campo-codigo"
                value={codigo}
                disabled={!local}
                onChange={(e) => setCodigo(e.target.value)}
                autoComplete="off"
                placeholder={local ? 'Digite ou use o leitor USB' : 'Escolha o local primeiro'}
                className="h-11 rounded-xl font-mono text-base"
              />
            </div>
            <Button
              type="submit"
              disabled={!local || !codigo.trim()}
              className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
            >
              <ScanLine className="h-4 w-4" aria-hidden />
              Conferir
            </Button>
            {cameraDisponivel && (
              <Button
                type="button"
                variant="outline"
                disabled={!local || cameraAbrindo}
                onClick={() => (cameraLendo ? pararCamera() : void iniciarCamera())}
                className="h-11 rounded-xl"
              >
                {cameraLendo ? (
                  <CameraOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Camera className="h-4 w-4" aria-hidden />
                )}
                {cameraLendo ? 'Parar câmera' : 'Câmera'}
              </Button>
            )}
          </form>

          {cameraDisponivel && (
            <div
              className={
                cameraLendo
                  ? 'relative overflow-hidden rounded-xl border border-border/60 bg-black'
                  : 'hidden'
              }
            >
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-[4/3] w-full object-cover"
                aria-label="Imagem da câmera"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80"
              />
            </div>
          )}
          {erroCamera && (
            <p role="alert" className="text-sm text-destructive">
              {erroCamera}
            </p>
          )}

          <div aria-live="polite" className="empty:hidden">
            {naoEncontrado && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                <p className="flex items-center gap-2">
                  <SearchX className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    O código <span className="font-mono font-semibold">{naoEncontrado}</span> não
                    está no pacote desta vistoria.
                  </span>
                </p>
                {ehCodigoInterno(naoEncontrado) ? (
                  <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
                    Código MNT fora do pacote: o equipamento pode estar baixado ou fora dos tiers A
                    e B. Atualize o pacote se ele foi cadastrado agora.
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 bg-background"
                    onClick={() => {
                      const c = naoEncontrado;
                      fecharPainel();
                      setCadastrando({ codigo: c });
                      setCodigo('');
                    }}
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden />
                    Cadastrar aqui
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {cadastrando && local && pacote && (
          <FormCadastro
            key={`${local.id}-${cadastrando.codigo ?? 'sem-tombo'}`}
            codigoLido={cadastrando.codigo}
            local={local}
            categorias={pacote.categorias}
            onCancelar={() => setCadastrando(null)}
            onConfirmar={cadastrar}
          />
        )}

        {itemFila && ehCadastro(itemFila) && (
          <ItemCadastrado operacao={itemFila} onFechar={() => setItemFilaId(null)} />
        )}

        {selecionado && local && (
          <FormConferencia
            key={selecionado.id}
            ativo={selecionado}
            local={local}
            avisoConferido={conferidos.get(selecionado.id) ?? null}
            onCancelar={() => setSelecionado(null)}
            onConfirmar={(valores) => confirmar(selecionado, valores)}
          />
        )}

        {local && (
          <section
            aria-labelledby="titulo-sala"
            className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-sala" className="text-base font-semibold">
                Esperados em {local.nome}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 rounded-xl text-primary"
                onClick={() => {
                  fecharPainel();
                  setCadastrando({ codigo: null });
                }}
              >
                <PackagePlus className="h-4 w-4" aria-hidden />
                Cadastrar sem tombo
              </Button>
            </div>
            {ativosDaSala.length === 0 && cadastrosDaSala.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum equipamento registrado aqui ainda. Leia o código de cada um que você
                encontrar.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {ativosDaSala.map((a) => {
                  const feito = conferidos.get(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelecionado(a);
                          setNaoEncontrado(null);
                        }}
                        className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span
                            className={cn(
                              'block truncate text-sm font-medium',
                              feito && 'text-muted-foreground line-through',
                            )}
                          >
                            <span className="font-mono">{a.codigo}</span> · {a.descricao}
                          </span>
                          {feito && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              {feito}
                            </span>
                          )}
                        </span>
                        {a.ausenteNoSicam && <SeloAusenteSicam className="shrink-0" />}
                      </button>
                    </li>
                  );
                })}
                {cadastrosDaSala.map((o) => (
                  <li key={o.clientOpId}>
                    <button
                      type="button"
                      onClick={() => {
                        fecharPainel();
                        setItemFilaId(o.clientOpId);
                      }}
                      className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-muted-foreground line-through">
                          <span className="font-mono">{codigoNaTela(o)}</span> ·{' '}
                          {o.rotulo.descricao}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                          Cadastrado por você · {ESTADO_OPERACAO_LABELS[o.estado]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="lg:col-span-2">{fila}</div>
    </div>
  );
}

function Aviso({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border/70 bg-card p-6 text-center shadow-sm sm:p-10">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icone}
      </span>
      <h2 className="mt-4 text-lg font-semibold">{titulo}</h2>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
    </section>
  );
}
