'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ItemDTO, OrcamentoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import {
  type BaseDeAmbas,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
} from '@/shared/material/material.constants';
import {
  ROTULO_FECHAR_DIALOGO,
  TEXTO_ENCAMINHAR as T,
  textoMarcaAnomalia,
} from '@/shared/material/mensagens';

export type EscolhasEncaminhar = {
  bases: { itemId: string; base: BaseDeAmbas; justificativa: string }[];
  conferencias: { itemId: string; texto: string }[];
  confirmacoes: string[];
  aceitarUrgencia?: boolean;
};

type Ponto = { chave: string; titulo: string; resolvido: boolean; conteudo: ReactNode };

/** `a` em relação a `b`, em % com uma casa; `null` quando falta um dos preços. */
function diferenca(a: number | null | undefined, b: number | null | undefined): string | null {
  if (a == null || b == null || b <= 0) return null;
  if (a === b) return T.mesmoPreco;
  const pct = (Math.abs(a - b) * 100) / b;
  return T.diferenca(
    pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    a < b,
  );
}

/**
 * O fiscal encaminha resolvendo, um a um, os pontos numerados (spec 0021,
 * AC-10): a base de cada item que está no Anexo V e no SINAPI, com
 * justificativa (AC-27 da 0019), a conferência de cada item da lista
 * obrigatória (AC-29), cada orçamento vencido (AC-34) e o aceite da urgência
 * (AC-35). O botão só habilita com todos resolvidos; o servidor confere de
 * novo. O diálogo continua montado quando a tela recarrega, então as escolhas
 * ficam depois de uma recusa por versão.
 */
