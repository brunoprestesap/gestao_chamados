import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROTULO_PAPEL } from '@/shared/imr-contrato/formato';
import type {
  EmissaoPdfImr,
  ReaberturaLida,
  VersaoResumo,
} from '@/shared/imr-contrato/imr-contrato.types';

import { dataHora, type MesImr } from './apoio';

/** As versões e reaberturas do mês, todas legíveis (AC-11). */
export function HistoricoImr({
  mes,
  versoes,
  reaberturas,
  versaoVista,
}: {
  mes: MesImr;
  versoes: VersaoResumo[];
  reaberturas: ReaberturaLida[];
  /** A versão na tela; null na prévia. */
  versaoVista: number | null;
}) {
  if (versoes.length === 0) return null;
  const reabertaDa = new Map(reaberturas.map((r) => [r.versaoReaberta, r]));
  const href = (versao: number) =>
    `/relatorios/imr-contrato?contratoId=${mes.contratoId}&mes=${mes.competencia}&versao=${versao}`;
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fechamentos e reaberturas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada fechamento é uma versão gravada que não muda. Reabrir não apaga a versão.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {versoes.map((v) => {
            const r = reabertaDa.get(v.versao);
            return (
              <li key={v.versao} className="space-y-1 rounded-xl border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    Versão {v.versao} · {v.total} pontos
                  </p>
                  {v.versao === versaoVista ? (
                    <Badge variant="secondary">Na tela</Badge>
                  ) : (
                    <Link
                      href={href(v.versao)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Ver a versão {v.versao}
                    </Link>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fechada por {v.fechadoPorNome} ({ROTULO_PAPEL[v.papel]}) em{' '}
                  {dataHora(v.fechadoEm)}
                </p>
                {r ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reaberta</span> por {r.porNome} (
                    {ROTULO_PAPEL[r.papel]}) em {dataHora(r.em)}: {r.motivo}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

const ROTULO_PAPEL_EMISSAO: Record<EmissaoPdfImr['papel'], string> = {
  ...ROTULO_PAPEL,
  admin: 'Admin',
};

/** As emissões do PDF do mês, com o hash de cada arquivo entregue (AC-13). */
export function EmissoesImr({ emissoes }: { emissoes: EmissaoPdfImr[] }) {
  if (emissoes.length === 0) return null;
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">PDFs emitidos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada PDF entregue fica registrado com o SHA-256 do arquivo, para conferir a cópia anexada
          ao processo.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {emissoes.map((e) => (
            <li key={e.id} className="space-y-1 rounded-xl border px-3 py-2">
              <p className="font-medium">
                Versão {e.versao} · {dataHora(e.em)}
              </p>
              <p className="text-xs text-muted-foreground">
                Por {e.porNome} ({ROTULO_PAPEL_EMISSAO[e.papel]}) · código {e.id}
              </p>
              <p className="font-mono text-xs break-all text-muted-foreground">
                SHA-256 {e.sha256}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
