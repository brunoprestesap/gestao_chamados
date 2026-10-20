import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { OPCAO_ESCRITA_PROPRIA } from '@/models/_somente-inclusao';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { ContratoModel } from '@/models/Contrato';
import { DesignacaoMaterialModel } from '@/models/DesignacaoMaterial';
import { EmpenhoModel } from '@/models/Empenho';
import { FaixaCompetenciaModel } from '@/models/FaixaCompetencia';
import { UserModel } from '@/models/user.model';
import type {
  CriarDesignacaoInput,
  CriarEmpenhoInput,
  CriarFaixaInput,
  MovimentoEmpenhoInput,
} from '@/shared/material/cotacao.schemas';
import {
  PAPEIS_DESIGNACAO,
  type PapelDesignacao,
  PERFIS_POR_PAPEL,
  SINAPI_MESES_DE_ATRASO_ACEITOS,
} from '@/shared/material/material.constants';

import { filtroVigente } from './papeis';
import { mesSinapiMaisRecente } from './precos';
import { filtroElegivel, registrarMovimento } from './saldo';

/**
 * Cadastro do Admin em `/configuracoes/material` (spec 0019, AC-19):
 * empenhos e movimentos, faixas e designações. Designação e movimento só são
 * incluídos; faixa não se edita.
 */

type Resultado = { ok: true } | { ok: false; error: string };

export async function criarEmpenho(adminId: string, e: CriarEmpenhoInput): Promise<Resultado> {
  try {
    await EmpenhoModel.create({
      numero: e.numero.trim().toUpperCase(),
      exercicio: e.exercicio,
      valorInicialCentavos: e.valorInicialCentavos,
      valorLiquidoCentavos: e.valorInicialCentavos,
      vigenciaFim: e.vigenciaFim ?? null,
      criadoPorUserId: new Types.ObjectId(adminId),
    });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, error: 'Já existe um empenho com este número.' };
    }
    throw err;
  }
}

export async function movimentarEmpenho(
  adminId: string,
  m: MovimentoEmpenhoInput,
): Promise<Resultado> {
  const ok = await registrarMovimento({ ...m, porUserId: adminId });
  if (ok) return { ok: true };
  return m.tipo === 'anulacao'
    ? { ok: false, error: 'A anulação deixaria o valor líquido abaixo do já comprometido.' }
    : { ok: false, error: 'Empenho não encontrado.' };
}

export async function alterarSituacaoEmpenho(
  empenhoId: string,
  ativo: boolean,
): Promise<Resultado> {
  const r = await EmpenhoModel.updateOne({ _id: empenhoId }, { $set: { ativo } });
  return r.matchedCount ? { ok: true } : { ok: false, error: 'Empenho não encontrado.' };
}

export async function criarFaixa(adminId: string, f: CriarFaixaInput): Promise<Resultado> {
  await FaixaCompetenciaModel.create({
    nome: f.nome,
    limiteCentavos: f.limiteCentavos,
    criadoPorUserId: new Types.ObjectId(adminId),
    em: new Date(),
  });
  return { ok: true };
}

/** A única escrita permitida numa faixa: `ativa: false`. */
export async function desativarFaixa(faixaId: string): Promise<Resultado> {
  const r = await FaixaCompetenciaModel.updateOne(
    { _id: new Types.ObjectId(faixaId), ativa: true },
    { $set: { ativa: false } },
    OPCAO_ESCRITA_PROPRIA,
  );
  return r.modifiedCount
    ? { ok: true }
    : { ok: false, error: 'Faixa não encontrada ou já desativada.' };
}

const MSG_DESIGNACAO_SOBREPOSTA =
  'Esta pessoa já tem designação para este papel num período que se sobrepõe.';

/** Dois intervalos `[início, fim]` (fim vazio é aberto) se cruzam. */
function cruzam(a: { i: string; f: string | null }, b: { i: string; f: string | null }): boolean {
  return a.i <= (b.f ?? '9999-12-31') && b.i <= (a.f ?? '9999-12-31');
}

