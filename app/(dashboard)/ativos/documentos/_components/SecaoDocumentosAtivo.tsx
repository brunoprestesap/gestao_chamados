import { AlertTriangle, ChevronDown, Download, FileText } from 'lucide-react';

import type { DocumentoDaTela, DocumentosDaFicha } from '@/lib/ativos/documentos/ficha';

import { AcoesDocumento } from './AcoesDocumento';
import { NovoDocumentoDialog } from './NovoDocumentoDialog';
import { SituacaoDocumentoBadge } from './SituacaoDocumentoBadge';

function LinhaDocumento({
  d,
  gestao,
  vigente,
  extra,
}: {
  d: DocumentoDaTela;
  gestao: boolean;
  vigente: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{d.tipoNome}</span>
          {vigente && <SituacaoDocumentoBadge situacao={d.situacao} texto={d.situacaoTexto} />}
          {extra}
        </div>
        <p className="text-xs text-muted-foreground">
          {[
            d.numero && `Nº ${d.numero}`,
            `Emitido em ${d.emitidoEmTexto}`,
            d.validadeAteTexto ? `Validade até ${d.validadeAteTexto}` : 'Sem validade',
            d.emitidoPor,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <a
          href={d.href}
          target="_blank"
          rel="noopener"
          className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{d.arquivoNome}</span>
          <span className="sr-only">(abre o arquivo do {d.tipoNome})</span>
        </a>
      </div>
      {gestao && (
        <AcoesDocumento
          vigente={vigente}
          documento={{
            id: d.id,
            tipoNome: d.tipoNome,
            numero: d.numero,
            emitidoPor: d.emitidoPor,
            emitidoEm: d.emitidoEm,
            validadeAte: d.validadeAte,
          }}
        />
      )}
    </li>
  );
}

/** Seção Documentos da ficha (spec 0013, AC-8). Nunca renderizada para Solicitante. */
export function SecaoDocumentosAtivo({
  dados,
  gestao,
  ativo,
}: {
  dados: DocumentosDaFicha;
  gestao: boolean;
  ativo: { id: string; codigo: string };
}) {
  const vazio = dados.vigentes.length === 0 && dados.herdados.length === 0;

  return (
    <section
      aria-labelledby="titulo-documentos"
      className="overflow-hidden rounded-2xl border border-border/50 bg-card py-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5">
        <h2 id="titulo-documentos" className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          Documentos
        </h2>
        {gestao && !dados.ativoBaixado && dados.tiposAtivos.length > 0 && (
          <NovoDocumentoDialog tipos={dados.tiposAtivos} ativoFixo={ativo} />
        )}
      </div>

      <div className="mt-4 space-y-5 px-5">
        {dados.faltando.length > 0 && (
          <div
            role="note"
            className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-medium">Faltando: </span>
              {dados.faltando.map((t) => t.nome).join(', ')}. A categoria exige e não há documento
              vigente no equipamento nem nos locais acima dele.
            </p>
          </div>
        )}

        {vazio ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento vigente para este equipamento.
          </p>
        ) : (
          <>
            {dados.vigentes.length > 0 && (
              <ul className="space-y-2" aria-label="Documentos do equipamento">
                {dados.vigentes.map((d) => (
                  <LinhaDocumento key={d.id} d={d} gestao={gestao} vigente />
                ))}
              </ul>
            )}
            {dados.herdados.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dos locais acima
                </h3>
                <ul className="space-y-2" aria-label="Documentos dos locais acima">
                  {dados.herdados.map((d) => (
                    <LinhaDocumento
                      key={d.id}
                      d={d}
                      gestao={false}
                      vigente
                      extra={
                        <span className="text-xs text-muted-foreground">de {d.localNome}</span>
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {dados.substituidos.length > 0 && (
          <details className="group rounded-xl border border-border/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
              Substituídos ({dados.substituidos.length})
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="space-y-2 px-3 pb-3">
              {dados.substituidos.map((d) => (
                <LinhaDocumento
                  key={d.id}
                  d={d}
                  gestao={gestao}
                  vigente={false}
                  extra={
                    d.substituidoEmTexto ? (
                      <span className="text-xs text-muted-foreground">
                        substituído em {d.substituidoEmTexto}
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
