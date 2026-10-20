import 'server-only';

import { Types } from 'mongoose';

import { somarDias } from '@/lib/ativos/documentos/situacao';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ContratoModel } from '@/models/Contrato';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { CotacaoMaterialTentativaModel } from '@/models/CotacaoMaterialTentativa';
import { EmpenhoModel } from '@/models/Empenho';
import type { PeriodoRelatorioMaterial } from '@/shared/material/cotacao.schemas';
import {
  RELATORIO_MATERIAL_MAX_ATIVOS,
  type SituacaoCotacao,
  SITUACOES_JA_AUTORIZADAS,
  SITUACOES_NO_CUSTO,
} from '@/shared/material/material.constants';
import { emMilesimos, valorDaLinhaCentavos } from '@/shared/material/valores';

import { type Projecao, projecoesDosEmpenhos } from './projecao';

/**
 * O relatório de material (spec 0019, AC-41), só do Admin. Cada indicador
 * entra no período pela data do próprio fato (tabela em _Fatia 5: regras
 * finas_); o consumo do Anexo V e o saldo dos empenhos não têm período.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

/** Uma fração com numerador e denominador; denominador zero é "sem cotações no período". */
export type Fracao = { numerador: number; denominador: number };

export type RelatorioMaterial = {
  periodo: PeriodoRelatorioMaterial;
  tempoAutorizacao: { quantidade: number; mediaDias: number | null; medianaDias: number | null };
  devolvidas: Fracao;
  impedimentoPrimeiraTentativa: Fracao;
  custoPorAtivo: {
    ativos: { ativoId: string; rotulo: string; cotacoes: number; valorCentavos: number }[];
    totalCentavos: number;
    semAtivoCentavos: number;
  };
  divergencia: { cotacoes: number; comDiferenca: number; diferencaCentavos: number };
  urgencias: {
    id: string;
    numero: string;
    chamado: string | null;
    situacao: SituacaoCotacao;
    decisao: 'aceita' | 'recusada' | null;
    pesquisaCompleta: boolean;
  }[];
  fracionamento: { id: string; numero: string }[];
  consumoAnexoV: {
    contrato: string;
    numero: number;
    descricao: string;
    unidade: string;
    estimada: number;
    consumida: number;
    acima: boolean;
  }[];
  anexoVSinapi: {
    itensComEquivalente: number;
    diferencaCentavos: number;
    itensSemEquivalente: number;
    semEquivalenteCentavos: number;
  };
  empenhos: (Projecao & { numero: string; exercicio: number })[];
};

/** O período em instantes: do início do primeiro dia ao início do dia seguinte ao último, em Belém. */
export function intervaloDoPeriodo(p: PeriodoRelatorioMaterial): { de: Date; ate: Date } {
  return {
    de: new Date(`${p.inicio}T00:00:00.000-03:00`),
    ate: new Date(`${somarDias(p.fim, 1)}T00:00:00.000-03:00`),
  };
}

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

/** A primeira vez de cada cotação num conjunto de eventos ou tentativas. */
async function primeiros(
  modelo: typeof CotacaoMaterialEventoModel | typeof CotacaoMaterialTentativaModel,
  filtro: Record<string, unknown>,
): Promise<Map<string, Date>> {
  const linhas = await (modelo as typeof CotacaoMaterialEventoModel).aggregate<{
    _id: Types.ObjectId;
    em: Date;
  }>([{ $match: filtro }, { $group: { _id: '$cotacaoId', em: { $min: '$em' } } }]);
  return new Map(linhas.map((l) => [String(l._id), l.em]));
}

const naJanela = (d: Date, de: Date, ate: Date) =>
  d.getTime() >= de.getTime() && d.getTime() < ate.getTime();

