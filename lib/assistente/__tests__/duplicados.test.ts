import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/Chamado', () => ({ ChamadoModel: { find: mockFind } }));

import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

import { ativosComIdentidade, buscarDuplicados, juntarEOrdenar } from '../duplicados';
import { chaveDosDuplicados, conteudoDoCartao, mesmoConteudo } from '../proposta';

/**
 * As partes puras do aviso de chamado duplicado (spec 0017) e a falha do
 * banco. A busca contra o Mongo de verdade está em `duplicados.db.test.ts`.
 *
 * covers: AC-1 (sinal de identidade), AC-4 (ordem), AC-8 (chave), AC-20 (falha)
 */

const id = () => new Types.ObjectId();

const candidato = (n: number) => ({
  ativoId: String(new Types.ObjectId()),
  codigo: `MNT-000${n}`,
  descricao: 'Split',
  caminho: null,
});

afterEach(() => {
  vi.restoreAllMocks();
  mockFind.mockReset();
});

describe('ativosComIdentidade (AC-1)', () => {
  it('usa todos os candidatos do código digitado', () => {
    const [a, b] = [candidato(1), candidato(2)];
    expect(ativosComIdentidade({ origem: 'codigo', candidatos: [a, b] })).toEqual([
      a.ativoId,
      b.ativoId,
    ]);
  });

  it('usa o candidato único da regra', () => {
    const a = candidato(1);
    expect(ativosComIdentidade({ origem: 'regra', candidatos: [a] })).toEqual([a.ativoId]);
  });

  it('não usa a regra com dois a cinco candidatos, porque são palpites', () => {
    expect(
      ativosComIdentidade({ origem: 'regra', candidatos: [candidato(1), candidato(2)] }),
    ).toEqual([]);
  });

  it('sem ativo no cartão, nenhum id', () => {
    expect(ativosComIdentidade(null)).toEqual([]);
    expect(ativosComIdentidade(undefined)).toEqual([]);
  });
});

describe('juntarEOrdenar (AC-4)', () => {
  const chamado = (local: string, horasAtras: number) => ({
    _id: id(),
    ticket_number: local,
    solicitanteId: id(),
    unitId: id(),
    localExato: local,
    status: 'aberto' as const,
    createdAt: new Date(Date.UTC(2026, 9, 7, 12) - horasAtras * 3600_000),
  });

  it('põe o ramo do equipamento primeiro, depois mais palavras, depois o mais novo', () => {
    // Arrange
    const equipamento = chamado('deposito', 30);
    const duasPalavras = chamado('sala 205 norte', 5);
    const umaNovo = chamado('sala 205', 1);
    const umaVelho = chamado('corredor 205', 9);

    // Act
    const ordem = juntarEOrdenar(
      [equipamento],
      [umaVelho, umaNovo, duasPalavras],
      'sala 205 norte',
    );

    // Assert
    expect(ordem.map((c) => c.ticket_number)).toEqual([
      'deposito',
      'sala 205 norte',
      'sala 205',
      'corredor 205',
    ]);
  });

  it('não repete o chamado que veio dos dois ramos, e ele conta como do equipamento', () => {
    // Arrange
    const ambos = chamado('sala 205', 50);
    const outro = chamado('sala 205 norte', 1);

    // Act
    const ordem = juntarEOrdenar([ambos], [outro, ambos], 'sala 205 norte');

    // Assert
    expect(ordem.map((c) => c.ticket_number)).toEqual(['sala 205', 'sala 205 norte']);
  });

  it('sem nenhum chamado, lista vazia', () => {
    expect(juntarEOrdenar([], [], 'sala 1')).toEqual([]);
  });
});

describe('chaveDosDuplicados e mesmoConteudo (AC-8)', () => {
  const item = (chamadoId: string) => ({
    chamadoId,
    ticketNumber: 'CHM-2026-00001',
    rotuloServico: 'Split',
    localExato: null,
    ativoCodigo: null,
    status: 'aberto' as const,
    abertoEm: '2026-10-07T12:00:00.000Z',
    proprio: false,
    jaTemAcesso: false,
  });
  const base: CartaoPayload = {
    modo: 'manual',
    servico: null,
    unidade: null,
    localExato: 'sala 1',
    faltando: [],
    ativo: null,
  };

  it('une os ids na ordem com barra vertical', () => {
    const a = String(id());
    const b = String(id());
    expect(chaveDosDuplicados([item(a), item(b)])).toBe(`${a}|${b}`);
  });

  it('vale chave vazia sem parecidos ou com o campo ausente (cartão antigo)', () => {
    expect(chaveDosDuplicados(null)).toBe('');
    expect(chaveDosDuplicados(undefined)).toBe('');
  });

  it('cartão antigo sem o campo e cartão novo sem parecidos têm o mesmo conteúdo', () => {
    const antigo = conteudoDoCartao(base);
    const novo = conteudoDoCartao({ ...base, duplicados: null });
    expect(mesmoConteudo(antigo, novo)).toBe(true);
  });

  it('um parecido novo muda o conteúdo, e por isso o cartão é regravado', () => {
    const antes = conteudoDoCartao({ ...base, duplicados: null });
    const depois = conteudoDoCartao({ ...base, duplicados: [item(String(id()))] });
    expect(mesmoConteudo(antes, depois)).toBe(false);
  });
});

describe('buscarDuplicados · falha (AC-20)', () => {
  it('devolve null e loga só a operação, a conversa e o nome do erro', async () => {
    // Arrange
    const erros: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      erros.push(args.map(String).join(' '));
    });
    mockFind.mockImplementation(() => {
      throw new TypeError('sala 205 norte CHM-2026-00001 vazou?');
    });
    const cartao = {
      modo: 'ia' as const,
      servico: {
        catalogServiceId: String(id()),
        subtypeId: String(id()),
        tipoServico: 'Ar-Condicionado' as const,
        rotuloServico: 'Split',
        rotuloSubtipo: 'Split',
      },
      unidade: { unitId: String(id()), rotulo: 'Sede', andar: '' },
      localExato: 'sala 205 norte',
      ativo: { origem: 'codigo' as const, candidatos: [candidato(1)] },
    };

    // Act
    const r = await buscarDuplicados({
      conversaId: 'conv-1',
      viewer: { userId: String(id()), role: 'Solicitante' },
      cartao,
    });

    // Assert
    expect(r).toBeNull();
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('"operacao":"buscarDuplicados"');
    expect(erros[0]).toContain('"conversaId":"conv-1"');
    expect(erros[0]).toContain('"error":"TypeError"');
    expect(erros[0]).not.toMatch(/205|CHM-|vazou/);
  });

  it('cartão manual sem ativo nem consulta o banco', async () => {
    const r = await buscarDuplicados({
      conversaId: 'conv-2',
      viewer: { userId: String(id()), role: 'Solicitante' },
      cartao: { modo: 'manual', servico: null, unidade: null, localExato: 'sala 1', ativo: null },
    });
    expect(r).toBeNull();
    expect(mockFind).not.toHaveBeenCalled();
  });
});