export function DialogEncaminhar({
  numero,
  valorCentavos,
  ambas,
  naLista,
  vencidos,
  urgencia,
  open,
  onOpenChange,
  pendente,
  onConfirmar,
}: {
  numero: string;
  valorCentavos: number;
  ambas: ItemDTO[];
  naLista: ItemDTO[];
  /** Orçamentos vencidos hoje (Belém), lidos no servidor. */
  vencidos: OrcamentoDTO[];
  /** A urgência pedida que precisa do aceite, com a justificativa. */
  urgencia: { justificativa: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pendente: boolean;
  onConfirmar: (escolhas: EscolhasEncaminhar) => void;
}) {
  const [bases, setBases] = useState<Record<string, { base: BaseDeAmbas | ''; texto: string }>>({});
  const [conferencias, setConferencias] = useState<Record<string, string>>({});
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  const [aceitar, setAceitar] = useState(false);

  const longo = (t: string | undefined) => (t ?? '').trim().length >= TEXTO_CURTO_MIN;
  const tamanho = T.tamanho(TEXTO_CURTO_MIN, TEXTO_CURTO_MAX);

  const pontos: Ponto[] = [
    ...ambas.map((i): Ponto => {
      const atual = bases[i.id] ?? { base: '', texto: '' };
      const mudar = (m: Partial<typeof atual>) =>
        setBases((b) => ({ ...b, [i.id]: { ...atual, ...m } }));
      const opcoes = [
        {
          valor: 'anexo_v' as const,
          rotulo: T.opcaoAnexoV(i.anexoVNumero),
          preco: i.anexoVPrecoCentavos,
          outro: i.sinapiPrecoCentavos,
        },
        {
          valor: 'sinapi' as const,
          rotulo: T.opcaoSinapi(i.sinapiCodigo),
          preco: i.sinapiPrecoCentavos,
          outro: i.anexoVPrecoCentavos,
        },
      ];
      return {
        chave: `base-${i.id}`,
        titulo: T.pontoBase,
        resolvido: !!atual.base && longo(atual.texto),
        conteudo: (
          <>
            <p className="text-sm font-semibold">{i.descricao}</p>
            <RadioGroup
              value={atual.base}
              onValueChange={(v) => mudar({ base: v as BaseDeAmbas })}
              aria-label={`${T.pontoBase}: ${i.descricao}`}
              className="gap-2"
            >
              {opcoes.map((o) => {
                const id = `base-${i.id}-${o.valor}`;
                const dif = diferenca(o.preco, o.outro);
                return (
                  <label
                    key={o.valor}
                    htmlFor={id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 px-3.5 py-3 transition-colors hover:bg-muted/40',
                      atual.base === o.valor &&
                        'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-400 dark:bg-indigo-950/30',
                    )}
                  >
                    <RadioGroupItem id={id} value={o.valor} className="mt-0.5" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">{o.rotulo}</span>
                      <span className="text-[13px] text-muted-foreground tabular-nums">
                        {o.preco != null
                          ? T.porUnidade(formatarReais(o.preco), i.unidade)
                          : T.semPreco}
                        {dif ? ` · ${dif}` : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
            <div className="space-y-1.5">
              <Label htmlFor={`just-${i.id}`}>{T.justificativa}</Label>
              <Textarea
                id={`just-${i.id}`}
                rows={2}
                value={atual.texto}
                maxLength={TEXTO_CURTO_MAX}
                aria-describedby={`just-${i.id}-ajuda`}
                onChange={(e) => mudar({ texto: e.target.value })}
              />
              <p id={`just-${i.id}-ajuda`} className="text-xs text-muted-foreground">
                {tamanho}
              </p>
            </div>
          </>
        ),
      };
    }),
    ...naLista.map(
      (i): Ponto => ({
        chave: `conf-${i.id}`,
        titulo: T.pontoConferencia,
        resolvido: longo(conferencias[i.id]),
        conteudo: (
          <div className="space-y-1.5">
            <Label htmlFor={`conf-${i.id}`} className="block leading-snug">
              <span className="font-semibold">{i.descricao}</span>
              <span className="font-normal text-muted-foreground">
                {' · '}
                {T.conferenciaDoItem(
                  i.anexoVNumero,
                  i.marcaAnomalia ? textoMarcaAnomalia(i.marcaAnomalia) : null,
                )}
              </span>
            </Label>
            <Textarea
              id={`conf-${i.id}`}
              rows={2}
              value={conferencias[i.id] ?? ''}
              maxLength={TEXTO_CURTO_MAX}
              placeholder={T.conferencia}
              aria-describedby={`conf-${i.id}-ajuda`}
              onChange={(e) => setConferencias((c) => ({ ...c, [i.id]: e.target.value }))}
            />
            <p id={`conf-${i.id}-ajuda`} className="text-xs text-muted-foreground">
              {T.conferencia}. {tamanho}
            </p>
          </div>
        ),
      }),
    ),
    ...vencidos.map(
      (o): Ponto => ({
        chave: `venc-${o.id}`,
        titulo: T.pontoVencido,
        resolvido: !!confirmados[o.id],
        conteudo: (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id={`venc-${o.id}`}
                className="mt-0.5"
                checked={!!confirmados[o.id]}
                onCheckedChange={(v) => setConfirmados((c) => ({ ...c, [o.id]: v === true }))}
              />
              <Label htmlFor={`venc-${o.id}`} className="leading-snug font-normal">
                {T.confirmoVencido(
                  o.fornecedor,
                  formatarCnpj(o.cnpj),
                  o.validade ? o.validade.split('-').reverse().join('/') : null,
                )}
              </Label>
            </div>
            <p className="pl-6.5 text-xs text-muted-foreground">{T.vencidoAjuda}</p>
          </div>
        ),
      }),
    ),
    ...(urgencia
      ? [
          {
            chave: 'urgencia',
            titulo: T.pontoUrgencia,
            resolvido: aceitar,
            conteudo: (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{T.urgenciaJustificativa}:</span>{' '}
                  {urgencia.justificativa}
                </p>
                <p className="text-xs text-muted-foreground">{T.urgenciaAjuda}</p>
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="enc-urgencia"
                    className="mt-0.5"
                    checked={aceitar}
                    onCheckedChange={(v) => setAceitar(v === true)}
                  />
                  <Label htmlFor="enc-urgencia" className="leading-snug font-normal">
                    {T.aceitoUrgencia}
                  </Label>
                </div>
              </div>
            ),
          } satisfies Ponto,
        ]
      : []),
  ];
  const feitos = pontos.filter((p) => p.resolvido).length;
  const incompleto = feitos < pontos.length;

  return (
    <Dialog open={open} onOpenChange={(o) => (o || !pendente) && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-[13px]">{numero}</span> · {formatarReais(valorCentavos)}
            . {T.resumo(pontos.length)}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-5">
          {pontos.map((p, n) => (
            <li key={p.chave}>
              <section aria-labelledby={`${p.chave}-titulo`} className="space-y-2.5">
                <h3
                  id={`${p.chave}-titulo`}
                  className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {p.resolvido ? (
                    <CheckCircle2
                      className="size-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="size-4" aria-hidden="true" />
                  )}
                  <span>
                    {n + 1} · {p.titulo}
                  </span>
                  <span className="sr-only">({p.resolvido ? T.resolvido : T.pendente})</span>
                </h3>
                {p.conteudo}
              </section>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">{T.vaoParaTrilha}</p>

        <DialogFooter className="items-center">
          <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums sm:mr-auto">
            {T.resolvidos(feitos, pontos.length)}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pendente}>
            {ROTULO_FECHAR_DIALOGO}
          </Button>
          <Button
            variant="gradiente"
            disabled={pendente || incompleto}
            onClick={() =>
              onConfirmar({
                bases: ambas.map((i) => ({
                  itemId: i.id,
                  base: bases[i.id]!.base as BaseDeAmbas,
                  justificativa: bases[i.id]!.texto,
                })),
                conferencias: naLista.map((i) => ({ itemId: i.id, texto: conferencias[i.id]! })),
                confirmacoes: vencidos.map((o) => o.id),
                ...(urgencia ? { aceitarUrgencia: aceitar } : {}),
              })
            }
          >
            {T.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
