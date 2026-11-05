'use client';

import { AlertTriangle, Loader2, PackageSearch, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { MaterialDaChecagem } from '@/app/api/cotacoes/[id]/checagem/materiais/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ItemDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import { restanteDoItem } from '@/shared/material/checagem';
import {
  BUSCA_CHECAGEM_MIN_LETRAS,
  type DecisaoChecagem,
  DECISOES_CHECAGEM,
  MOTIVO_CHECAGEM_MAX,
} from '@/shared/material/material.constants';
import { TEXTO_CHECAGEM as T } from '@/shared/material/mensagens';

import { concluirChecagemAction } from '../../actions';
import {
  ESTADO_INICIAL,
  type EstadoItemChecagem,
  montarDecisao,
  precisaDePreco,
  unidadesDiferentes,
} from './decisao';

/**
 * A tela da checagem do almoxarifado (spec 0024, AC-5, AC-6): para cada item em
 * aberto, os candidatos com saldo, a busca manual e a decisão. Os candidatos vêm
 * da rota de busca, sem chamar o serviço na leitura do detalhe. Sem resposta do
 * SICAM, a tela oferece o registro manual (AC-12), e nunca quebra.
 */

type Carga =
  | { estado: 'carregando' }
  | { estado: 'pronto'; candidatos: Record<string, MaterialDaChecagem[]>; consultadoEm: string }
  | { estado: 'fora' };

const hora = (iso: string) => formatarDataHoraBelem(iso);

/** Os candidatos dos itens em aberto. Qualquer falha conta como SICAM fora, sem quebrar a tela. */
async function consultarCandidatos(cotacaoId: string): Promise<Carga> {
  try {
    const r = await fetch(`/api/cotacoes/${cotacaoId}/checagem/materiais`);
    if (!r.ok) return { estado: 'fora' };
    const dados = (await r.json()) as {
      candidatos: Record<string, MaterialDaChecagem[]>;
      consultadoEm: string;
    };
    return { estado: 'pronto', ...dados };
  } catch {
    return { estado: 'fora' };
  }
}

function CartaoMaterial({
  material,
  escolhido,
  desabilitado,
  onEscolher,
}: {
  material: MaterialDaChecagem;
  escolhido: boolean;
  desabilitado: boolean;
  onEscolher: () => void;
}) {
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3 text-sm',
        escolhido && 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">
          <span className="font-mono text-xs text-muted-foreground">{material.coMat}</span>{' '}
          {material.descricao}
        </p>
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <div className="flex gap-1">
            <dt>{T.colunaSaldo}:</dt>
            <dd>
              {formatarQuantidade(material.saldo)} {material.unidade}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>{T.colunaReservado}:</dt>
            <dd>{formatarQuantidade(material.reservado)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>{T.colunaDisponivel}:</dt>
            <dd className="font-semibold text-foreground">
              {formatarQuantidade(material.disponivel)}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>{T.colunaPreco}:</dt>
            <dd>
              {material.precoMedioCentavos != null
                ? formatarReais(material.precoMedioCentavos)
                : T.semPreco}
            </dd>
          </div>
        </dl>
      </div>
      <Button
        type="button"
        size="sm"
        variant={escolhido ? 'secondary' : 'outline'}
        aria-pressed={escolhido}
        aria-label={`${escolhido ? T.escolhido : T.escolher}: ${material.descricao}`}
        disabled={desabilitado}
        onClick={onEscolher}
      >
        {escolhido ? T.escolhido : T.escolher}
      </Button>
    </li>
  );
}

function ItemChecagem({
  cotacaoId,
  item,
  candidatos,
  sicamFora,
  estado,
  desabilitado,
  onMudar,
}: {
  cotacaoId: string;
  item: ItemDTO;
  candidatos: MaterialDaChecagem[];
  sicamFora: boolean;
  estado: EstadoItemChecagem;
  desabilitado: boolean;
  onMudar: (parte: Partial<EstadoItemChecagem>) => void;
}) {
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<MaterialDaChecagem[] | null>(null);
  const [avisoBusca, setAvisoBusca] = useState<string | null>(null);
  const [buscaEm, setBuscaEm] = useState<string | null>(null);

  async function buscar() {
    const q = busca.trim();
    if (q.length < BUSCA_CHECAGEM_MIN_LETRAS) {
      setAvisoBusca(T.buscaCurta);
      return;
    }
    setAvisoBusca(null);
    setBuscando(true);
    try {
      const r = await fetch(
        `/api/cotacoes/${cotacaoId}/checagem/materiais?q=${encodeURIComponent(q)}`,
      );
      if (!r.ok) {
        setResultados(null);
        setAvisoBusca(T.sicamFora);
        return;
      }
      const dados = (await r.json()) as { materiais: MaterialDaChecagem[]; consultadoEm: string };
      setResultados(dados.materiais);
      setBuscaEm(dados.consultadoEm);
      if (dados.materiais.length === 0) setAvisoBusca(T.semResultado);
    } catch {
      setAvisoBusca(T.sicamFora);
    } finally {
      setBuscando(false);
    }
  }

  const prefixo = `checagem-${item.id}`;
  const diferentes = unidadesDiferentes(item, estado);
  const pedePreco = precisaDePreco(estado, sicamFora);
  const pedeMotivo = estado.resultado === 'cotar_mesmo_assim' || sicamFora;
  const pedeMaterial =
    !sicamFora && (estado.resultado === 'usar' || estado.resultado === 'cotar_mesmo_assim');
  const pedeManual = sicamFora && estado.resultado !== 'sem_correspondente' && !!estado.resultado;
  const atendida = Number(estado.atendida.replace(',', '.'));
  const restante =
    estado.resultado === 'usar' && atendida > 0 ? restanteDoItem(item.quantidade, atendida) : 0;

  const lista = (materiais: MaterialDaChecagem[]) => (
    <ul className="space-y-2">
      {materiais.map((m) => (
        <CartaoMaterial
          key={m.coMat}
          material={m}
          escolhido={estado.material?.coMat === m.coMat}
          desabilitado={desabilitado}
          onEscolher={() => onMudar({ material: m })}
        />
      ))}
    </ul>
  );

  return (
    <article
      aria-labelledby={`${prefixo}-titulo`}
      className="space-y-4 rounded-2xl border border-border/50 p-4"
    >
      <header>
        <h3 id={`${prefixo}-titulo`} className="font-semibold">
          {item.descricao}
        </h3>
        <p className="text-sm text-muted-foreground">
          {T.pedido(formatarQuantidade(item.quantidade), item.unidade)}
        </p>
      </header>

      {!sicamFora && (
        <div className="space-y-3">
          <section className="space-y-2" aria-label={T.candidatos}>
            <h4 className="text-sm font-medium">{T.candidatos}</h4>
            {candidatos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T.semCandidatos}</p>
            ) : (
              lista(candidatos)
            )}
          </section>
          <form
            role="search"
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void buscar();
            }}
          >
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor={`${prefixo}-busca`}>{T.buscaRotulo}</Label>
              <Input
                id={`${prefixo}-busca`}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={buscando} className="gap-2">
              {buscando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              {T.buscar}
            </Button>
          </form>
          <div aria-live="polite">
            {avisoBusca && <p className="text-sm text-muted-foreground">{avisoBusca}</p>}
          </div>
          {resultados && resultados.length > 0 && (
            <section className="space-y-2" aria-label={T.resultados}>
              <h4 className="text-sm font-medium">{T.resultados}</h4>
              {buscaEm && (
                <p className="text-xs text-muted-foreground">{T.consultadoEm(hora(buscaEm))}</p>
              )}
              {lista(resultados)}
            </section>
          )}
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{T.decisao}</legend>
        <RadioGroup
          value={estado.resultado ?? ''}
          disabled={desabilitado}
          onValueChange={(v) => {
            const resultado = v as DecisaoChecagem;
            onMudar(
              resultado === 'usar' && !estado.atendida
                ? { resultado, atendida: String(item.quantidade).replace('.', ',') }
                : { resultado },
            );
          }}
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          {DECISOES_CHECAGEM.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <RadioGroupItem value={d} id={`${prefixo}-${d}`} />
              <Label htmlFor={`${prefixo}-${d}`} className="font-normal">
                {T.decisaoOpcoes[d]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {pedeMaterial && (
        <p className="text-sm" aria-live="polite">
          {estado.material ? T.materialEscolhido(estado.material.descricao) : T.escolhaMaterial}
        </p>
      )}

      {pedeManual && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-saldo`}>{T.manualSaldo}</Label>
            <Input
              id={`${prefixo}-saldo`}
              inputMode="decimal"
              value={estado.saldoManual}
              disabled={desabilitado}
              onChange={(e) => onMudar({ saldoManual: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-unidade`}>{T.manualUnidade}</Label>
            <Input
              id={`${prefixo}-unidade`}
              value={estado.unidadeManual}
              disabled={desabilitado}
              onChange={(e) => onMudar({ unidadeManual: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-descricao`}>{T.manualDescricao}</Label>
            <Input
              id={`${prefixo}-descricao`}
              value={estado.descricaoManual}
              disabled={desabilitado}
              onChange={(e) => onMudar({ descricaoManual: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-codigo`}>{T.manualCodigo}</Label>
            <Input
              id={`${prefixo}-codigo`}
              inputMode="numeric"
              value={estado.codigoManual}
              disabled={desabilitado}
              onChange={(e) => onMudar({ codigoManual: e.target.value })}
            />
          </div>
        </div>
      )}

      {estado.resultado === 'usar' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-atendida`}>{T.quantidadeAtendida(item.unidade)}</Label>
            <Input
              id={`${prefixo}-atendida`}
              inputMode="decimal"
              value={estado.atendida}
              disabled={desabilitado}
              aria-describedby={`${prefixo}-restante`}
              onChange={(e) => onMudar({ atendida: e.target.value })}
            />
            <p id={`${prefixo}-restante`} className="text-xs text-muted-foreground">
              {restante > 0 ? T.restante(formatarQuantidade(restante), item.unidade) : ''}
            </p>
          </div>
          {diferentes && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixo}-saida`}>
                {T.quantidadeSaida(estado.material?.unidade ?? estado.unidadeManual)}
              </Label>
              <Input
                id={`${prefixo}-saida`}
                inputMode="decimal"
                value={estado.saida}
                disabled={desabilitado}
                aria-describedby={`${prefixo}-saida-ajuda`}
                onChange={(e) => onMudar({ saida: e.target.value })}
              />
              <p id={`${prefixo}-saida-ajuda`} className="text-xs text-muted-foreground">
                {T.unidadesDiferentes}
              </p>
            </div>
          )}
          {pedePreco && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixo}-preco`}>{T.precoManual}</Label>
              <Input
                id={`${prefixo}-preco`}
                inputMode="decimal"
                value={estado.preco}
                disabled={desabilitado}
                aria-describedby={sicamFora ? undefined : `${prefixo}-preco-ajuda`}
                onChange={(e) => onMudar({ preco: e.target.value })}
              />
              {!sicamFora && (
                <p id={`${prefixo}-preco-ajuda`} className="text-xs text-muted-foreground">
                  {T.precoSemValor}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {pedeMotivo && !!estado.resultado && (
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-motivo`}>{T.motivo}</Label>
          <Textarea
            id={`${prefixo}-motivo`}
            rows={2}
            maxLength={MOTIVO_CHECAGEM_MAX}
            value={estado.motivo}
            disabled={desabilitado}
            aria-describedby={`${prefixo}-motivo-ajuda`}
            onChange={(e) => onMudar({ motivo: e.target.value })}
          />
          <p id={`${prefixo}-motivo-ajuda`} className="text-xs text-muted-foreground">
            {T.motivoAjuda}
          </p>
        </div>
      )}
    </article>
  );
}