export async function criarDesignacao(
  adminId: string,
  d: CriarDesignacaoInput,
): Promise<Resultado> {
  const user = await UserModel.findById(d.userId).select('role isActive').lean();
  if (!user || !user.isActive) return { ok: false, error: 'Usuário não encontrado ou inativo.' };
  const papel = d.papel as PapelDesignacao;
  if (!PERFIS_POR_PAPEL[papel].includes(user.role as string)) {
    return {
      ok: false,
      error:
        papel === 'responsavel_tecnico'
          ? 'Responsável técnico só pode ser Preposto ou Técnico.'
          : 'Fiscal, gestor e aprovador só podem ser usuários Admin.',
    };
  }
  if (papel === 'aprovador') {
    const faixa = await FaixaCompetenciaModel.findOne({ _id: d.faixaId, ativa: true }).lean();
    if (!faixa) return { ok: false, error: 'Escolha uma faixa ativa.' };
  }
  // Uma vigente por pessoa e papel: nenhuma outra não revogada pode cruzar o período.
  const outras = await DesignacaoMaterialModel.find({
    userId: new Types.ObjectId(d.userId),
    papel,
    revogadaEm: null,
  })
    .select('vigenciaInicio vigenciaFim')
    .lean();
  const nova = { i: d.vigenciaInicio, f: d.vigenciaFim ?? null };
  const cruzaAlguma = (lista: typeof outras) =>
    lista.some((o) => cruzam(nova, { i: o.vigenciaInicio, f: o.vigenciaFim ?? null }));
  if (cruzaAlguma(outras)) return { ok: false, error: MSG_DESIGNACAO_SOBREPOSTA };
  const criada = await DesignacaoMaterialModel.create({
    userId: new Types.ObjectId(d.userId),
    papel,
    faixaId: papel === 'aprovador' ? new Types.ObjectId(d.faixaId!) : null,
    vigenciaInicio: d.vigenciaInicio,
    vigenciaFim: d.vigenciaFim ?? null,
    ato: d.ato,
    criadoPorUserId: new Types.ObjectId(adminId),
    em: new Date(),
  });
  // Sem transação, dois cadastros ao mesmo tempo passam pela conferência acima.
  // Depois de gravar, fica a de menor `_id`; a outra se revoga (nunca apaga).
  const anteriores = await DesignacaoMaterialModel.find({
    userId: criada.userId,
    papel,
    revogadaEm: null,
    _id: { $lt: criada._id },
  })
    .select('vigenciaInicio vigenciaFim')
    .lean();
  if (cruzaAlguma(anteriores)) {
    await DesignacaoMaterialModel.updateOne(
      { _id: criada._id, revogadaEm: null },
      { $set: { revogadaEm: new Date(), revogadaPorUserId: new Types.ObjectId(adminId) } },
      OPCAO_ESCRITA_PROPRIA,
    );
    return { ok: false, error: MSG_DESIGNACAO_SOBREPOSTA };
  }
  return { ok: true };
}

/** Revogar grava a data, nunca apaga. */
export async function revogarDesignacao(adminId: string, designacaoId: string): Promise<Resultado> {
  const r = await DesignacaoMaterialModel.updateOne(
    { _id: new Types.ObjectId(designacaoId), revogadaEm: null },
    { $set: { revogadaEm: new Date(), revogadaPorUserId: new Types.ObjectId(adminId) } },
    OPCAO_ESCRITA_PROPRIA,
  );
  return r.modifiedCount
    ? { ok: true }
    : { ok: false, error: 'Designação não encontrada ou já revogada.' };
}

// ---------------------------------------------------------------------------
// Leitura para a tela
// ---------------------------------------------------------------------------

export type EmpenhoLinha = {
  id: string;
  numero: string;
  exercicio: number;
  valorInicialCentavos: number;
  valorLiquidoCentavos: number;
  comprometidoCentavos: number;
  saldoCentavos: number;
  vigenciaFim: string | null;
  ativo: boolean;
  elegivel: boolean;
  movimentos: { tipo: string; valorCentavos: number; ato: string; em: string }[];
};

export type FaixaLinha = { id: string; nome: string; limiteCentavos: number; ativa: boolean };

