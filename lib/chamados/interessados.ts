import 'server-only';

import { Types } from 'mongoose';

import { ChamadoModel } from '@/models/Chamado';
import { ChamadoInteressadoModel } from '@/models/ChamadoInteressado';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';

/**
 * Os interessados de um chamado (spec 0017): quem passou a acompanhar um
 * chamado de outra pessoa a partir do aviso de chamado duplicado. Nada aqui
 * cria `ChamadoHistory`: a coleção `ChamadoInteressado` é a própria trilha.
 */

/** Os status que encerram o interesse e disparam o aviso de fim (AC-17). */
export const STATUS_DE_FIM = ['concluído', 'cancelado', 'recusado'] as const;
export type StatusDeFim = (typeof STATUS_DE_FIM)[number];

function ehChaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Grava o interesse (AC-9, AC-11). Cria o registro, ou reativa um que tinha
 * saído (`saiuEm: null`, `criadoEm` de agora, `avisadoFimEm: null`). Com o
 * interesse já ativo, não muda nada, nem o `localVisivel`: o clique repetido é
 * idempotente.
 *
 * `localVisivel` é a decisão do cartão sobre o local daquele item (AC-6),
 * gravada na criação e na reativação.
 *
 * `novo` diz se esta chamada ligou o interesse, para quem chamou saber o que
 * desfazer se a confirmação do rascunho ganhar a corrida.
 */
export async function registrarInteresse(
  chamadoId: string,
  userId: string,
  localVisivel: boolean,
): Promise<{ novo: boolean }> {
  const filtro = {
    chamadoId: new Types.ObjectId(chamadoId),
    userId: new Types.ObjectId(userId),
  };
  const agora = new Date();

  const reativado = await ChamadoInteressadoModel.updateOne(
    { ...filtro, saiuEm: { $ne: null } },
    { $set: { saiuEm: null, criadoEm: agora, avisadoFimEm: null, localVisivel } },
  );
  if (reativado.modifiedCount > 0) return { novo: true };

  try {
    const criado = await ChamadoInteressadoModel.updateOne(
      filtro,
      {
        $setOnInsert: {
          origem: 'aviso_duplicado',
          criadoEm: agora,
          saiuEm: null,
          avisadoFimEm: null,
          localVisivel,
        },
      },
      { upsert: true },
    );
    return { novo: criado.upsertedCount > 0 };
  } catch (err) {
    // Dois cliques ao mesmo tempo: o índice único deixou um registro só.
    if (ehChaveDuplicada(err)) return { novo: false };
    throw err;
  }
}

/**
 * "Deixar de acompanhar" (AC-16). Idempotente: sair de novo não muda a data.
 * `false` quando a pessoa nunca acompanhou esse chamado.
 */
export async function sairDoInteresse(chamadoId: string, userId: string): Promise<boolean> {
  const filtro = {
    chamadoId: new Types.ObjectId(chamadoId),
    userId: new Types.ObjectId(userId),
  };
  const existe = await ChamadoInteressadoModel.exists(filtro);
  if (!existe) return false;
  await ChamadoInteressadoModel.updateOne(
    { ...filtro, saiuEm: null },
    { $set: { saiuEm: new Date() } },
  );
  return true;
}

/** O interesse ativo da pessoa no chamado, ou `null` (AC-14). */
export async function interesseAtivo(
  chamadoId: string,
  userId: string,
): Promise<{ criadoEm: Date; localVisivel: boolean } | null> {
  const interesse = await ChamadoInteressadoModel.findOne({
    chamadoId: new Types.ObjectId(chamadoId),
    userId: new Types.ObjectId(userId),
    saiuEm: null,
  })
    .select('criadoEm localVisivel')
    .lean<{ criadoEm: Date; localVisivel?: boolean | null } | null>();
  if (!interesse) return null;
  // Registro gravado antes do campo vale `false` (comparação estrita).
  return { criadoEm: interesse.criadoEm, localVisivel: interesse.localVisivel === true };
}

