import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O valor final da cotação só sai para a gestão (spec 0018, AC-18): o
 * solicitante e o técnico continuam vendo o estimado, como antes.
 */

const mockVerifySession = vi.fn();
// Cotação de material (spec 0019): por padrão, nenhuma executada.
// A busca das checagens com `usar` (spec 0024) devolve `checadas`; as outras, `executadas`.
const material = vi.hoisted(() => ({
  executadas: [] as object[],
  checadas: [] as object[],
  checagensLidas: 0,
}));
vi.mock('@/models/CotacaoMaterial', () => ({
  CotacaoMaterialModel: {
    find: (filtro: Record<string, unknown>) => {
      const daChecagem = 'checagem.itens.resultado' in filtro;
      if (daChecagem) material.checagensLidas += 1;
      const lista = () => (daChecagem ? material.checadas : material.executadas);
      return {
        select: () => ({
          lean: async () => lista(),
          sort: () => ({ lean: async () => lista() }),
        }),
      };
    },
  },
}));
const papeis = vi.hoisted(() => ({ ladoTrf1: false, leitorAdmin: false, contratada: false }));
vi.mock('@/lib/material/papeis', () => ({
  papeisDe: async (userId: string, role: string) => ({
    userId,
    role,
    designacoes: [],
    tem: () => false,
    ...papeis,
  }),
}));
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const CHAMADO_ID = new Types.ObjectId();
const SOLICITANTE_ID = new Types.ObjectId();
const PREPOSTO_ID = new Types.ObjectId();

const TECNICO_ID = new Types.ObjectId();
const estado = vi.hoisted(() => ({ chamado: undefined as object | null | undefined }));

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: () => ({
      lean: async () =>
        estado.chamado === undefined
          ? { _id: CHAMADO_ID, solicitanteId: SOLICITANTE_ID, assignedToUserId: TECNICO_ID }
          : estado.chamado,
    }),
  },
}));
vi.mock('@/models/Cotacao', () => ({
  CotacaoModel: {
    find: () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: new Types.ObjectId(),
            chamadoId: CHAMADO_ID,
            pauseLogId: new Types.ObjectId(),
            status: 'aprovada',
            valorEstimado: 300,
            descricao: 'Compressor',
            submittedByUserId: PREPOSTO_ID,
            submittedAt: new Date(),
            valorFinal: 280,
            valorFinalPorUserId: PREPOSTO_ID,
            valorFinalEm: new Date('2026-10-08T12:00:00.000Z'),
            createdAt: new Date(),
          },
        ],
      }),
    }),
  },
}));
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: () => ({ select: () => ({ lean: async () => [{ _id: PREPOSTO_ID, name: 'Ana' }] }) }),
  },
}));

import { GET } from '../route';

const pedir = () =>
  GET(new Request('http://x'), { params: Promise.resolve({ id: String(CHAMADO_ID) }) });

beforeEach(() => {
  vi.clearAllMocks();
  estado.chamado = undefined;
  material.executadas = [];
  material.checadas = [];
  material.checagensLidas = 0;
  Object.assign(papeis, { ladoTrf1: false, leitorAdmin: false, contratada: false });
});

describe('GET /api/chamados/[id]/cotacoes · cotação de material executada (spec 0019)', () => {
  const executada = {
    _id: new Types.ObjectId(),
    numero: 'COT-2026-0001',
    valorExecutadoCentavos: 1000,
    situacao: 'executada',
    emTramite: false,
    updatedAt: new Date(),
  };

  it('o Preposto sem designação vê o valor, mas sem link para a cotação (item 14)', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    material.executadas = [executada];
    const json = await (await pedir()).json();
    expect(json.materialExecutado).toEqual([
      {
        id: String(executada._id),
        numero: 'COT-2026-0001',
        valorExecutadoCentavos: 1000,
        podeAbrir: false,
      },
    ]);
  });

  it('o Admin (lado TRF1 ou leitor) recebe o link', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Admin' });
    papeis.leitorAdmin = true;
    material.executadas = [executada];
    const json = await (await pedir()).json();
    expect(json.materialExecutado[0].podeAbrir).toBe(true);
  });

  it('o solicitante não recebe a lista', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(SOLICITANTE_ID), role: 'Solicitante' });
    material.executadas = [executada];
    const json = await (await pedir()).json();
    expect(json.materialExecutado).toBeUndefined();
  });
});

