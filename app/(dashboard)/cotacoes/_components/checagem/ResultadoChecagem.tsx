import type { CotacaoDTO } from '@/lib/material/serializar';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import { ROTULO_PAPEL, TEXTO_CHECAGEM as T } from '@/shared/material/mensagens';

/**
 * O que a checagem decidiu (spec 0024, AC-10, AC-24). TRF1 e almoxarifado leem
 * todas as entradas, com saldo, preço, motivo e autor; contratada e técnico, só
 * o resultado por item. A visão vem de `serializarCotacao`: aqui só se mostra.
 */
export function ResultadoChecagem({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const entradas = c.checagem?.entradas ?? [];
  const resultado = c.resultadoChecagem ?? [];
  if (entradas.length === 0 && resultado.length === 0) return null;

  return (
    <section
      aria-labelledby="resultado-checagem-titulo"
      className="space-y-3 rounded-2xl border border-border/50 bg-card p-5 text-sm"
    >
      <h2 id="resultado-checagem-titulo" className="text-base font-semibold">
        {T.resumoTitulo}
      </h2>
      {entradas.length > 0 ? (
        <ul className="space-y-3">
          {entradas.map((e, n) => (
            <li key={`${e.itemId}-${n}`} className="space-y-0.5 border-t border-border/50 pt-3">
              <p className="font-medium">
                {e.descricao}{' '}
                <span className="font-normal text-muted-foreground">
                  ({formatarQuantidade(e.quantidadePedida)} {e.unidade})
                </span>
              </p>
              <p>
                {T.resultado[e.resultado]}
                {e.origem === 'manual' && ` · ${T.origemManual}`}
              </p>
              {e.materialDescricao && (
                <p className="text-muted-foreground">
                  {e.coMat && <span className="font-mono text-xs">{e.coMat} </span>}
                  {e.materialDescricao}
                </p>
              )}
              {e.saldoVisto != null && (
                <p className="text-muted-foreground tabular-nums">
                  {T.colunaSaldo}: {formatarQuantidade(e.saldoVisto)}
                  {e.reservadoVisto != null &&
                    ` · ${T.colunaReservado}: ${formatarQuantidade(e.reservadoVisto)}`}
                </p>
              )}
              {e.resultado === 'usar' && (
                <p className="tabular-nums">
                  {T.resumoAtendido(formatarQuantidade(e.quantidadeAtendida ?? 0), e.unidade)}
                  {e.valorCentavos != null && ` · ${formatarReais(e.valorCentavos)}`}
                  {e.precoOrigem === 'manual' && ` · ${T.precoDigitado}`}
                </p>
              )}
              {e.motivo && <p>{e.motivo}</p>}
              <p className="text-xs text-muted-foreground">
                {e.porNome ?? ROTULO_PAPEL[e.papel]} ·{' '}
                {T.consultadoEm(formatarDataHoraBelem(e.consultadoEm))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {resultado.map((r) => (
            <li key={r.itemId}>
              <span className="font-medium">{r.descricao}: </span>
              {r.resultado === 'atendido'
                ? T.resumoAtendido(formatarQuantidade(r.quantidadeAtendida ?? 0), r.unidade)
                : T.resumoSegue}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