/** O texto do sino por status final (AC-17). */
export function tituloDoFim(ticketNumber: string, status: StatusDeFim): string {
  const numero = ticketNumber;
  if (status === 'concluído') return `O chamado #${numero} que você acompanha foi concluído`;
  if (status === 'cancelado') {
    return `O chamado #${numero} que você acompanha foi cancelado. Se o problema continua, abra um novo chamado`;
  }
  return `O chamado #${numero} que você acompanha foi recusado. Se o problema continua, abra um novo chamado`;
}

/** Quantas pessoas cada lote do aviso de fim reserva e notifica de uma vez. */
const AVISO_FIM_LOTE = 50;

type Pendente = { _id: Types.ObjectId; userId: Types.ObjectId };

/**
 * Um lote do aviso de fim. As marcas condicionais saem em paralelo e as
 * notificações numa gravação só, então a janela em que alguém fica marcado sem
 * notificação é uma viagem ao banco, não uma por pessoa. Quem ficou marcado e
 * não teve a notificação gravada é desmarcado.
 */
async function avisarLote(
  chamadoId: string,
  lote: Pendente[],
  title: string,
  data: Record<string, string>,
): Promise<void> {
  const marcas = await Promise.all(
    lote.map((pendente) =>
      ChamadoInteressadoModel.updateOne(
        { _id: pendente._id, saiuEm: null, avisadoFimEm: null },
        { $set: { avisadoFimEm: new Date() } },
      ),
    ),
  );
  // Outra chamada já avisou estas pessoas, ou elas saíram no meio do caminho.
  const marcados = lote.filter((_, i) => marcas[i].modifiedCount > 0);
  if (marcados.length === 0) return;

  const avisos = marcados.map((p) => ({
    userId: p.userId,
    type: 'interesse:fim',
    title,
    body: '',
    data,
  }));
  let gravados: { userId: Types.ObjectId }[];
  try {
    gravados = await NotificationModel.insertMany(avisos, { ordered: false });
  } catch (err) {
    gravados = (err as { insertedDocs?: { userId: Types.ObjectId }[] }).insertedDocs ?? [];
    console.error(
      '[interessados]',
      JSON.stringify({
        operacao: 'notificarFimAosInteressados.notificacao',
        chamadoId,
        error: err instanceof Error ? err.name : 'unknown',
      }),
    );
  }

  // Sem notificação, a pessoa não fica marcada como avisada: uma nova chamada
  // para este fim ainda pode avisá-la.
  const avisados = new Set(gravados.map((n) => String(n.userId)));
  const semAviso = marcados.filter((p) => !avisados.has(String(p.userId)));
  if (semAviso.length > 0) {
    await ChamadoInteressadoModel.updateMany(
      { _id: { $in: semAviso.map((p) => p._id) } },
      { $set: { avisadoFimEm: null } },
    ).catch(() => undefined);
  }
}

/**
 * O aviso de fim no sino (AC-17). Chamado só depois de a mudança de status ter
 * sido gravada. O `avisadoFimEm` é gravado de forma condicional antes da
 * notificação, então cada pessoa recebe no máximo um aviso por fim, mesmo com
 * duas chamadas ao mesmo tempo. Só no sino, sem Socket.IO. Corre em lotes de
 * `AVISO_FIM_LOTE`.
 *
 * Nunca lança: quem chama faz "fogo e esquece", e a ação que mudou o status
 * nunca cai por causa daqui.
 */
export async function notificarFimAosInteressados(
  chamadoId: string,
  status: StatusDeFim,
): Promise<void> {
  try {
    const id = new Types.ObjectId(chamadoId);
    const chamado = await ChamadoModel.findById(id)
      .select('ticket_number assignedToUserId')
      .lean<{ ticket_number: string; assignedToUserId?: Types.ObjectId | null } | null>();
    if (!chamado) return;

    const pendentes = await ChamadoInteressadoModel.find({
      chamadoId: id,
      saiuEm: null,
      avisadoFimEm: null,
      ...semTecnicoAtribuido(chamado.assignedToUserId),
    })
      .select('_id userId')
      .lean<{ _id: Types.ObjectId; userId: Types.ObjectId }[]>();
    if (pendentes.length === 0) return;

    const title = tituloDoFim(chamado.ticket_number, status);
    const data = { chamadoId, ticketNumber: chamado.ticket_number, status };

    for (let i = 0; i < pendentes.length; i += AVISO_FIM_LOTE) {
      await avisarLote(chamadoId, pendentes.slice(i, i + AVISO_FIM_LOTE), title, data);
    }
  } catch (err) {
    console.error(
      '[interessados]',
      JSON.stringify({
        operacao: 'notificarFimAosInteressados',
        chamadoId,
        error: err instanceof Error ? err.name : 'unknown',
      }),
    );
  }
}

