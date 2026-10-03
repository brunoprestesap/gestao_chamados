import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import { TipoDocumentoModel } from '@/models/TipoDocumento';
import type { AtivoHistoryAcao } from '@/shared/ativos/ativo.constants';
import { ERRO_CONFLITO_DOCUMENTO, type LimiteAlerta } from '@/shared/ativos/documento.constants';
import type {
  CadastrarDocumentoInput,
  CorrigirDocumentoDados,
} from '@/shared/ativos/documento.schemas';

import { gravarHistoricoOuDesfazer } from '../auditoria';
import { ehChaveDuplicada } from '../erros';
import { apagarArquivo, gravarArquivo } from './arquivo';
import { dataSemHora, hojeEmBelem, limitesAlcancados } from './situacao';

/**
 * Escrita dos documentos (spec 0013, AC-3 a AC-7). Sem transação (o Mongo de
 * produção é standalone): a substituição marca o anterior pelo `_id` lido e
 * desfaz a marca se o novo não entrar. O índice único parcial garante um só
 * `vigente` por tipo e alvo.
 */

export type FalhaDocumento = {
  ok: false;
  error: string;
  /** Status HTTP para a rota de upload. */
  status: 400 | 404 | 409 | 500;
};

export type ResultadoDocumento<T = object> = ({ ok: true } & T) | FalhaDocumento;

function falhaDoc(error: string, status: FalhaDocumento['status'] = 400): FalhaDocumento {
  return { ok: false, error, status };
}

type AlvoLean = { _id: Types.ObjectId; status?: string; isActive?: boolean };

export type ArquivoRecebido = {
  conteudo: Uint8Array;
  originalName: string;
  mimeType: string;
  filename: string;
};

async function historico(
  ativoId: Types.ObjectId,
  acao: AtivoHistoryAcao,
  autorId: string,
  para: string,
  observacao: string | null = null,
) {
  await AtivoHistoryModel.create({
    ativoId,
    acao,
    actorType: 'usuario',
    autorId: new Types.ObjectId(autorId),
    para,
    observacao,
  });
}

async function nomeDoTipo(chave: string): Promise<string> {
  const t = await TipoDocumentoModel.findOne({ chave }).select('nome').lean<{ nome: string }>();
  return t?.nome ?? chave.toUpperCase();
}

/** Confere tipo e alvo sem tocar em disco (passo 1). */
async function validarCadastro(
  dados: CadastrarDocumentoInput,
): Promise<
  { ok: true; tipoNome: string; filtroAlvo: Record<string, Types.ObjectId> } | FalhaDocumento
> {
  const tipo = await TipoDocumentoModel.findOne({ chave: dados.tipo, isActive: true })
    .select('nome')
    .lean<{ nome: string }>();
  if (!tipo) return falhaDoc('Tipo de documento inválido ou desativado.');

  if (dados.ativoId) {
    const ativo = await AtivoModel.findById(dados.ativoId).select('status').lean<AlvoLean>();
    if (!ativo) return falhaDoc('Ativo não encontrado.', 404);
    if (ativo.status === 'baixado') return falhaDoc('Ativo baixado não recebe documento.');
    return { ok: true, tipoNome: tipo.nome, filtroAlvo: { ativoId: ativo._id } };
  }
  const local = await LocalizacaoModel.findById(dados.localizacaoId)
    .select('isActive')
    .lean<AlvoLean>();
  if (!local) return falhaDoc('Local não encontrado.', 404);
  if (!local.isActive) return falhaDoc('Local desativado não recebe documento.');
  return { ok: true, tipoNome: tipo.nome, filtroAlvo: { localizacaoId: local._id } };
}