export type DesignacaoLinha = {
  id: string;
  userId: string;
  nome: string;
  papel: PapelDesignacao;
  faixa: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  ato: string;
  revogadaEm: string | null;
  vigente: boolean;
};

export type UsuarioOpcao = { id: string; nome: string; role: string };

export type ItemSemCodigo = { contrato: string; numero: number; descricao: string };

export type PendenciasMaterial = {
  /** O que falta para o fluxo encaminhar e aprovar, e para os caminhos 1 e 2 (AC-30). */
  faltando: string[];
  /** Itens vigentes do Anexo V sem código SINAPI (AC-28). */
  itensSemCodigo: ItemSemCodigo[];
};

export type PainelMaterial = PendenciasMaterial & {
  empenhos: EmpenhoLinha[];
  faixas: FaixaLinha[];
  designacoes: DesignacaoLinha[];
  usuarios: UsuarioOpcao[];
};

const ROTULO_PAPEL_PENDENCIA: Record<PapelDesignacao, string> = {
  responsavel_tecnico: 'responsável técnico',
  fiscal: 'fiscal',
  gestor: 'gestor',
  aprovador: 'aprovador',
};

/** O mês `AAAA-MM` de `n` meses antes de `mes`. */
export function mesesAntes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * O painel do que falta (AC-30, _Painel do que falta_), numa leitura: sem
 * empenho elegível, papel sem designação vigente, contrato ativo e vigente
 * sem Anexo V, SINAPI ausente ou atrasado e itens do Anexo V sem código.
 */
export async function lerPendenciasMaterial(): Promise<PendenciasMaterial> {
  const hoje = hojeEmBelem();
  const [elegiveis, vigentes, contratos, ponteiros, mes] = await Promise.all([
    EmpenhoModel.find(filtroElegivel()).select('_id').lean(),
    DesignacaoMaterialModel.find(filtroVigente(hoje)).select('papel').lean(),
    ContratoModel.find({
      isActive: true,
      vigenciaInicio: { $lte: hoje },
      vigenciaFim: { $gte: hoje },
    })
      .select('numero')
      .sort({ numero: 1 })
      .lean(),
    AnexoVVigenciaModel.find().lean(),
    mesSinapiMaisRecente(),
  ]);

  const faltando: string[] = [];
  if (elegiveis.length === 0) {
    faltando.push('Nenhum empenho elegível (ativo, do exercício e na vigência).');
  }
  const papeisVigentes = new Set(vigentes.map((v) => v.papel));
  for (const p of PAPEIS_DESIGNACAO) {
    if (!papeisVigentes.has(p))
      faltando.push(`Ninguém designado como ${ROTULO_PAPEL_PENDENCIA[p]}.`);
  }

  const ponteiroDe = new Map(ponteiros.map((p) => [String(p.contratoId), p]));
  const comItens = ponteiros.length
    ? await AnexoVItemModel.aggregate<{ _id: Types.ObjectId }>([
        { $match: { $or: ponteiros.map((p) => ({ contratoId: p.contratoId, versao: p.versao })) } },
        { $group: { _id: '$contratoId' } },
      ])
    : [];
  const contratosComItens = new Set(comItens.map((c) => String(c._id)));
  for (const c of contratos) {
    if (!ponteiroDe.has(String(c._id)) || !contratosComItens.has(String(c._id))) {
      faltando.push(`O contrato ${c.numero} não tem Anexo V carregado: o caminho 1 fica fechado.`);
    }
  }

  const mesCorrente = hoje.slice(0, 7);
  if (!mes) {
    faltando.push('Nenhum mês do SINAPI importado: o caminho 2 fica fechado.');
  } else if (mes < mesesAntes(mesCorrente, SINAPI_MESES_DE_ATRASO_ACEITOS)) {
    faltando.push(
      `O SINAPI está atrasado: o mês mais recente importado é ${mes.split('-').reverse().join('/')}.`,
    );
  }

  const numeroContrato = new Map(contratos.map((c) => [String(c._id), c.numero]));
  const semCodigo = ponteiros.length
    ? await AnexoVItemModel.find({
        $or: ponteiros.map((p) => ({ contratoId: p.contratoId, versao: p.versao })),
        sinapiCodigo: null,
      })
        .select('contratoId numero descricao')
        .sort({ contratoId: 1, numero: 1 })
        .lean()
    : [];
  const faltaNumero = semCodigo.filter((s) => !numeroContrato.has(String(s.contratoId)));
  if (faltaNumero.length) {
    const outros = await ContratoModel.find({ _id: { $in: faltaNumero.map((s) => s.contratoId) } })
      .select('numero')
      .lean();
    for (const o of outros) numeroContrato.set(String(o._id), o.numero);
  }
  return {
    faltando,
    itensSemCodigo: semCodigo.map((s) => ({
      contrato: numeroContrato.get(String(s.contratoId)) ?? '—',
      numero: s.numero,
      descricao: s.descricao,
    })),
  };
}

