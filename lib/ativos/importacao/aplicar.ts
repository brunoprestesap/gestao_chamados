import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ImportacaoPatrimonialModel } from '@/models/ImportacaoPatrimonial';
import type { Criticidade, TierManutencao } from '@/shared/ativos/ativo.constants';
import {
  ERRO_CATEGORIA_INVALIDA,
  ERRO_IMPORTACAO_FECHADA,
  ERRO_MUITOS_SUMIDOS,
  type GrupoImportacao,
  MOTIVO_BAIXADO,
  MOTIVO_JA_EXISTIA,
  MOTIVO_MUDOU,
  MOTIVO_NAO_ENCONTRADO,
  MOTIVO_NAO_MARCADO,
  OBSERVACAO_IMPORTACAO,
} from '@/shared/ativos/importacao.constants';

import { gravarHistoricoOuDesfazer } from '../auditoria';
import { ehChaveDuplicada, falha, type Resultado } from '../erros';
import { mesmoValorPatrimonial, rotuloCampoPatrimonial } from '../patrimonial';
import type { CampoAlterado, DadosNovo } from './diferenca';
import { contarResultado, unsetEnxugamento } from './enxugar';
import { contarVistosPeloSicam, ehMuitosSumidos } from './pendente';

/**
 * Aplicação da importação (spec 0012, AC-23 e AC-24). Cada item é uma escrita
 * condicional que só passa se o ativo ainda estiver como a revisão viu, então
 * repetir Aplicar (duas abas, clique duplo, queda no meio) não duplica ativo
 * nem histórico. Num ativo existente, só escreve dentro de
 * `camposPatrimoniais`, campo a campo, nunca o objeto inteiro.
 */

export type SelecaoAplicacao = {
  novos: { codigo: string; categoriaId: string }[];
  alterados: string[];
  sumidos: string[];
  confirmaMuitosSumidos?: boolean;
};

type PorGrupo = { novos: number; alterados: number; sumidos: number };
export type ResultadoAplicacao = {
  aplicados: PorGrupo;
  pulados: PorGrupo;
  concluida: boolean;
};

type ItemLean = {
  grupo: GrupoImportacao;
  codigo: string;
  retornou?: boolean;
  tier?: TierManutencao;
  aplicado?: boolean;
  motivoPulo?: string;
  camposAlterados?: CampoAlterado[];
  dados?: DadosNovo;
};

type ImportacaoLean = {
  _id: Types.ObjectId;
  status: string;
  contagens: { sumidos: number };
  itens: ItemLean[];
};

type Desfecho = { aplicado: true } | { aplicado: false; motivo: string };

const CP = 'camposPatrimoniais';

/** Marca o item como aplicado (vence um pulo gravado por uma corrida perdida). */
async function marcarAplicado(
  importacaoId: Types.ObjectId,
  item: ItemLean,
  extra: Record<string, unknown> = {},
) {
  await ImportacaoPatrimonialModel.updateOne(
    { _id: importacaoId },
    {
      $set: { 'itens.$[i].aplicado': true, ...prefixar('itens.$[i].', extra) },
      $unset: { 'itens.$[i].motivoPulo': 1 },
    },
    { arrayFilters: [{ 'i.codigo': item.codigo, 'i.grupo': item.grupo }] },
  );
}

/** Marca o pulo, só se ninguém aplicou o item antes. */
async function marcarPulo(importacaoId: Types.ObjectId, item: ItemLean, motivo: string) {
  await ImportacaoPatrimonialModel.updateOne(
    { _id: importacaoId },
    { $set: { 'itens.$[i].motivoPulo': motivo } },
    {
      arrayFilters: [
        { 'i.codigo': item.codigo, 'i.grupo': item.grupo, 'i.aplicado': { $ne: true } },
      ],
    },
  );
}

function prefixar(prefixo: string, obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [`${prefixo}${k}`, v]));
}

