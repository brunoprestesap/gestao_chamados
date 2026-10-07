import Link from 'next/link';

import { PageHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import {
  listarContratos,
  listarEmissoes,
  montarRelatorioContrato,
} from '@/lib/contratos/relatorio';
import { nomeDoUsuario } from '@/lib/contratos/usuario';
import { requireAdmin } from '@/lib/dal';
import { mesesPermitidos } from '@/shared/contratos/janela';

import { RelatorioContratoTela } from './_components/RelatorioContratoTela';
import { type OpcaoContrato, SeletorContratoMes } from './_components/SeletorContratoMes';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ contratoId?: string; mes?: string }> };

const TEXTO_ESCOLHA = 'Escolha um contrato e um mês da vigência.';

/** Relatório mensal por contrato (spec 0016, AC-5 a AC-19). Só Admin. */
export default async function RelatorioContratoPage({ searchParams }: Props) {
  const session = await requireAdmin();
  const { contratoId, mes } = await searchParams;
  const agora = new Date();
  const hoje = hojeEmBelem(agora);
  const contratos = await listarContratos();

  const opcoes: OpcaoContrato[] = contratos.map((c) => ({
    id: c.id,
    rotulo: `${c.numero} · ${c.empresa}${c.isActive ? '' : ' (inativo)'}`,
    meses: mesesPermitidos(c, hoje),
  }));

  let conteudo: React.ReactNode = null;
  if (contratoId && mes) {
    const geradoPorNome = await nomeDoUsuario(session.userId);
    const r = await montarRelatorioContrato({ contratoId, mes, agora, geradoPorNome });
    if (r.ok) {
      const emissoes = await listarEmissoes(r.relatorio.contrato.id, mes);
      conteudo = <RelatorioContratoTela dados={r.relatorio} emissoes={emissoes} />;
    } else {
      conteudo = (
        <Card className="rounded-2xl">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {TEXTO_ESCOLHA}
          </CardContent>
        </Card>
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório por contrato"
        subtitle="Chamados, tempo de reparo, reincidência e SLA de cada equipamento, por contrato e mês, para acompanhar a empresa contratada."
      />

      {contratos.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">Nenhum contrato cadastrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre os contratos em{' '}
              <Link
                href="/configuracoes/contratos"
                className="font-medium text-primary hover:underline"
              >
                Contratos
              </Link>{' '}
              para gerar o relatório.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contrato e mês</CardTitle>
            </CardHeader>
            <CardContent>
              <SeletorContratoMes opcoes={opcoes} contratoId={contratoId} mes={mes} />
            </CardContent>
          </Card>
          {conteudo}
        </>
      )}
    </div>
  );
}
