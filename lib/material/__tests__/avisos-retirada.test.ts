import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O aviso de retirada no almoxarifado (spec 0024, AC-20) nos três canais, sem
 * banco: a `Notification` leva a lista de itens, e o e-mail e o socket levam
 * só o título, o link e a marca, nunca valor. O caso contra o Mongo de verdade
 * (a `Notification` gravada) fica em `checagem.db.test.ts`.
 *
 * covers: AC-20
 */

const COTACAO_ID = new Types.ObjectId();
const CHAMADO_ID = new Types.ObjectId();
const TECNICO_ID = new Types.ObjectId();
const ALMOX_ID = new Types.ObjectId();

const banco = vi.hoisted(() => ({
  cotacao: null as object | null,
  chamado: null as object | null,
  usuarios: [] as object[],
  notificacoes: [] as object[],
}));

vi.mock('@/models/CotacaoMaterial', () => ({
  CotacaoMaterialModel: {
    findById: () => ({ select: () => ({ lean: async () => banco.cotacao }) }),
  },
}));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: () => ({ select: () => ({ lean: async () => banco.chamado }) }),
  },
}));
vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    insertMany: vi.fn(async (docs: object[]) => {
      banco.notificacoes.push(...docs);
      return docs;
    }),
  },
}));
vi.mock('@/models/user.model', () => ({
  UserModel: { find: () => ({ select: () => ({ lean: async () => banco.usuarios }) }) },
}));
vi.mock('@/models/CotacaoMaterialEvento', () => ({ CotacaoMaterialEventoModel: {} }));
vi.mock('@/lib/material/papeis', () => ({
  aprovadoresQueCobrem: vi.fn(async () => []),
  designadosVigentes: vi.fn(async () => []),
}));

const enviarEmailCotacao = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/email/aviso-cotacao', () => ({ enviarEmailCotacao }));
const emitToRoom = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom }));

import { avisarRetirada } from '../avisos';

const ITENS = [
  { descricao: 'Torneira lavatório', quantidade: 4, unidade: 'UN' },
  { descricao: 'Cabo flexível 2,5 mm', quantidade: 12.5, unidade: 'M' },
];

// Os valores que a cotação carrega e que nunca podem vazar no aviso.
const VALORES_PROIBIDOS = /2500|10000|valor|preco|preço|centavos/i;

beforeEach(() => {
  vi.clearAllMocks();
  banco.cotacao = {
    _id: COTACAO_ID,
    numero: 'COT-2026-0042',
    chamadoId: CHAMADO_ID,
    situacao: 'rascunho',
    valorTotalCentavos: 10000,
  };
  banco.chamado = { _id: CHAMADO_ID, assignedToUserId: TECNICO_ID };
  banco.usuarios = [{ _id: TECNICO_ID, name: 'Téo', email: 'teo@example.com' }];
  banco.notificacoes = [];
});

describe('avisarRetirada (AC-20)', () => {
  it('grava um aviso para o técnico atribuído com a lista de itens no corpo e no data', async () => {
    // Act
    await avisarRetirada(String(COTACAO_ID), ITENS, String(ALMOX_ID));

    // Assert
    expect(banco.notificacoes).toHaveLength(1);
    const aviso = banco.notificacoes[0] as {
      userId: Types.ObjectId;
      body: string;
      data: Record<string, unknown>;
    };
    expect(String(aviso.userId)).toBe(String(TECNICO_ID));
    expect(aviso.body).toBe('Torneira lavatório: 4 UN; Cabo flexível 2,5 mm: 12,5 M');
    expect(aviso.data).toMatchObject({
      aviso: 'retirar_almoxarifado',
      destino: 'chamado',
      itens: ITENS,
    });
  });

  it('o e-mail leva só o título e o link para a tela do técnico, sem valor', async () => {
    // Act
    await avisarRetirada(String(COTACAO_ID), ITENS, String(ALMOX_ID));

    // Assert
    expect(enviarEmailCotacao).toHaveBeenCalledTimes(1);
    const [destinatario, titulo, url] = enviarEmailCotacao.mock.calls[0] as unknown as [
      { email: string },
      string,
      string,
    ];
    expect(destinatario.email).toBe('teo@example.com');
    expect(titulo).toContain('COT-2026-0042');
    expect(url).toBe(`/chamados-atribuidos/${String(CHAMADO_ID)}`);
    expect(JSON.stringify(enviarEmailCotacao.mock.calls)).not.toMatch(VALORES_PROIBIDOS);
  });

  it('o socket vai só à sala do técnico, com a marca e sem valor nem itens', async () => {
    // Act
    await avisarRetirada(String(COTACAO_ID), ITENS, String(ALMOX_ID));

    // Assert
    expect(emitToRoom).toHaveBeenCalledTimes(1);
    const [sala, evento, payload] = emitToRoom.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(sala).toBe(`user:${String(TECNICO_ID)}`);
    expect(evento).toBe('material:cotacao_situacao');
    expect(payload).toMatchObject({
      cotacaoId: String(COTACAO_ID),
      chamadoId: String(CHAMADO_ID),
      aviso: 'retirar_almoxarifado',
    });
    expect(payload).not.toHaveProperty('itens');
    expect(JSON.stringify(payload)).not.toMatch(VALORES_PROIBIDOS);
  });

  it('sem itens, ninguém é avisado', async () => {
    await avisarRetirada(String(COTACAO_ID), [], String(ALMOX_ID));

    expect(banco.notificacoes).toHaveLength(0);
    expect(enviarEmailCotacao).not.toHaveBeenCalled();
    expect(emitToRoom).not.toHaveBeenCalled();
  });

  it('chamado sem técnico atribuído não gera aviso', async () => {
    banco.chamado = { _id: CHAMADO_ID, assignedToUserId: null };

    await avisarRetirada(String(COTACAO_ID), ITENS, String(ALMOX_ID));

    expect(banco.notificacoes).toHaveLength(0);
    expect(emitToRoom).not.toHaveBeenCalled();
  });

  it('o técnico que decidiu a própria retirada não avisa a si mesmo', async () => {
    await avisarRetirada(String(COTACAO_ID), ITENS, String(TECNICO_ID));

    expect(banco.notificacoes).toHaveLength(0);
    expect(enviarEmailCotacao).not.toHaveBeenCalled();
  });

  it('falha do banco não lança: o aviso é fire and forget', async () => {
    const { NotificationModel } = await import('@/models/Notification');
    vi.mocked(NotificationModel.insertMany).mockRejectedValueOnce(new Error('Mongo fora'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(avisarRetirada(String(COTACAO_ID), ITENS, null)).resolves.toBeUndefined();
    expect(emitToRoom).not.toHaveBeenCalled();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
