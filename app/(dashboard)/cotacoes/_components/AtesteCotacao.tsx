'use client';

import { ClipboardCheck, Loader2, Paperclip } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Acoes } from '@/lib/material/leitura';
import type { AtoDTO, CotacaoDTO } from '@/lib/material/serializar';

import {
  registrarNotaFiscalAction,
  registrarRecebimentoAction,
  removerArquivoAction,
} from '../actions';
import { enviarArquivo, SeloPrazoAteste } from './apoio';

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** O dia de `quando` no relógio de Belém, `YYYY-MM-DD`, para os limites do campo de data. */
function diaEmBelem(quando: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(new Date(quando));
}

/** A contratada recebe só a data do recebimento, sem o nome de quem recebeu (AC-21). */
function Ato({ rotulo, ato }: { rotulo: string; ato: AtoDTO | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>
        {ato
          ? ato.porNome
            ? `${dataHora(ato.em)} · ${ato.porNome}`
            : dataHora(ato.em)
          : 'Ainda não registrado'}
      </dd>
    </div>
  );
}

type Props = {
  cotacao: CotacaoDTO;
  acoes: Acoes;
  onAlterado: () => void;
};

/**
 * O ateste da cotação (spec 0019, fatia 2): o gestor registra o recebimento
 * provisório e o definitivo, com o selo de prazo (AC-21), e o responsável
 * técnico registra a nota fiscal da atestada (AC-22).
 */