async function aplicarNovo(
  item: ItemLean,
  categoria: { _id: Types.ObjectId; criticidadePadrao: Criticidade },
  autorId: string,
  agora: Date,
): Promise<Desfecho> {
  const dados = item.dados;
  if (!dados || !item.tier) return { aplicado: false, motivo: MOTIVO_NAO_ENCONTRADO };
  const id = new Types.ObjectId();
  try {
    await AtivoModel.create({
      _id: id,
      codigo: item.codigo,
      origemCodigo: 'patrimonio',
      tombamento: item.codigo,
      descricao: dados.descricao,
      categoriaId: categoria._id,
      localizacaoId: null,
      numeroSerie: dados.numeroSerie ?? null,
      criticidade: categoria.criticidadePadrao,
      tierManutencao: item.tier,
      status: 'em_operacao',
      statusCadastro: 'importado',
      camposPatrimoniais: { ...dados.camposPatrimoniais, importadoEm: agora },
    });
  } catch (e) {
    if (ehChaveDuplicada(e)) return { aplicado: false, motivo: MOTIVO_JA_EXISTIA };
    throw e;
  }
  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: id,
        acao: 'cadastro',
        actorType: 'usuario',
        autorId: new Types.ObjectId(autorId),
        para: item.codigo,
        observacao: OBSERVACAO_IMPORTACAO,
      }),
    () => AtivoModel.deleteOne({ _id: id }),
  );
  return { aplicado: true };
}

/** Condição "o campo ainda tem o valor de antes", por caminho. */
function condicaoAntes(c: CampoAlterado): Record<string, unknown> {
  return c.antes === undefined
    ? { [`${CP}.${c.campo}`]: { $exists: false } }
    : { [`${CP}.${c.campo}`]: c.antes };
}

async function aplicarAlterado(item: ItemLean, autorId: string, agora: Date): Promise<Desfecho> {
  const campos = item.camposAlterados ?? [];
  const atual = await AtivoModel.findOne({ codigo: item.codigo, origemCodigo: 'patrimonio' })
    .select(`_id ${CP}`)
    .lean<{ _id: Types.ObjectId; camposPatrimoniais?: Record<string, unknown> | null }>();
  if (!atual) return { aplicado: false, motivo: MOTIVO_NAO_ENCONTRADO };
  const tinhaPatrimoniais = !!atual.camposPatrimoniais;

  const filtro: Record<string, unknown> = { _id: atual._id };
  if (!tinhaPatrimoniais) filtro[CP] = { $exists: false };
  for (const c of campos) Object.assign(filtro, condicaoAntes(c));
  if (item.retornou) filtro[`${CP}.ausenteNoSicamDesde`] = { $exists: true };

  const set: Record<string, unknown> = { [`${CP}.importadoEm`]: agora };
  for (const c of campos) set[`${CP}.${c.campo}`] = c.depois;
  const update: Record<string, unknown> = { $set: set };
  if (item.retornou) update.$unset = { [`${CP}.ausenteNoSicamDesde`]: 1 };

  const r = await AtivoModel.updateOne(filtro, update);
  if (r.modifiedCount !== 1) {
    // Outra aplicação (aba, clique duplo, ou antes de uma queda) já deixou o ativo como o arquivo.
    const agoraNoBanco = await AtivoModel.findById(atual._id)
      .select(CP)
      .lean<{ camposPatrimoniais?: Record<string, unknown> | null }>();
    const cp = agoraNoBanco?.camposPatrimoniais;
    const jaFeito =
      !!cp?.importadoEm &&
      campos.every((c) => mesmoValorPatrimonial(c.campo, cp[c.campo], c.depois)) &&
      (!item.retornou || !cp.ausenteNoSicamDesde);
    return jaFeito ? { aplicado: true } : { aplicado: false, motivo: MOTIVO_MUDOU };
  }

  const historicos: Record<string, unknown>[] = [];
  if (campos.length > 0 || !tinhaPatrimoniais) {
    historicos.push({
      ativoId: atual._id,
      acao: 'importacao_patrimonial',
      actorType: 'usuario',
      autorId: new Types.ObjectId(autorId),
      // Só os nomes dos campos, nunca os valores (nome e matrícula, LGPD).
      observacao:
        campos.length > 0
          ? `${OBSERVACAO_IMPORTACAO}: ${campos.map((c) => rotuloCampoPatrimonial(c.campo)).join(', ')}`
          : `${OBSERVACAO_IMPORTACAO}: dados patrimoniais vinculados`,
    });
  }
  if (item.retornou) {
    historicos.push({
      ativoId: atual._id,
      acao: 'retorno_sicam',
      actorType: 'usuario',
      autorId: new Types.ObjectId(autorId),
      observacao: OBSERVACAO_IMPORTACAO,
    });
  }

  await gravarHistoricoOuDesfazer(
    () => AtivoHistoryModel.insertMany(historicos),
    () => {
      if (!tinhaPatrimoniais)
        return AtivoModel.updateOne({ _id: atual._id }, { $unset: { [CP]: 1 } });
      const desfazSet: Record<string, unknown> = {};
      const desfazUnset: Record<string, 1> = {};
      const anterior = atual.camposPatrimoniais ?? {};
      for (const k of ['importadoEm', 'ausenteNoSicamDesde', ...campos.map((c) => c.campo)]) {
        if (anterior[k] === undefined) desfazUnset[`${CP}.${k}`] = 1;
        else desfazSet[`${CP}.${k}`] = anterior[k];
      }
      return AtivoModel.updateOne(
        { _id: atual._id },
        {
          ...(Object.keys(desfazSet).length && { $set: desfazSet }),
          ...(Object.keys(desfazUnset).length && { $unset: desfazUnset }),
        },
      );
    },
  );
  return { aplicado: true };
}