export async function cadastrarDocumento(
  dados: CadastrarDocumentoInput,
  arquivo: ArquivoRecebido,
  autorId: string,
): Promise<ResultadoDocumento<{ id: string; substituidoId?: string }>> {
  // 1. Valida tudo antes de tocar em disco.
  const v = await validarCadastro(dados);
  if (!v.ok) return v;

  // 2. O vigente atual do mesmo tipo e alvo.
  const anterior = await DocumentoAtivoModel.findOne({
    tipo: dados.tipo,
    ...v.filtroAlvo,
    situacao: 'vigente',
  })
    .select('_id')
    .lean<{ _id: Types.ObjectId }>();
  const anteriorId = anterior?._id ?? null;

  // 3. Id do novo e o arquivo em disco.
  const novoId = new Types.ObjectId();
  const novoIdTexto = String(novoId);
  const gravado = await gravarArquivo(novoIdTexto, arquivo.filename, arquivo.conteudo);
  if (!gravado) return falhaDoc('Nome de arquivo inválido.');

  const agora = new Date();

  // 4. Marca o anterior pelo `_id` lido, nunca por tipo e alvo.
  if (anteriorId) {
    const marcado = await DocumentoAtivoModel.updateOne(
      { _id: anteriorId, situacao: 'vigente' },
      { $set: { situacao: 'substituido', substituidoPorId: novoId, substituidoEm: agora } },
    );
    if (marcado.modifiedCount !== 1) {
      await apagarArquivo(novoIdTexto);
      return falhaDoc(ERRO_CONFLITO_DOCUMENTO, 409);
    }
  }

  const desfazerMarca = async () => {
    if (!anteriorId) return;
    await DocumentoAtivoModel.updateOne(
      { _id: anteriorId, substituidoPorId: novoId },
      { $set: { situacao: 'vigente' }, $unset: { substituidoPorId: 1, substituidoEm: 1 } },
    );
  };

  // 5. O novo vigente.
  try {
    await DocumentoAtivoModel.create({
      _id: novoId,
      tipo: dados.tipo,
      ativoId: dados.ativoId ? new Types.ObjectId(dados.ativoId) : null,
      localizacaoId: dados.localizacaoId ? new Types.ObjectId(dados.localizacaoId) : null,
      arquivo: {
        filename: arquivo.filename,
        originalName: arquivo.originalName.slice(0, 255),
        mimeType: arquivo.mimeType,
        size: arquivo.conteudo.byteLength,
      },
      numero: dados.numero ?? null,
      emitidoPor: dados.emitidoPor ?? null,
      emitidoEm: dataSemHora(dados.emitidoEm),
      validadeAte: dados.validadeAte ? dataSemHora(dados.validadeAte) : null,
      situacao: 'vigente',
      alertasEnviados: [],
      cadastradoPorId: new Types.ObjectId(autorId),
    });
  } catch (e) {
    try {
      await desfazerMarca();
    } catch (falhaAoDesfazer) {
      console.error('[documentos] não deu para devolver o anterior a vigente:', falhaAoDesfazer);
    }
    await apagarArquivo(novoIdTexto);
    if (ehChaveDuplicada(e)) return falhaDoc(ERRO_CONFLITO_DOCUMENTO, 409);
    const mensagem =
      e instanceof Error && e.name === 'ValidationError'
        ? Object.values((e as unknown as { errors: Record<string, { message: string }> }).errors)
            .map((x) => x.message)
            .join(' ')
        : null;
    if (mensagem) return falhaDoc(mensagem);
    throw e;
  }

  // 6. Histórico do ativo; se falhar, desfaz tudo.
  if (dados.ativoId) {
    const ativoId = new Types.ObjectId(dados.ativoId);
    await gravarHistoricoOuDesfazer(
      () =>
        historico(
          ativoId,
          anteriorId ? 'documento_substituido' : 'documento_cadastrado',
          autorId,
          v.tipoNome,
        ),
      async () => {
        await DocumentoAtivoModel.deleteOne({ _id: novoId });
        await desfazerMarca();
        await apagarArquivo(novoIdTexto);
      },
    );
  }

  return {
    ok: true,
    id: novoIdTexto,
    ...(anteriorId ? { substituidoId: String(anteriorId) } : {}),
  };
}