async function consumoDoAnexoV(): Promise<RelatorioMaterial['consumoAnexoV']> {
  const ponteiros = await AnexoVVigenciaModel.find().lean();
  if (ponteiros.length === 0) return [];
  const [vigentes, contratos, consumo] = await Promise.all([
    AnexoVItemModel.find({
      $or: ponteiros.map((p) => ({ contratoId: p.contratoId, versao: p.versao })),
    })
      .select('contratoId numero descricao unidade quantidadeEstimada')
      .sort({ numero: 1 })
      .lean(),
    ContratoModel.find({ _id: { $in: ponteiros.map((p) => p.contratoId) } })
      .select('numero')
      .lean(),
    // A soma do AC-39 sem cotação atual: executado das executadas e atestadas,
    // quantidade das autorizadas, por número do Anexo V no contrato (qualquer versão).
    CotacaoMaterialModel.aggregate<{
      _id: { contratoId: Types.ObjectId; numero: number };
      milesimos: number;
    }>([
      {
        $match: {
          situacao: { $in: SITUACOES_JA_AUTORIZADAS },
          'itens.anexoVItemId': { $ne: null },
        },
      },
      { $unwind: '$itens' },
      { $match: { 'itens.anexoVItemId': { $ne: null } } },
      {
        $lookup: {
          from: AnexoVItemModel.collection.collectionName,
          localField: 'itens.anexoVItemId',
          foreignField: '_id',
          as: 'anexo',
        },
      },
      { $unwind: '$anexo' },
      {
        $group: {
          _id: { contratoId: '$anexo.contratoId', numero: '$anexo.numero' },
          milesimos: {
            $sum: {
              $round: [
                {
                  $multiply: [
                    {
                      $cond: [
                        { $eq: ['$situacao', 'autorizada'] },
                        '$itens.quantidade',
                        { $ifNull: ['$itens.quantidadeExecutada', 0] },
                      ],
                    },
                    1000,
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);
  const numeroDoContrato = new Map(contratos.map((c) => [String(c._id), c.numero]));
  const consumido = new Map(
    consumo.map((c) => [`${String(c._id.contratoId)}:${c._id.numero}`, c.milesimos]),
  );
  return vigentes
    .map((v) => {
      const milesimos = consumido.get(`${String(v.contratoId)}:${v.numero}`) ?? 0;
      return {
        contrato: numeroDoContrato.get(String(v.contratoId)) ?? '—',
        numero: v.numero,
        descricao: v.descricao,
        unidade: v.unidade,
        estimada: v.quantidadeEstimada,
        consumida: milesimos / 1000,
        acima: milesimos > emMilesimos(v.quantidadeEstimada),
      };
    })
    .filter((l) => l.consumida > 0)
    .sort((a, b) => b.consumida / b.estimada - a.consumida / a.estimada);
}

export async function lerRelatorioMaterial(
  periodo: PeriodoRelatorioMaterial,
  agora: Date = new Date(),
): Promise<RelatorioMaterial> {
  const { de, ate } = intervaloDoPeriodo(periodo);
  const entre = { $gte: de, $lt: ate };

  const [
    autorizadas,
    primeirosEnvios,
    primeirasTentativas,
    executadas,
    urgentes,
    eventosFracionamento,
    consumoAnexoV,
    empenhos,
  ] = await Promise.all([
    CotacaoMaterialModel.find({ autorizadoEm: entre })
      .select(
        'situacao autorizadoEm itens.quantidade itens.anexoVPrecoCentavos itens.sinapiPrecoCentavos',
      )
      .lean(),
    primeiros(CotacaoMaterialEventoModel, { acao: 'enviar' }),
    primeiros(CotacaoMaterialTentativaModel, { acao: 'enviar' }),
    CotacaoMaterialModel.find({ situacao: { $in: SITUACOES_NO_CUSTO }, executadoEm: entre })
      .select('ativoId valorAutorizadoCentavos valorExecutadoCentavos')
      .lean(),
    CotacaoMaterialModel.find({ 'urgencia.pedidaEm': entre })
      .select('numero chamadoId situacao urgencia')
      .sort({ 'urgencia.pedidaEm': 1 })
      .lean(),
    CotacaoMaterialEventoModel.find({ em: entre, advertenciasNoAto: 'fracionamento' })
      .select('cotacaoId')
      .lean(),
    consumoDoAnexoV(),
    EmpenhoModel.find({ ativo: true })
      .select('numero exercicio valorLiquidoCentavos comprometidoCentavos')
      .sort({ exercicio: -1, numero: 1 })
      .lean(),
  ]);

  // Tempo entre o primeiro envio e a autorização, pela data da autorização.
  const tempos = autorizadas
    .map((c) => {
      const envio = primeirosEnvios.get(String(c._id));
      return envio && c.autorizadoEm ? (c.autorizadoEm.getTime() - envio.getTime()) / MS_DIA : null;
    })
    .filter((t): t is number => t != null && t >= 0);

  // Devolvidas, sobre as cotações com primeiro envio no período (o `alterar` não conta).
  const enviadasNoPeriodo = [...primeirosEnvios]
    .filter(([, em]) => naJanela(em, de, ate))
    .map(([id]) => new Types.ObjectId(id));
  const devolvidas = enviadasNoPeriodo.length
    ? await CotacaoMaterialEventoModel.distinct('cotacaoId', {
        cotacaoId: { $in: enviadasNoPeriodo },
        acao: { $in: ['devolver', 'urgencia_recusada'] },
      })
    : [];

  // Impedimento na primeira tentativa: a menor data entre a tentativa e o envio.
  let comTentativa = 0;
  let impedidas = 0;
  for (const id of new Set([...primeirosEnvios.keys(), ...primeirasTentativas.keys()])) {
    const envio = primeirosEnvios.get(id);
    const tentativa = primeirasTentativas.get(id);
    const primeira = [envio, tentativa]
      .filter((d): d is Date => !!d)
      .reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
    if (!naJanela(primeira, de, ate)) continue;
    comTentativa++;
    if (tentativa && (!envio || tentativa.getTime() < envio.getTime())) impedidas++;
  }

  // Custo de material por equipamento e divergência, pela data da execução.
  const porAtivo = new Map<string, { cotacoes: number; valorCentavos: number }>();
  let totalCentavos = 0;
  let semAtivoCentavos = 0;
  let comDiferenca = 0;
  let diferencaCentavos = 0;
  for (const c of executadas) {
    const valor = c.valorExecutadoCentavos ?? 0;
    totalCentavos += valor;
    if (c.ativoId) {
      const a = porAtivo.get(String(c.ativoId)) ?? { cotacoes: 0, valorCentavos: 0 };
      porAtivo.set(String(c.ativoId), {
        cotacoes: a.cotacoes + 1,
        valorCentavos: a.valorCentavos + valor,
      });
    } else {
      semAtivoCentavos += valor;
    }
    const diferenca = (c.valorAutorizadoCentavos ?? 0) - valor;
    if (diferenca !== 0) comDiferenca++;
    diferencaCentavos += diferenca;
  }
  const maiores = [...porAtivo]
    .sort((a, b) => b[1].valorCentavos - a[1].valorCentavos)
    .slice(0, RELATORIO_MATERIAL_MAX_ATIVOS);
  const ativos = maiores.length
    ? await AtivoModel.find({ _id: { $in: maiores.map(([id]) => new Types.ObjectId(id)) } })
        .select('codigo descricao')
        .lean()
    : [];
  const rotuloAtivo = new Map(ativos.map((a) => [String(a._id), `${a.codigo} · ${a.descricao}`]));

  // Diferença Anexo V e SINAPI pela autorização, qualquer que seja a base aplicada (CA-30).
  const anexoVSinapi = {
    itensComEquivalente: 0,
    diferencaCentavos: 0,
    itensSemEquivalente: 0,
    semEquivalenteCentavos: 0,
  };
  for (const c of autorizadas) {
    if (!SITUACOES_JA_AUTORIZADAS.includes(c.situacao as SituacaoCotacao)) continue;
    for (const i of c.itens) {
      if (i.anexoVPrecoCentavos == null) continue;
      const anexo = valorDaLinhaCentavos(i.quantidade, i.anexoVPrecoCentavos);
      if (i.sinapiPrecoCentavos != null) {
        anexoVSinapi.itensComEquivalente++;
        anexoVSinapi.diferencaCentavos +=
          anexo - valorDaLinhaCentavos(i.quantidade, i.sinapiPrecoCentavos);
      } else {
        anexoVSinapi.itensSemEquivalente++;
        anexoVSinapi.semEquivalenteCentavos += anexo;
      }
    }
  }

  // Urgências e fracionamento: listas com o número da cotação e do chamado.
  const idsFracionamento = [...new Set(eventosFracionamento.map((e) => String(e.cotacaoId)))];
  const [cotacoesFracionadas, chamados] = await Promise.all([
    idsFracionamento.length
      ? CotacaoMaterialModel.find({
          _id: { $in: idsFracionamento.map((i) => new Types.ObjectId(i)) },
        })
          .select('numero')
          .sort({ numero: 1 })
          .lean()
      : [],
    urgentes.length
      ? ChamadoModel.find({ _id: { $in: urgentes.map((u) => u.chamadoId) } })
          .select('ticket_number')
          .lean()
      : [],
  ]);
  const numeroDoChamado = new Map(chamados.map((c) => [String(c._id), c.ticket_number as string]));

  const projecoes = await projecoesDosEmpenhos(
    empenhos.map((e) => ({
      id: String(e._id),
      saldoCentavos: e.valorLiquidoCentavos - e.comprometidoCentavos,
    })),
    agora,
  );

  return {
    periodo,
    tempoAutorizacao: {
      quantidade: tempos.length,
      mediaDias: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
      medianaDias: mediana(tempos),
    },
    devolvidas: { numerador: devolvidas.length, denominador: enviadasNoPeriodo.length },
    impedimentoPrimeiraTentativa: { numerador: impedidas, denominador: comTentativa },
    custoPorAtivo: {
      ativos: maiores.map(([id, v]) => ({
        ativoId: id,
        rotulo: rotuloAtivo.get(id) ?? 'Equipamento não encontrado',
        ...v,
      })),
      totalCentavos,
      semAtivoCentavos,
    },
    divergencia: { cotacoes: executadas.length, comDiferenca, diferencaCentavos },
    urgencias: urgentes.map((u) => ({
      id: String(u._id),
      numero: u.numero,
      chamado: numeroDoChamado.get(String(u.chamadoId)) ?? null,
      situacao: u.situacao as SituacaoCotacao,
      decisao: (u.urgencia?.decisao as 'aceita' | 'recusada' | null | undefined) ?? null,
      pesquisaCompleta: !!u.urgencia?.pesquisaCompletaEm,
    })),
    fracionamento: cotacoesFracionadas.map((c) => ({ id: String(c._id), numero: c.numero })),
    consumoAnexoV,
    anexoVSinapi,
    empenhos: projecoes.map((p, n) => ({
      ...p,
      numero: empenhos[n]!.numero,
      exercicio: empenhos[n]!.exercicio,
    })),
  };
}
