import { Types } from 'mongoose';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/dashboard/header';
import { listarLocaisAtivos } from '@/lib/ativos/localizacao';
import { listarCategoriasAtivas } from '@/lib/ativos/opcoes';
import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import type { Criticidade, OrigemCodigo, TierManutencao } from '@/shared/ativos/ativo.constants';

import { FormAtivo } from '../../_components/FormAtivo';

/** Data `AAAA-MM-DD` para o `<input type="date">`. */
function paraInputData(d?: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export default async function EditarAtivoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  await dbConnect();

  const ativo = await AtivoModel.findById(id).lean();
  if (!ativo) notFound();

  const [categorias, locais] = await Promise.all([listarCategoriasAtivas(), listarLocaisAtivos()]);
  // Categoria atual desativada: continua na lista para o formulário não perder o valor.
  if (!categorias.some((c) => c.id === String(ativo.categoriaId))) {
    const atual = await CategoriaAtivoModel.findById(ativo.categoriaId).lean();
    if (atual) {
      categorias.push({
        id: String(atual._id),
        nome: `${atual.nome} (desativada)`,
        criticidadePadrao: atual.criticidadePadrao as Criticidade,
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Editar ativo ${ativo.codigo}`} subtitle={ativo.descricao} />
      <FormAtivo
        modo="editar"
        ativoId={String(ativo._id)}
        codigo={ativo.codigo}
        categorias={categorias}
        locais={locais.map((l) => ({ id: l.id, caminho: l.caminho }))}
        inicial={{
          origemCodigo: ativo.origemCodigo as OrigemCodigo,
          tombamento: ativo.tombamento ?? '',
          descricao: ativo.descricao,
          categoriaId: String(ativo.categoriaId),
          localizacaoId: ativo.localizacaoId ? String(ativo.localizacaoId) : '',
          tierManutencao: ativo.tierManutencao as TierManutencao,
          fabricante: ativo.fabricante ?? '',
          modelo: ativo.modelo ?? '',
          numeroSerie: ativo.numeroSerie ?? '',
          dataInstalacao: paraInputData(ativo.dataInstalacao),
          criticidade: ativo.criticidade as Criticidade,
        }}
      />
    </div>
  );
}
