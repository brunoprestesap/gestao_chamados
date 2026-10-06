import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { lerDecisoes, mesmoValor } from '@/lib/conversas';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';
import { FINAL_PRIORITY_LABELS, SERVICO_A_DEFINIR } from '@/shared/chamados/chamado.constants';
import { DECISAO_CAMPOS_DA_IA, type DecisaoCampoDaIa } from '@/shared/conversas/conversa.constants';
import type { ValorDecisao } from '@/shared/conversas/conversa.schemas';

const VALOR_VAZIO: Omit<ValorDecisao, 'rotulo'> = {
  catalogServiceId: null,
  subtypeId: null,
  tipoServico: null,
  prioridade: null,
  tecnicoId: null,
  ativoId: null,
};

/**
 * GET /api/gestao/chamados/[id]/decisoes-ia
 *
 * O painel "Serviço, prioridade e técnico" do detalhe do chamado (spec 0009,
 * AC-4): uma linha por campo, com o valor atual do `Chamado` e, quando existe,
 * o que a IA escolheu. Restrito a Preposto e Admin, com 401/403 explícitos —
 * é uma rota de tela, não um redirect de página.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Preposto' && session.role !== 'Admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  await dbConnect();

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const chamado = await ChamadoModel.findById(id)
    .select('catalogServiceId subtypeId finalPriority assignedToUserId')
    .lean();
  if (!chamado) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  const lidas = await lerDecisoes({ userId: session.userId, role: session.role }, id);
  const decisoes = lidas.ok ? lidas.decisoes : [];
  const porCampo = new Map(decisoes.map((d) => [d.campo, d]));

  const [servico, tecnico] = await Promise.all([
    chamado.catalogServiceId
      ? ServiceCatalogModel.findById(chamado.catalogServiceId).select('name').lean()
      : null,
    chamado.assignedToUserId
      ? UserModel.findById(chamado.assignedToUserId).select('name').lean()
      : null,
  ]);

  // Os nomes de quem corrigiu, numa consulta só para todos os campos (AC-4).
  const userIds = [...new Set(decisoes.flatMap((d) => d.correcoes.map((c) => c.userId)))];
  const usuarios =
    userIds.length > 0
      ? await UserModel.find({ _id: { $in: userIds } })
          .select('name')
          .lean()
      : [];
  const nomePorUsuario = new Map(usuarios.map((u) => [String(u._id), u.name]));

  const valorAtual: Record<DecisaoCampoDaIa, ValorDecisao> = {
    servico: {
      ...VALOR_VAZIO,
      catalogServiceId: chamado.catalogServiceId ? String(chamado.catalogServiceId) : null,
      subtypeId: chamado.subtypeId ? String(chamado.subtypeId) : null,
      rotulo: servico?.name ?? SERVICO_A_DEFINIR,
    },
    prioridade: {
      ...VALOR_VAZIO,
      prioridade: chamado.finalPriority ?? null,
      rotulo: chamado.finalPriority
        ? FINAL_PRIORITY_LABELS[chamado.finalPriority as keyof typeof FINAL_PRIORITY_LABELS]
        : 'Não classificada',
    },
    tecnico: {
      ...VALOR_VAZIO,
      tecnicoId: chamado.assignedToUserId ? String(chamado.assignedToUserId) : null,
      rotulo: tecnico?.name ?? 'Não atribuído',
    },
  };

  // A decisão `ativo` é da regra do cartão, não da IA: fica fora do painel
  // (spec 0014, AC-11). O vínculo de ativo tem tela própria.
  const campos = DECISAO_CAMPOS_DA_IA.map((campo) => {
    const decisao = porCampo.get(campo) ?? null;
    // Decisão cega (spec 0009, tarefa 8): a 0007 (AC-8) já pré-preenche esse
    // mesmo valor no diálogo de classificação, mas confiança e motivo nunca
    // tiveram esse precedente — mostrá-los vazaria o corte de confiança que a
    // calibração usa (fatia 18). `divergente` também some: antes de julgada a
    // decisão, `finalPriority` ainda é `null` e bate falso positivo sempre.
    const cega = decisao?.efeito === 'sugestao' && decisao?.situacao === 'sem_revisao';
    return {
      campo,
      atual: valorAtual[campo],
      decisao: decisao
        ? {
            decididoPor: decisao.decididoPor,
            efeito: decisao.efeito,
            valorIa: decisao.valorIa,
            valorFinal: decisao.valorFinal,
            confianca: cega ? null : decisao.confianca,
            motivo: cega ? '' : decisao.motivo,
            situacao: decisao.situacao,
            revisadaEm: decisao.revisadaEm,
            correcoes: decisao.correcoes.map((c) => ({
              anterior: c.anterior,
              novo: c.novo,
              userNome: nomePorUsuario.get(c.userId) ?? null,
              origem: c.origem,
              motivo: c.motivo,
              em: c.em,
            })),
          }
        : null,
      divergente: decisao && !cega ? !mesmoValor(decisao.valorFinal, valorAtual[campo]) : false,
    };
  });

  return NextResponse.json({ campos });
}
