import { PageHeader } from '@/components/dashboard/header';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerPainelMaterial } from '@/lib/material/cadastro';
import { lerParametros } from '@/lib/material/parametros';
import { lerTabelasPreco } from '@/lib/material/tabelas';

import { GerirMaterial } from './_components/GerirMaterial';

/** Cadastro do fluxo de material (spec 0019, AC-19, AC-20, Anexo V e SINAPI, AC-24 a AC-30, e parâmetros, AC-42). Só Admin. */
export default async function MaterialConfigPage() {
  await requireAdmin();
  await dbConnect();
  const [painel, tabelas, parametros] = await Promise.all([
    lerPainelMaterial(),
    lerTabelasPreco(),
    lerParametros(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material"
        subtitle="Empenhos, faixas de competência, designações e as tabelas de preço (Anexo V e SINAPI) do fluxo de cotação de material. Nada aqui se apaga: designação é revogada, faixa é desativada, o empenho recebe reforço ou anulação e cada importação vira uma versão nova."
      />
      <GerirMaterial painel={painel} tabelas={tabelas} parametros={parametros} />
    </div>
  );
}
