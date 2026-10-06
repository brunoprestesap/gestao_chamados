import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import { enviarEmailVencimento } from '@/lib/email/vencimento-documento';
import { getNotificationUrl } from '@/lib/notification-url';
import { AtivoModel } from '@/models/Ativo';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import type { LimiteAlerta } from '@/shared/ativos/documento.constants';

import { mapaDeLocais, predioDaCadeia, subirArvore } from '../localizacao';
import { type AlvoDoAviso, montarAviso } from './aviso';
import { mapaDeNomesDeTipo } from './ficha';
import { dataSemHora, diasRestantes, hojeEmBelem, limitesAlcancados, somarDias } from './situacao';

/**
 * Job diário de vencimento (spec 0013, AC-11 a AC-14). Para cada documento
 * `vigente` com validade até hoje + 90 dias, acha os limites alcançados e ainda
 * não marcados; grava a marca por atualização condicional e só quem gravou
 * envia um aviso, pelo limite mais urgente. Rodar de novo, ou em paralelo, não
 * repete aviso.
 */

export type RelatorioVencimentos = { avaliados: number; avisados: number; erros: number };

type DocLean = {
  _id: Types.ObjectId;
  tipo: string;
  ativoId?: Types.ObjectId | null;
  localizacaoId?: Types.ObjectId | null;
  numero?: string | null;
  emitidoPor?: string | null;
  validadeAte: Date;
  alertasEnviados?: LimiteAlerta[];
};

type Gestor = { _id: Types.ObjectId; email?: string | null; name?: string | null };

export async function processarVencimentos(
  hoje: string = hojeEmBelem(),
): Promise<RelatorioVencimentos> {
  await dbConnect();
  const relatorio: RelatorioVencimentos = { avaliados: 0, avisados: 0, erros: 0 };

  const docs = await DocumentoAtivoModel.find({
    situacao: 'vigente',
    validadeAte: { $ne: null, $lte: dataSemHora(somarDias(hoje, 90)) },
  })
    .select('tipo ativoId localizacaoId numero emitidoPor validadeAte alertasEnviados')
    .lean<DocLean[]>();
  if (docs.length === 0) return relatorio;

  const ativoIds = [...new Set(docs.filter((d) => d.ativoId).map((d) => String(d.ativoId)))];
  const [nomes, locais, ativos, gestores] = await Promise.all([
    mapaDeNomesDeTipo(),
    mapaDeLocais(),
    ativoIds.length
      ? AtivoModel.find({ _id: { $in: ativoIds } })
          .select('codigo descricao localizacaoId status')
          .lean<
            {
              _id: Types.ObjectId;
              codigo: string;
              descricao: string;
              localizacaoId?: Types.ObjectId | null;
              status: string;
            }[]
          >()
      : Promise.resolve([]),
    UserModel.find({ role: { $in: ['Admin', 'Preposto'] }, isActive: true })
      .select('email name')
      .lean<Gestor[]>(),
  ]);
  const ativoPorId = new Map(ativos.map((a) => [String(a._id), a]));

  for (const doc of docs) {
    // Alvo elegível: documento de ativo baixado não alerta (AC-14); de local, sempre.
    let alvo: AlvoDoAviso;
    if (doc.ativoId) {
      const a = ativoPorId.get(String(doc.ativoId));
      if (!a || a.status === 'baixado') continue;
      const predio = predioDaCadeia(subirArvore(locais, a.localizacaoId));
      alvo = {
        tipo: 'ativo',
        ativoId: String(a._id),
        codigo: a.codigo,
        descricao: a.descricao,
        predioId: predio ? String(predio._id) : null,
      };
    } else {
      const cadeia = subirArvore(locais, doc.localizacaoId);
      const local = cadeia[0];
      if (!local) continue;
      const predio = predioDaCadeia(cadeia);
      alvo = {
        tipo: 'local',
        localizacaoId: String(local._id),
        nome: local.nome,
        caminho: local.caminho,
        predioId: predio ? String(predio._id) : null,
      };
    }

    relatorio.avaliados += 1;
    const ja = new Set(doc.alertasEnviados ?? []);
    const alcancados = limitesAlcancados(doc.validadeAte, hoje);
    const novos = alcancados.filter((l) => !ja.has(l));
    if (novos.length === 0) continue;
    // Sem ninguém para avisar, não grava a marca: senão o limite some sem aviso.
    if (gestores.length === 0) {
      relatorio.erros += 1;
      continue;
    }

    try {
      // Só quem grava a marca envia (AC-13).
      const marcado = await DocumentoAtivoModel.updateOne(
        { _id: doc._id, situacao: 'vigente', alertasEnviados: { $nin: novos } },
        { $addToSet: { alertasEnviados: { $each: novos } } },
      );
      if (marcado.modifiedCount !== 1) continue;

      // `novos` vem em ordem de urgência: o primeiro é o do aviso.
      const aviso = montarAviso(
        {
          id: String(doc._id),
          tipo: doc.tipo,
          tipoNome: nomes.get(doc.tipo)?.nome ?? doc.tipo.toUpperCase(),
          numero: doc.numero ?? null,
          emitidoPor: doc.emitidoPor ?? null,
          validadeAte: doc.validadeAte,
        },
        alvo,
        novos[0],
        diasRestantes(doc.validadeAte, hoje),
      );

      try {
        await NotificationModel.insertMany(
          gestores.map((g) => ({
            userId: g._id,
            type: 'documento:vencimento',
            title: aviso.titulo,
            body: aviso.corpo,
            data: aviso.data,
          })),
        );
      } catch (e) {
        // Desfaz a marca para o aviso sair na próxima rodada (AC-12).
        await DocumentoAtivoModel.updateOne(
          { _id: doc._id },
          { $pull: { alertasEnviados: { $in: novos } } },
        );
        throw e;
      }
      relatorio.avisados += 1;

      // E-mail: falha não desfaz a marca nem para o próximo documento.
      const url = getNotificationUrl('documento:vencimento', aviso.data);
      await Promise.all(gestores.map((g) => enviarEmailVencimento(g, aviso, url)));
    } catch (e) {
      relatorio.erros += 1;
      console.error(`[documentos] erro ao avisar o documento ${String(doc._id)}:`, e);
    }
  }

  if (gestores.length === 0 && relatorio.erros > 0) {
    console.error(
      `[documentos] nenhum Admin ou Preposto ativo: ${relatorio.erros} aviso(s) ficam para a próxima rodada`,
    );
  }
  return relatorio;
}