async function aplicarSumido(item: ItemLean, autorId: string, agora: Date): Promise<Desfecho> {
  const r = await AtivoModel.findOneAndUpdate(
    {
      codigo: item.codigo,
      origemCodigo: 'patrimonio',
      status: { $ne: 'baixado' },
      [`${CP}.importadoEm`]: { $exists: true },
      [`${CP}.ausenteNoSicamDesde`]: { $exists: false },
    },
    { $set: { [`${CP}.ausenteNoSicamDesde`]: agora } },
    { projection: { _id: 1 } },
  ).lean<{ _id: Types.ObjectId }>();

  if (!r) {
    const atual = await AtivoModel.findOne({ codigo: item.codigo, origemCodigo: 'patrimonio' })
      .select(`status ${CP}.ausenteNoSicamDesde`)
      .lean<{ status: string; camposPatrimoniais?: { ausenteNoSicamDesde?: Date } | null }>();
    if (!atual) return { aplicado: false, motivo: MOTIVO_NAO_ENCONTRADO };
    // Só o importador marca, e só há uma pendente: a marca veio desta importação.
    if (atual.camposPatrimoniais?.ausenteNoSicamDesde) return { aplicado: true };
    if (atual.status === 'baixado') return { aplicado: false, motivo: MOTIVO_BAIXADO };
    return { aplicado: false, motivo: MOTIVO_MUDOU };
  }

  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: r._id,
        acao: 'ausente_sicam',
        actorType: 'usuario',
        autorId: new Types.ObjectId(autorId),
        observacao: OBSERVACAO_IMPORTACAO,
      }),
    () => AtivoModel.updateOne({ _id: r._id }, { $unset: { [`${CP}.ausenteNoSicamDesde`]: 1 } }),
  );
  return { aplicado: true };
}