/**
 * A reabertura de `concluído` para `em atendimento` zera o aviso de fim, para
 * o próximo fim avisar de novo (AC-18). Nunca lança.
 */
export async function zerarAvisoDeFim(chamadoId: string): Promise<void> {
  try {
    await ChamadoInteressadoModel.updateMany(
      { chamadoId: new Types.ObjectId(chamadoId), avisadoFimEm: { $ne: null } },
      { $set: { avisadoFimEm: null } },
    );
  } catch (err) {
    console.error(
      '[interessados]',
      JSON.stringify({
        operacao: 'zerarAvisoDeFim',
        chamadoId,
        error: err instanceof Error ? err.name : 'unknown',
      }),
    );
  }
}

/**
 * Filtro que deixa de fora o técnico atribuído. Quem acompanhava e depois foi
 * atribuído ao chamado já o enxerga como técnico: não conta como interessado,
 * não recebe o aviso de fim e não aparece em "Acompanhando".
 */
export function semTecnicoAtribuido(tecnicoId: Types.ObjectId | string | null | undefined): {
  userId?: { $ne: Types.ObjectId };
} {
  return tecnicoId ? { userId: { $ne: new Types.ObjectId(String(tecnicoId)) } } : {};
}

/** Quantos acompanham o chamado agora, sem o técnico atribuído (AC-19). */
export async function contarInteressados(chamadoId: string): Promise<number> {
  const id = new Types.ObjectId(chamadoId);
  const chamado = await ChamadoModel.findById(id)
    .select('assignedToUserId')
    .lean<{ assignedToUserId?: Types.ObjectId | null } | null>();
  return ChamadoInteressadoModel.countDocuments({
    chamadoId: id,
    saiuEm: null,
    ...semTecnicoAtribuido(chamado?.assignedToUserId),
  });
}

/**
 * Total e nomes dos interessados ativos de uma página de chamados, para a
 * lista da gestão (AC-19): uma consulta de interesses e uma de nomes.
 */
export async function interessadosDosChamados(
  chamadoIds: readonly string[],
): Promise<Map<string, { total: number; nomes: string[] }>> {
  const resultado = new Map<string, { total: number; nomes: string[] }>();
  const ids = chamadoIds.filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return resultado;

  const todos = await ChamadoInteressadoModel.find({
    chamadoId: { $in: ids.map((id) => new Types.ObjectId(id)) },
    saiuEm: null,
  })
    .sort({ criadoEm: 1 })
    .select('chamadoId userId')
    .lean<{ chamadoId: Types.ObjectId; userId: Types.ObjectId }[]>();
  if (todos.length === 0) return resultado;

  // O técnico atribuído não conta como interessado.
  const chamados = await ChamadoModel.find({
    _id: { $in: [...new Set(todos.map((a) => String(a.chamadoId)))] },
  })
    .select('assignedToUserId')
    .lean<{ _id: Types.ObjectId; assignedToUserId?: Types.ObjectId | null }[]>();
  const tecnicoDe = new Map(chamados.map((c) => [String(c._id), String(c.assignedToUserId ?? '')]));
  const ativos = todos.filter((a) => tecnicoDe.get(String(a.chamadoId)) !== String(a.userId));
  if (ativos.length === 0) return resultado;

  const usuarios = await UserModel.find({
    _id: { $in: [...new Set(ativos.map((a) => String(a.userId)))] },
  })
    .select('name')
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  const nomePorId = new Map(usuarios.map((u) => [String(u._id), u.name]));

  for (const a of ativos) {
    const chave = String(a.chamadoId);
    const atual = resultado.get(chave) ?? { total: 0, nomes: [] };
    atual.total += 1;
    const nome = nomePorId.get(String(a.userId));
    if (nome) atual.nomes.push(nome);
    resultado.set(chave, atual);
  }
  return resultado;
}