export function AtesteCotacao({ cotacao: c, acoes, onAlterado }: Props) {
  const [confirmar, setConfirmar] = useState<'provisorio' | 'definitivo' | null>(null);
  const [nfAberta, setNfAberta] = useState(false);
  // A nota não se troca depois de gravada: antes de registrar, a contratada confere.
  const [conferindo, setConferindo] = useState(false);
  const [nf, setNf] = useState({ numero: '', data: '', arquivoId: '', nomeArquivo: '' });
  const [enviando, setEnviando] = useState(false);
  // Anexos já removidos nesta tela, até a página recarregar a lista do servidor.
  const [removidos, setRemovidos] = useState<ReadonlySet<string>>(new Set());
  const [pendente, iniciar] = useTransition();

  if (c.situacao !== 'executada' && c.situacao !== 'atestada') return null;
  if (c.visao !== 'trf1' && c.visao !== 'contratada') return null;

  function receber(etapa: 'provisorio' | 'definitivo') {
    iniciar(async () => {
      const r = await registrarRecebimentoAction({ id: c.id, versao: c.versao, etapa });
      if (!r.ok) {
        toast.error(r.error);
        onAlterado();
        return;
      }
      toast.success(
        etapa === 'provisorio'
          ? 'Recebimento provisório registrado.'
          : 'Recebimento definitivo registrado. A cotação está atestada.',
      );
      setConfirmar(null);
      onAlterado();
    });
  }

  /**
   * O arquivo enviado e ainda não ligado à nota é removido ao trocar o anexo
   * ou fechar o diálogo, para uma tentativa recusada não deixar arquivo preso
   * nem gastar o limite de 10 (AC-22). Falha aqui não atrapalha o registro.
   */
  async function soltarAnexo(arquivoId: string) {
    if (!arquivoId) return;
    setRemovidos((atual) => new Set(atual).add(arquivoId));
    await removerArquivoAction({ arquivoId }).catch(() => undefined);
  }

  /**
   * Quem saiu da página com o diálogo aberto deixou um anexo sem nota: ao
   * reabrir, o mais recente volta como anexo do diálogo, e os outros saem,
   * para nenhum arquivo ficar preso ocupando o limite de 10 (AC-22).
   */
  function abrirNf() {
    const soltos = (c.arquivos ?? []).filter(
      (a) =>
        a.tipo === 'nota_fiscal' &&
        a.meu &&
        a.id !== c.notaFiscal?.arquivoId &&
        !removidos.has(a.id),
    );
    const reaproveitado = soltos.at(-1);
    for (const a of soltos.slice(0, -1)) void soltarAnexo(a.id);
    setNf({
      numero: '',
      data: '',
      arquivoId: reaproveitado?.id ?? '',
      nomeArquivo: reaproveitado?.nomeOriginal ?? '',
    });
    setNfAberta(true);
  }

  async function anexarNf(arquivos: FileList | null) {
    const a = arquivos?.[0];
    if (!a) return;
    setEnviando(true);
    const anterior = nf.arquivoId;
    const r = await enviarArquivo(c.id, 'nota_fiscal', a);
    setEnviando(false);
    if (!r.ok) {
      toast.error(`${a.name}: ${r.error}`);
      return;
    }
    setNf((atual) => ({ ...atual, arquivoId: r.arquivoId, nomeArquivo: a.name }));
    void soltarAnexo(anterior);
  }

  function fecharNf() {
    void soltarAnexo(nf.arquivoId);
    setNf({ numero: '', data: '', arquivoId: '', nomeArquivo: '' });
    setConferindo(false);
    setNfAberta(false);
  }

  function registrarNf() {
    iniciar(async () => {
      const r = await registrarNotaFiscalAction({
        id: c.id,
        versao: c.versao,
        numero: nf.numero,
        data: nf.data,
        arquivoId: nf.arquivoId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Nota fiscal registrada.');
      setNf({ numero: '', data: '', arquivoId: '', nomeArquivo: '' });
      setNfAberta(false);
      setConferindo(false);
      onAlterado();
    });
  }

  return (
    <section
      aria-labelledby="ateste-titulo"
      className="space-y-3 rounded-2xl border border-border/50 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ateste-titulo" className="flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Ateste
        </h2>
        <SeloPrazoAteste prazo={c.prazoAteste ?? null} />
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Ato rotulo="Recebimento provisório" ato={c.recebimentoProvisorio} />
        <Ato rotulo="Recebimento definitivo" ato={c.recebimentoDefinitivo} />
        <div>
          <dt className="text-xs text-muted-foreground">Nota fiscal</dt>
          <dd>
            {c.notaFiscal ? (
              <>
                Nº {c.notaFiscal.numero}, de {c.notaFiscal.data.split('-').reverse().join('/')}{' '}
                <a
                  href={`/api/cotacoes/arquivos/${c.notaFiscal.arquivoId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  arquivo
                </a>
              </>
            ) : c.situacao === 'atestada' ? (
              'Aguardando a contratada'
            ) : (
              'Só depois do ateste'
            )}
          </dd>
        </div>
      </dl>

      {(acoes.receberProvisorio || acoes.receberDefinitivo || acoes.registrarNotaFiscal) && (
        <div className="flex flex-wrap gap-2">
          {acoes.receberProvisorio && (
            <Button disabled={pendente} onClick={() => setConfirmar('provisorio')}>
              Registrar recebimento provisório
            </Button>
          )}
          {acoes.receberDefinitivo && (
            <Button disabled={pendente} onClick={() => setConfirmar('definitivo')}>
              Registrar recebimento definitivo
            </Button>
          )}
          {acoes.registrarNotaFiscal && (
            <Button disabled={pendente} onClick={abrirNf}>
              Registrar nota fiscal
            </Button>
          )}
        </div>
      )}

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {confirmar === 'definitivo'
                ? 'Registrar o recebimento definitivo'
                : 'Registrar o recebimento provisório'}
            </DialogTitle>
            <DialogDescription>
              {confirmar === 'definitivo'
                ? 'Você atesta que o material foi aplicado como autorizado. A cotação passa a atestada e a contratada é avisada para enviar a nota fiscal.'
                : 'Você registra que recebeu o material aplicado, para conferência. O definitivo vem depois.'}{' '}
              O ato fica na trilha com o seu nome.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button disabled={pendente} onClick={() => confirmar && receber(confirmar)}>
              {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={nfAberta}
        onOpenChange={(o) => {
          if (o) abrirNf();
          else if (!pendente) fecharNf();
        }}
      >
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nota fiscal de {c.numero}</DialogTitle>
            <DialogDescription>
              Número, data de emissão (entre o dia da autorização e hoje) e o arquivo da nota (PDF,
              JPEG ou PNG, até 20 MB).
            </DialogDescription>
          </DialogHeader>
          {conferindo ? (
            <div
              role="status"
              className="space-y-1 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <p>
                Confira antes de registrar: nota nº{' '}
                <span className="font-semibold">{nf.numero.trim()}</span>, emitida em{' '}
                <span className="font-semibold">{nf.data.split('-').reverse().join('/')}</span>,
                arquivo <span className="font-semibold">{nf.nomeArquivo}</span>.
              </p>
              <p>Depois de registrada, a nota fiscal não pode ser trocada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nf-numero">Número</Label>
                <Input
                  id="nf-numero"
                  value={nf.numero}
                  onChange={(e) => setNf({ ...nf, numero: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nf-data">Data de emissão</Label>
                <Input
                  id="nf-data"
                  type="date"
                  min={c.autorizadoEm ? diaEmBelem(c.autorizadoEm) : undefined}
                  max={diaEmBelem()}
                  value={nf.data}
                  onChange={(e) => setNf({ ...nf, data: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nf-arquivo">Arquivo</Label>
                <Input
                  id="nf-arquivo"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  disabled={enviando}
                  onChange={(e) => void anexarNf(e.target.files)}
                />
                {enviando && <p className="text-xs text-muted-foreground">Enviando o arquivo…</p>}
                {nf.nomeArquivo && !enviando && (
                  <p className="text-xs text-muted-foreground">Anexado: {nf.nomeArquivo}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {conferindo ? (
              <>
                <Button variant="outline" onClick={() => setConferindo(false)} disabled={pendente}>
                  Corrigir
                </Button>
                <Button disabled={pendente} onClick={registrarNf}>
                  {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Confirmar e registrar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={fecharNf} disabled={pendente}>
                  Voltar
                </Button>
                <Button
                  disabled={enviando || !nf.numero.trim() || !nf.data || !nf.arquivoId}
                  onClick={() => setConferindo(true)}
                >
                  Conferir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
