import { PageHeader } from '@/components/dashboard/header';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerPainelMaterial } from '@/lib/material/cadastro';
import { lerParametros } from '@/lib/material/parametros';
import { lerTabelasPreco } from '@/lib/material/tabelas';
import { secaoDoCadastro } from '@/shared/material/cadastro';
import { TEXTO_CADASTRO } from '@/shared/material/mensagens';

import { GerirMaterial } from './_components/GerirMaterial';

/**
 * Cadastro do fluxo de material (spec 0019, AC-19, AC-20, AC-24 a AC-30 e
 * AC-42), em seções no endereço (`?secao=`, spec 0021, AC-18). Só Admin.
 */
export default async function MaterialConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string | string[] }>;
}) {
  await requireAdmin();
  await dbConnect();
  const secao = secaoDoCadastro((await searchParams).secao);
  // O painel serve a todas (a lista do topo e as notas da navegação); as
  // tabelas e os parâmetros, só à seção que os mostra.
  const [painel, tabelas, parametros] = await Promise.all([
    lerPainelMaterial(),
    secao === 'anexo-v' || secao === 'sinapi' ? lerTabelasPreco() : null,
    secao === 'parametros' ? lerParametros() : null,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={TEXTO_CADASTRO.titulo} subtitle={TEXTO_CADASTRO.subtitulo} />
      <GerirMaterial secao={secao} painel={painel} tabelas={tabelas} parametros={parametros} />
    </div>
  );
}
