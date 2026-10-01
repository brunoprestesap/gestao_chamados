import { PageHeader } from '@/components/dashboard/header';
import { normalizarCodigo } from '@/lib/ativos/codigo';
import { listarLocaisAtivos } from '@/lib/ativos/localizacao';
import { listarCategoriasAtivas } from '@/lib/ativos/opcoes';
import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';

import { FormAtivo } from '../_components/FormAtivo';

/**
 * Cadastro manual (spec 0011, AC-4). `?tombamento=` vem do atalho "Cadastrar
 * este ativo" da leitura de etiqueta (AC-12) e já abre como patrimoniado.
 */
export default async function NovoAtivoPage({
  searchParams,
}: {
  searchParams: Promise<{ tombamento?: string }>;
}) {
  await requireManager();
  const { tombamento } = await searchParams;
  await dbConnect();
  const [categorias, locais] = await Promise.all([listarCategoriasAtivas(), listarLocaisAtivos()]);
  const lido = tombamento ? normalizarCodigo(tombamento) : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastrar ativo"
        subtitle="O cadastro manual nasce em vistoria. Valide depois de conferir o equipamento no local."
      />
      <FormAtivo
        modo="novo"
        categorias={categorias}
        locais={locais.map((l) => ({ id: l.id, caminho: l.caminho }))}
        inicial={{
          origemCodigo: 'patrimonio',
          tombamento: /^\d+$/.test(lido) ? lido : '',
          descricao: '',
          categoriaId: '',
          localizacaoId: '',
          tierManutencao: '',
          fabricante: '',
          modelo: '',
          numeroSerie: '',
          dataInstalacao: '',
          criticidade: '',
        }}
      />
    </div>
  );
}
