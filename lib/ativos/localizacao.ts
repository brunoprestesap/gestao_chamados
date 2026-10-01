import 'server-only';

import { Types } from 'mongoose';

import { escapeRegex } from '@/lib/regex';
import { AtivoModel } from '@/models/Ativo';
import { LocalizacaoModel } from '@/models/Localizacao';
import { ERRO_LOCAL_REPETIDO, type LocalizacaoTipo } from '@/shared/ativos/ativo.constants';

import { ehChaveDuplicada, falha, type Resultado } from './erros';

/**
 * A árvore de locais (spec 0011, AC-1 e AC-2). Só `predio` fica na raiz e
 * `predio` nunca tem pai. `caminho` é materializado: sem transação no Mongo,
 * a regra "caminho = caminho do pai + / + nome" se garante recalculando a
 * subárvore inteira a partir do banco depois de cada mudança de nome ou pai.
 * Repetir o recálculo conserta qualquer falha parcial.
 */

type NoLean = {
  _id: Types.ObjectId;
  nome: string;
  tipo: LocalizacaoTipo;
  parentId?: Types.ObjectId | null;
  caminho: string;
  isActive: boolean;
};

function caminhoDe(pai: { caminho: string } | null, nome: string): string {
  return pai ? `${pai.caminho}/${nome}` : nome;
}

/** Regra da raiz: `predio` sem pai; todo outro tipo com pai. */
function erroDeRaiz(tipo: LocalizacaoTipo, temPai: boolean): string | null {
  if (tipo === 'predio' && temPai) return 'Prédio fica sempre na raiz, sem local acima dele.';
  if (tipo !== 'predio' && !temPai) return 'Só prédio fica na raiz. Escolha o local acima deste.';
  return null;
}

async function paiAtivo(parentId: string): Promise<NoLean | null> {
  if (!Types.ObjectId.isValid(parentId)) return null;
  return LocalizacaoModel.findOne({ _id: parentId, isActive: true }).lean<NoLean>();
}

/**
 * Recalcula `caminho` do nó e de todos os descendentes, de cima para baixo,
 * lendo o pai do banco a cada nível. Idempotente.
 */
export async function recalcularSubarvore(raizId: Types.ObjectId | string): Promise<number> {
  const raiz = await LocalizacaoModel.findById(raizId).lean<NoLean>();
  if (!raiz) return 0;
  const pai = raiz.parentId
    ? await LocalizacaoModel.findById(raiz.parentId).select('caminho').lean<{ caminho: string }>()
    : null;

  let atualizados = 0;
  let nivel: { id: Types.ObjectId; caminho: string }[] = [];
  const caminhoRaiz = caminhoDe(pai, raiz.nome);
  if (raiz.caminho !== caminhoRaiz) {
    await LocalizacaoModel.updateOne({ _id: raiz._id }, { $set: { caminho: caminhoRaiz } });
    atualizados++;
  }
  nivel = [{ id: raiz._id, caminho: caminhoRaiz }];

  while (nivel.length > 0) {
    const caminhoPorPai = new Map(nivel.map((n) => [String(n.id), n.caminho]));
    const filhos = await LocalizacaoModel.find({ parentId: { $in: nivel.map((n) => n.id) } })
      .select('nome parentId caminho')
      .lean<NoLean[]>();
    const proximo: typeof nivel = [];
    const ops = [];
    for (const f of filhos) {
      const caminho = `${caminhoPorPai.get(String(f.parentId))}/${f.nome}`;
      if (f.caminho !== caminho) {
        ops.push({ updateOne: { filter: { _id: f._id }, update: { $set: { caminho } } } });
      }
      proximo.push({ id: f._id, caminho });
    }
    if (ops.length) {
      await LocalizacaoModel.bulkWrite(ops);
      atualizados += ops.length;
    }
    nivel = proximo;
  }
  return atualizados;
}

/** `true` quando `candidatoId` é o próprio nó ou está abaixo dele (subindo pelos pais). */
async function ehDescendente(noId: string, candidatoId: string): Promise<boolean> {
  let atual: string | null = candidatoId;
  const visitados = new Set<string>();
  while (atual) {
    if (atual === noId) return true;
    if (visitados.has(atual)) return true; // ciclo já existente: recusa por segurança
    visitados.add(atual);
    const no: { parentId?: Types.ObjectId | null } | null = await LocalizacaoModel.findById(atual)
      .select('parentId')
      .lean<{ parentId?: Types.ObjectId | null }>();
    atual = no?.parentId ? String(no.parentId) : null;
  }
  return false;
}

export async function criarLocalizacao(input: {
  nome: string;
  tipo: LocalizacaoTipo;
  parentId?: string;
  unitId?: string;
}): Promise<Resultado<{ id: string }>> {
  const erroRaiz = erroDeRaiz(input.tipo, !!input.parentId);
  if (erroRaiz) return falha(erroRaiz);

  const pai = input.parentId ? await paiAtivo(input.parentId) : null;
  if (input.parentId && !pai) return falha('O local acima não existe ou está desativado.');

  try {
    const doc = await LocalizacaoModel.create({
      nome: input.nome,
      tipo: input.tipo,
      parentId: pai?._id ?? null,
      unitId: input.unitId ? new Types.ObjectId(input.unitId) : null,
      caminho: caminhoDe(pai, input.nome),
    });
    return { ok: true, id: String(doc._id) };
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_LOCAL_REPETIDO);
    throw e;
  }
}