describe('GET /api/chamados/[id]/cotacoes · material do almoxarifado (spec 0024, AC-22)', () => {
  const checada = {
    checagem: {
      itens: [
        { resultado: 'usar', valorCentavos: 3000 },
        { resultado: 'cotar_mesmo_assim', valorCentavos: 9999 },
        // Item rechecado depois: a entrada `usar` antiga continua contando (AC-21).
        { resultado: 'usar', valorCentavos: 1500 },
      ],
    },
  };
  const chamadoCom = (status: string) => ({
    _id: CHAMADO_ID,
    solicitanteId: SOLICITANTE_ID,
    assignedToUserId: TECNICO_ID,
    status,
  });

  it('a gestão recebe a soma das entradas `usar` do chamado concluído', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    estado.chamado = chamadoCom('concluído');
    material.checadas = [checada];

    const json = await (await pedir()).json();

    expect(json.almoxarifadoCentavos).toBe(4500);
  });

  it('o Admin recebe a mesma soma no chamado encerrado', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(new Types.ObjectId()), role: 'Admin' });
    estado.chamado = chamadoCom('encerrado');
    material.checadas = [checada];

    const json = await (await pedir()).json();

    expect(json.almoxarifadoCentavos).toBe(4500);
  });

  it.each(['em atendimento', 'cancelado', 'recusado', 'aguardando terceiros'])(
    'com o chamado %s, a gestão recebe zero',
    async (status) => {
      mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
      estado.chamado = chamadoCom(status);
      material.checadas = [checada];

      const json = await (await pedir()).json();

      expect(json.almoxarifadoCentavos).toBe(0);
    },
  );

  it.each([
    ['o solicitante', () => ({ userId: String(SOLICITANTE_ID), role: 'Solicitante' })],
    ['o técnico atribuído', () => ({ userId: String(TECNICO_ID), role: 'Técnico' })],
  ])('%s não recebe o campo nem dispara a busca', async (_quem, sessao) => {
    mockVerifySession.mockResolvedValue(sessao());
    estado.chamado = chamadoCom('concluído');
    material.checadas = [checada];

    const json = await (await pedir()).json();

    expect(json).not.toHaveProperty('almoxarifadoCentavos');
    expect(material.checagensLidas).toBe(0);
  });
});

describe('GET /api/chamados/[id]/cotacoes', () => {
  it('Preposto recebe o valor final e quem informou', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    const json = await (await pedir()).json();
    expect(json.history[0]).toMatchObject({
      valorEstimado: 300,
      valorFinal: 280,
      valorFinalPorName: 'Ana',
      valorFinalEm: '2026-10-08T12:00:00.000Z',
    });
  });

  it('o solicitante continua vendo só o estimado', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(SOLICITANTE_ID), role: 'Solicitante' });
    const json = await (await pedir()).json();
    expect(json.history[0].valorEstimado).toBe(300);
    expect(json.history[0]).not.toHaveProperty('valorFinal');
    expect(json.history[0]).not.toHaveProperty('valorFinalPorName');
  });

  it('o técnico atribuído também vê só o estimado (AC-18)', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(TECNICO_ID), role: 'Técnico' });
    const res = await pedir();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.history[0].valorEstimado).toBe(300);
    expect(json.history[0]).not.toHaveProperty('valorFinal');
    expect(json.history[0]).not.toHaveProperty('valorFinalEm');
  });

  it('o Admin recebe o valor final como o Preposto', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(new Types.ObjectId()), role: 'Admin' });
    const json = await (await pedir()).json();
    expect(json.history[0].valorFinal).toBe(280);
  });

  it('quem não é dono, técnico atribuído nem gestão recebe 403', async () => {
    mockVerifySession.mockResolvedValue({
      userId: String(new Types.ObjectId()),
      role: 'Técnico',
    });
    expect((await pedir()).status).toBe(403);
  });

  it('sem sessão recebe 401', async () => {
    mockVerifySession.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
  });

  it('id inválido recebe 400 e chamado inexistente, 404', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    const invalido = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(invalido.status).toBe(400);
    estado.chamado = null;
    expect((await pedir()).status).toBe(404);
  });
});