export async function aplicarImportacao(
  id: string,
  selecao: SelecaoAplicacao,
  autorId: string,
): Promise<Resultado<{ resultado: ResultadoAplicacao }>> {
  if (!Types.ObjectId.isValid(id)) return falha(ERRO_IMPORTACAO_FECHADA);
  const importacao = await ImportacaoPatrimonialModel.findOne({ _id: id, status: 'pendente' })
    .select('status contagens itens')
    .lean<ImportacaoLean>();
  if (!importacao) return falha(ERRO_IMPORTACAO_FECHADA);

  const abertos = importacao.itens.filter((i) => !i.aplicado && !i.motivoPulo);
  const codigosNoGrupo = (g: GrupoImportacao) =>
    new Set(abertos.filter((i) => i.grupo === g).map((i) => i.codigo));

  // Categoria: cada novo marcado precisa de uma categoria ativa, conferida aqui.
  const novosAbertos = codigosNoGrupo('novo');
  const categoriaDoNovo = new Map(
    selecao.novos.filter((n) => novosAbertos.has(n.codigo)).map((n) => [n.codigo, n.categoriaId]),
  );
  const idsCategoria = [...new Set(categoriaDoNovo.values())];
  if (idsCategoria.some((c) => !Types.ObjectId.isValid(c))) return falha(ERRO_CATEGORIA_INVALIDA);
  const categorias = idsCategoria.length
    ? await CategoriaAtivoModel.find({ _id: { $in: idsCategoria }, isActive: true })
        .select('criticidadePadrao')
        .lean<{ _id: Types.ObjectId; criticidadePadrao: Criticidade }[]>()
    : [];
  if (categorias.length !== idsCategoria.length) return falha(ERRO_CATEGORIA_INVALIDA);
  const categoriaPorId = new Map(categorias.map((c) => [String(c._id), c]));

  const sumidosMarcados = new Set(selecao.sumidos.filter((c) => codigosNoGrupo('sumido').has(c)));
  if (sumidosMarcados.size > 0 && !selecao.confirmaMuitosSumidos) {
    const vistos = await contarVistosPeloSicam();
    if (ehMuitosSumidos(importacao.contagens.sumidos, vistos)) return falha(ERRO_MUITOS_SUMIDOS);
  }
  const alteradosMarcados = new Set(selecao.alterados);

  const agora = new Date();
  for (const item of abertos) {
    let desfecho: Desfecho;
    let extra: Record<string, unknown> = {};
    if (item.grupo === 'novo') {
      const categoriaId = categoriaDoNovo.get(item.codigo);
      if (!categoriaId) {
        desfecho = { aplicado: false, motivo: MOTIVO_NAO_MARCADO };
      } else {
        extra = { categoriaId: new Types.ObjectId(categoriaId) };
        desfecho = await aplicarNovo(item, categoriaPorId.get(categoriaId)!, autorId, agora);
      }
    } else if (item.grupo === 'alterado') {
      desfecho = alteradosMarcados.has(item.codigo)
        ? await aplicarAlterado(item, autorId, agora)
        : { aplicado: false, motivo: MOTIVO_NAO_MARCADO };
    } else {
      desfecho = sumidosMarcados.has(item.codigo)
        ? await aplicarSumido(item, autorId, agora)
        : { aplicado: false, motivo: MOTIVO_NAO_MARCADO };
    }
    if (desfecho.aplicado) await marcarAplicado(importacao._id, item, extra);
    else await marcarPulo(importacao._id, item, desfecho.motivo);
  }

  return fecharSeConcluida(importacao._id, autorId);
}

/** Com todos os itens resolvidos, fecha como `aplicada` e enxuga na mesma escrita. */
async function fecharSeConcluida(
  id: Types.ObjectId,
  autorId: string,
): Promise<Resultado<{ resultado: ResultadoAplicacao }>> {
  const depois = await ImportacaoPatrimonialModel.findById(id)
    .select('status itens.grupo itens.aplicado itens.motivoPulo')
    .lean<{ status: string; itens: Parameters<typeof contarResultado>[0] }>();
  if (!depois) return falha(ERRO_IMPORTACAO_FECHADA);
  const { aplicados, pulados } = contarResultado(depois.itens);
  const concluida = depois.itens.every((i) => i.aplicado || i.motivoPulo);

  if (concluida && depois.status === 'pendente') {
    await ImportacaoPatrimonialModel.updateOne(
      { _id: id, status: 'pendente' },
      {
        $set: {
          status: 'aplicada',
          aplicadaPor: new Types.ObjectId(autorId),
          aplicadaEm: new Date(),
          'contagens.aplicados': aplicados,
          'contagens.pulados': pulados,
        },
        $unset: unsetEnxugamento(),
      },
    );
  }
  return { ok: true, resultado: { aplicados, pulados, concluida } };
}