type DocumentoLean = {
  _id: Types.ObjectId;
  tipo: string;
  ativoId?: Types.ObjectId | null;
  localizacaoId?: Types.ObjectId | null;
  numero?: string | null;
  emitidoPor?: string | null;
  emitidoEm: Date;
  validadeAte?: Date | null;
  situacao: 'vigente' | 'substituido' | 'excluido';
  alertasEnviados?: LimiteAlerta[];
};

/**
 * Corrige os campos de um `vigente` (AC-5). O arquivo não muda. Mudar a
 * validade tira de `alertasEnviados` os limites que a nova data ainda não alcança.
 */
export async function corrigirDocumento(
  dados: CorrigirDocumentoDados,
  autorId: string,
  hoje: string = hojeEmBelem(),
): Promise<ResultadoDocumento> {
  const doc = await DocumentoAtivoModel.findById(dados.id).lean<DocumentoLean>();
  if (!doc || doc.situacao === 'excluido') return falhaDoc('Documento não encontrado.', 404);
  if (doc.situacao !== 'vigente') return falhaDoc('Só o documento vigente pode ser corrigido.');

  const validadeAte = dados.validadeAte ? dataSemHora(dados.validadeAte) : null;
  const alcancados = new Set(limitesAlcancados(validadeAte, hoje));
  const marcas = (doc.alertasEnviados ?? []).filter((m) => alcancados.has(m));

  const novo = {
    numero: dados.numero ?? null,
    emitidoPor: dados.emitidoPor ?? null,
    emitidoEm: dataSemHora(dados.emitidoEm),
    validadeAte,
    alertasEnviados: marcas,
  };
  const antigo = {
    numero: doc.numero ?? null,
    emitidoPor: doc.emitidoPor ?? null,
    emitidoEm: doc.emitidoEm,
    validadeAte: doc.validadeAte ?? null,
    alertasEnviados: doc.alertasEnviados ?? [],
  };

  const r = await DocumentoAtivoModel.updateOne(
    { _id: doc._id, situacao: 'vigente' },
    { $set: novo },
    { runValidators: true },
  );
  if (r.matchedCount !== 1) return falhaDoc('O documento mudou. Recarregue a página.', 409);

  if (doc.ativoId) {
    const tipoNome = await nomeDoTipo(doc.tipo);
    await gravarHistoricoOuDesfazer(
      () => historico(doc.ativoId!, 'documento_corrigido', autorId, tipoNome),
      () => DocumentoAtivoModel.updateOne({ _id: doc._id }, { $set: antigo }),
    );
  }
  return { ok: true };
}

/** Exclui um `vigente` ou `substituido` (AC-6). O arquivo continua no disco. */
export async function excluirDocumento(
  id: string,
  motivo: string,
  autorId: string,
): Promise<ResultadoDocumento> {
  const doc = await DocumentoAtivoModel.findById(id).lean<DocumentoLean>();
  if (!doc || doc.situacao === 'excluido') return falhaDoc('Documento não encontrado.', 404);

  const r = await DocumentoAtivoModel.updateOne(
    { _id: doc._id, situacao: doc.situacao },
    {
      $set: {
        situacao: 'excluido',
        excluidoPorId: new Types.ObjectId(autorId),
        excluidoEm: new Date(),
        motivoExclusao: motivo,
      },
    },
  );
  if (r.modifiedCount !== 1) return falhaDoc('O documento mudou. Recarregue a página.', 409);

  if (doc.ativoId) {
    const tipoNome = await nomeDoTipo(doc.tipo);
    await gravarHistoricoOuDesfazer(
      () => historico(doc.ativoId!, 'documento_excluido', autorId, tipoNome, motivo),
      () =>
        DocumentoAtivoModel.updateOne(
          { _id: doc._id },
          {
            $set: { situacao: doc.situacao },
            $unset: { excluidoPorId: 1, excluidoEm: 1, motivoExclusao: 1 },
          },
        ),
    );
  }
  return { ok: true };
}