export function PainelChecagem({
  cotacaoId,
  versao,
  itens,
  prazoAte,
  onAlterado,
}: {
  cotacaoId: string;
  versao: number;
  /** Só os itens ainda em aberto. */
  itens: ItemDTO[];
  prazoAte: string | null;
  onAlterado: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ estado: 'carregando' });
  const [estados, setEstados] = useState<Record<string, EstadoItemChecagem>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    void consultarCandidatos(cotacaoId).then((nova) => {
      if (vivo) setCarga(nova);
    });
    return () => {
      vivo = false;
    };
  }, [cotacaoId]);

  async function consultarDeNovo() {
    setCarga({ estado: 'carregando' });
    setCarga(await consultarCandidatos(cotacaoId));
  }

  const sicamFora = carga.estado === 'fora';
  const estadoDe = (id: string) => estados[id] ?? ESTADO_INICIAL;
  const faltam = itens.filter((i) => !estadoDe(i.id).resultado).length;

  function concluir() {
    setErro(null);
    const decisoes = itens.flatMap((i) => {
      const d = montarDecisao(i.id, estadoDe(i.id), sicamFora);
      return d ? [d] : [];
    });
    iniciar(async () => {
      const r = await concluirChecagemAction({ id: cotacaoId, versao, decisoes });
      if (!r.ok) {
        setErro(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(T.concluida);
      onAlterado();
    });
  }

  return (
    <section
      id="checagem"
      aria-labelledby="checagem-titulo"
      className="scroll-mt-24 space-y-4 rounded-2xl border border-border/50 bg-card p-5"
    >
      <header className="space-y-1">
        <h2 id="checagem-titulo" className="flex items-center gap-2 text-base font-semibold">
          <PackageSearch className="size-4 text-muted-foreground" aria-hidden="true" />
          {T.titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{T.subtitulo}</p>
        {prazoAte && <p className="text-sm">{T.prazo(hora(prazoAte))}</p>}
      </header>

      <div aria-live="polite">
        {carga.estado === 'carregando' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {T.carregando}
          </p>
        )}
        {carga.estado === 'pronto' && (
          <p className="text-xs text-muted-foreground">
            {T.consultadoEm(hora(carga.consultadoEm))}
          </p>
        )}
        {sicamFora && (
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">{T.sicamFora}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void consultarDeNovo()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {T.tentarDeNovo}
            </Button>
          </div>
        )}
      </div>

      {carga.estado !== 'carregando' &&
        itens.map((item) => (
          <ItemChecagem
            key={item.id}
            cotacaoId={cotacaoId}
            item={item}
            candidatos={carga.estado === 'pronto' ? (carga.candidatos[item.id] ?? []) : []}
            sicamFora={sicamFora}
            estado={estadoDe(item.id)}
            desabilitado={pendente}
            onMudar={(parte) =>
              setEstados((atual) => ({
                ...atual,
                [item.id]: { ...(atual[item.id] ?? ESTADO_INICIAL), ...parte },
              }))
            }
          />
        ))}

      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {faltam > 0 && <p className="text-sm text-muted-foreground">{T.emAberto(faltam)}</p>}
        <Button
          type="button"
          variant="gradiente"
          disabled={pendente || faltam > 0 || carga.estado === 'carregando'}
          className="gap-2"
          onClick={concluir}
        >
          {pendente && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {T.concluir}
        </Button>
      </div>
    </section>
  );
}