export async function editarLocalizacao(input: {
  id: string;
  nome?: string;
  parentId?: string | null;
  unitId?: string | null;
}): Promise<Resultado> {
  const no = await LocalizacaoModel.findOne({ _id: input.id, isActive: true }).lean<NoLean>();
  if (!no) return falha('Local não encontrado.');

  const set: Record<string, unknown> = {};
  let mudouCaminho = false;

  if (input.nome !== undefined && input.nome !== no.nome) {
    set.nome = input.nome;
    mudouCaminho = true;
  }

  if (input.parentId !== undefined) {
    const novoPai = input.parentId;
    const erroRaiz = erroDeRaiz(no.tipo, novoPai !== null);
    if (erroRaiz) return falha(erroRaiz);
    if (novoPai && novoPai !== String(no.parentId ?? '')) {
      const pai = await paiAtivo(novoPai);
      if (!pai) return falha('O local acima não existe ou está desativado.');
      if (await ehDescendente(String(no._id), novoPai)) {
        return falha(
          'Não dá para mover um local para dentro dele mesmo ou de um local abaixo dele.',
        );
      }
      set.parentId = pai._id;
      mudouCaminho = true;
    }
  }

  if (input.unitId !== undefined) {
    set.unitId = input.unitId ? new Types.ObjectId(input.unitId) : null;
  }

  if (Object.keys(set).length === 0) return { ok: true };

  try {
    await LocalizacaoModel.updateOne({ _id: no._id }, { $set: set });
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_LOCAL_REPETIDO);
    throw e;
  }
  if (mudouCaminho) await recalcularSubarvore(no._id);
  return { ok: true };
}

export async function desativarLocalizacao(id: string): Promise<Resultado> {
  const no = await LocalizacaoModel.findOne({ _id: id, isActive: true }).lean<NoLean>();
  if (!no) return falha('Local não encontrado.');

  const [filhos, ativos] = await Promise.all([
    LocalizacaoModel.countDocuments({ parentId: no._id, isActive: true }),
    AtivoModel.countDocuments({ localizacaoId: no._id }),
  ]);
  if (filhos > 0) return falha('Este local tem locais ativos abaixo dele. Desative-os antes.');
  if (ativos > 0) return falha('Este local tem ativos vinculados. Mude o local deles antes.');

  await LocalizacaoModel.updateOne({ _id: no._id }, { $set: { isActive: false } });
  return { ok: true };
}

/** Ids do prédio e de todos os locais abaixo dele, pelo prefixo do `caminho`. */
export async function idsDaSubarvore(predioId: string): Promise<Types.ObjectId[]> {
  if (!Types.ObjectId.isValid(predioId)) return [];
  const raiz = await LocalizacaoModel.findById(predioId).select('caminho').lean<{
    _id: Types.ObjectId;
    caminho: string;
  }>();
  if (!raiz) return [];
  const abaixo = await LocalizacaoModel.find({
    caminho: { $regex: `^${escapeRegex(raiz.caminho)}/` },
  })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return [raiz._id, ...abaixo.map((l) => l._id)];
}

export type NoArvore = {
  id: string;
  nome: string;
  tipo: LocalizacaoTipo;
  parentId: string | null;
  caminho: string;
  unitId: string | null;
};

/**
 * Todos os locais ativos em ordem de árvore (cada nó logo depois do pai,
 * irmãos por nome), que já desenha a árvore com recuo pela profundidade.
 */
export async function listarLocaisAtivos(): Promise<NoArvore[]> {
  const docs = await LocalizacaoModel.find({ isActive: true }).lean<
    (NoLean & { unitId?: Types.ObjectId | null })[]
  >();
  const nos: NoArvore[] = docs.map((d) => ({
    id: String(d._id),
    nome: d.nome,
    tipo: d.tipo,
    parentId: d.parentId ? String(d.parentId) : null,
    caminho: d.caminho,
    unitId: d.unitId ? String(d.unitId) : null,
  }));
  const ids = new Set(nos.map((n) => n.id));
  const filhos = new Map<string | null, NoArvore[]>();
  for (const n of nos) {
    // Pai desativado não acontece pela regra, mas um nó órfão ainda aparece, na raiz.
    const chave = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    filhos.set(chave, [...(filhos.get(chave) ?? []), n]);
  }
  const porNome = (a: NoArvore, b: NoArvore) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' });
  const ordem: NoArvore[] = [];
  const visitar = (pai: string | null) => {
    for (const n of (filhos.get(pai) ?? []).sort(porNome)) {
      ordem.push(n);
      visitar(n.id);
    }
  };
  visitar(null);
  return ordem;
}