export async function lerPainelMaterial(): Promise<PainelMaterial> {
  const hoje = hojeEmBelem();
  const [empenhos, elegiveis, faixas, designacoes, vigentes, usuarios, pendencias] =
    await Promise.all([
      EmpenhoModel.find().sort({ exercicio: -1, numero: 1 }).lean(),
      EmpenhoModel.find(filtroElegivel()).select('_id').lean(),
      FaixaCompetenciaModel.find().sort({ limiteCentavos: 1 }).lean(),
      DesignacaoMaterialModel.find().sort({ em: -1 }).limit(500).lean(),
      DesignacaoMaterialModel.find(filtroVigente(hoje)).select('_id papel').lean(),
      UserModel.find({ isActive: true, role: { $in: ['Admin', 'Preposto', 'Técnico'] } })
        .select('name role')
        .sort({ name: 1 })
        .lean(),
      lerPendenciasMaterial(),
    ]);
  const elegivel = new Set(elegiveis.map((e) => String(e._id)));
  const vigenteIds = new Set(vigentes.map((v) => String(v._id)));
  const nomeFaixa = new Map(faixas.map((f) => [String(f._id), f.nome]));
  const nomeUser = new Map(usuarios.map((u) => [String(u._id), u.name as string]));
  const faltaUser = designacoes.filter((d) => !nomeUser.has(String(d.userId))).map((d) => d.userId);
  if (faltaUser.length) {
    const outros = await UserModel.find({ _id: { $in: faltaUser } })
      .select('name')
      .lean();
    for (const u of outros) nomeUser.set(String(u._id), u.name as string);
  }

  return {
    ...pendencias,
    empenhos: empenhos.map((e) => ({
      id: String(e._id),
      numero: e.numero,
      exercicio: e.exercicio,
      valorInicialCentavos: e.valorInicialCentavos,
      valorLiquidoCentavos: e.valorLiquidoCentavos,
      comprometidoCentavos: e.comprometidoCentavos,
      saldoCentavos: e.valorLiquidoCentavos - e.comprometidoCentavos,
      vigenciaFim: e.vigenciaFim ?? null,
      ativo: e.ativo,
      elegivel: elegivel.has(String(e._id)),
      movimentos: e.movimentos.map((m) => ({
        tipo: m.tipo,
        valorCentavos: m.valorCentavos,
        ato: m.ato,
        em: m.em.toISOString(),
      })),
    })),
    faixas: faixas.map((f) => ({
      id: String(f._id),
      nome: f.nome,
      limiteCentavos: f.limiteCentavos,
      ativa: f.ativa,
    })),
    designacoes: designacoes.map((d) => ({
      id: String(d._id),
      userId: String(d.userId),
      nome: nomeUser.get(String(d.userId)) ?? '—',
      papel: d.papel as PapelDesignacao,
      faixa: d.faixaId ? (nomeFaixa.get(String(d.faixaId)) ?? null) : null,
      vigenciaInicio: d.vigenciaInicio,
      vigenciaFim: d.vigenciaFim ?? null,
      ato: d.ato,
      revogadaEm: d.revogadaEm ? d.revogadaEm.toISOString() : null,
      vigente: vigenteIds.has(String(d._id)),
    })),
    usuarios: usuarios.map((u) => ({
      id: String(u._id),
      nome: u.name as string,
      role: u.role as string,
    })),
  };
}
