import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * Spec 0025, AC-13 e AC-15: cada tipo de disparo sem `await` que grava depois
 * da resposta grava no órgão de quem disparou.
 *
 * O `auth()` falso devolve a sessão do órgão B só na primeira leitura e lança
 * nas seguintes, como depois de a resposta sair. Os modelos falsos anotam o
 * escopo explícito na hora da gravação: sem a captura, a gravação cairia sem
 * órgão (a segunda leitura do JWT lança).
 *
 * covers: AC-13, AC-15
 */

const B = '000000000000000000000002';

const sessao = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: sessao.auth }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const escopos = vi.hoisted(() => {
  const lista: unknown[] = [];
  /** Anota o escopo explícito em volta da gravação, como o plugin o veria. */
  async function anotar(): Promise<null> {
    const { escopoExplicito } = await import('@/lib/orgaos/contexto');
    lista.push(escopoExplicito() ?? null);
    return null;
  }
  const consultaQueAnota = () => ({ select: () => ({ lean: anotar }), lean: anotar });
  return { lista, anotar, consultaQueAnota };
});
const { anotar } = escopos;

vi.mock('@/lib/email/transporter', () => ({
  smtpConfigured: true,
  transporter: { sendMail: vi.fn() },
  FROM_ADDRESS: 'sigma@teste',
}));
vi.mock('@/models/user.model', () => ({
  UserModel: { findById: vi.fn(escopos.consultaQueAnota) },
}));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { findById: vi.fn(escopos.consultaQueAnota) },
}));
vi.mock('@/models/CotacaoMaterial', () => ({
  CotacaoMaterialModel: { findById: vi.fn(escopos.consultaQueAnota) },
}));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn(escopos.anotar) } }));

import { emQuadros } from '@/app/api/conversas/_lib/fluxo';
import { notificarFimAosInteressados } from '@/lib/chamados/interessados';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { LlmCallRun } from '@/lib/llm/call-run';
import {
  avisarNotaFiscal,
  avisarPesquisaCompleta,
  avisarRetirada,
  avisarSituacao,
} from '@/lib/material/avisos';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

const NO_ORGAO_B = { tipo: 'orgao', orgaoId: B };
const COTACAO = '000000000000000000000abc';

beforeEach(() => {
  escopos.lista.length = 0;
  sessao.auth.mockReset();
  sessao.auth.mockResolvedValueOnce({ user: { orgaoId: B } });
  sessao.auth.mockRejectedValue(new Error('a resposta já saiu'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Dispara sem `await`, como o código de produção, e espera a gravação. */
async function dispararEEsperar(disparo: () => void): Promise<void> {
  disparo();
  await vi.waitFor(() => expect(escopos.lista).toHaveLength(1));
}

describe('disparos tardios gravam no órgão de quem disparou (AC-13)', () => {
  it('e-mail de notificação: a leitura do destinatário fica no órgão capturado', async () => {
    await dispararEEsperar(() => {
      sendNotificationEmail('000000000000000000000099', 'ticket:closed', {}).catch(() => {});
    });
    expect(escopos.lista).toEqual([NO_ORGAO_B]);
    expect(sessao.auth).toHaveBeenCalledOnce();
  });

  it('aviso de fim aos interessados', async () => {
    await dispararEEsperar(() => {
      void notificarFimAosInteressados('000000000000000000000077', 'cancelado');
    });
    expect(escopos.lista).toEqual([NO_ORGAO_B]);
    expect(sessao.auth).toHaveBeenCalledOnce();
  });

  it.each([
    ['avisarSituacao', () => avisarSituacao(COTACAO, 'enviada', null)],
    ['avisarPesquisaCompleta', () => avisarPesquisaCompleta(COTACAO, null)],
    ['avisarNotaFiscal', () => avisarNotaFiscal(COTACAO, null)],
    [
      'avisarRetirada',
      () => avisarRetirada(COTACAO, [{ descricao: 'Lâmpada', quantidade: 1, unidade: 'un' }], null),
    ],
  ])('aviso de material: %s', async (_nome, disparo) => {
    await dispararEEsperar(() => {
      void disparo();
    });
    expect(escopos.lista).toEqual([NO_ORGAO_B]);
    expect(sessao.auth).toHaveBeenCalledOnce();
  });

  it('LlmCall: o órgão é lido no início da chamada e vale na gravação do fim', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = new LlmCallRun(
      {
        task: 'teste.tardio',
        promptVersion: 'v1',
        schema: z.object({}),
        system: 's',
        messages: [],
        lane: 'batch',
        userId: null,
      },
      'object',
      'modelo-teste',
    );

    await dispararEEsperar(() => {
      run.finish({ status: 'success' });
    });
    expect(escopos.lista).toEqual([NO_ORGAO_B]);
    expect(sessao.auth).toHaveBeenCalledOnce();
  });

  it('fluxo NDJSON da conversa: o que o corpo grava depois da resposta fica no órgão', async () => {
    async function* quadros(): AsyncGenerator<QuadroResposta> {
      // Roda só quando o corpo é lido, depois de a `Response` já ter saído.
      await anotar();
    }

    const resposta = emQuadros(quadros());
    await resposta.text();

    expect(escopos.lista).toEqual([NO_ORGAO_B]);
    expect(sessao.auth).toHaveBeenCalledOnce();
  });
});
