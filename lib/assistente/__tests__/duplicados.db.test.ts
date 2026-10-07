import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Viewer } from '@/lib/conversas';
import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * A busca dos chamados parecidos contra o Mongo de verdade (spec 0017): os
 * dois ramos, quem fica de fora, a ordem, o teto, os campos do item e o que
 * nunca sai dele.
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('buscarDuplicados, contra o Mongo', () => {
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  let buscarDuplicados: typeof import('../duplicados').buscarDuplicados;
  let duplicadoDoCartaoSchema: typeof import('@/shared/conversas/conversa.schemas').duplicadoDoCartaoSchema;
  let todos: ModelDeTeste[];

  const unidade = new Types.ObjectId();
  const outraUnidade = new Types.ObjectId();
  const subtipo = new Types.ObjectId();
  const outroSubtipo = new Types.ObjectId();
  const servico = new Types.ObjectId();
  const ativoX = new Types.ObjectId();
  const eu = new Types.ObjectId();
  const outro = new Types.ObjectId();
  const tecnico = new Types.ObjectId();
  let seq = 0;

  const viewer: Viewer = { userId: String(eu), role: 'Solicitante' };

  const cartaoIa = (extra: Record<string, unknown> = {}) => ({
    modo: 'ia' as const,
    servico: {
      catalogServiceId: String(servico),
      subtypeId: String(subtipo),
      tipoServico: 'Ar-Condicionado' as const,
      rotuloServico: 'Reparo de split',
      rotuloSubtipo: 'Split',
    },
    unidade: { unitId: String(unidade), rotulo: 'Sede', andar: '' },
    localExato: 'sala 205 norte',
    ativo: null,
    ...extra,
  });

  const codigoX = {
    origem: 'codigo' as const,
    candidatos: [
      { ativoId: String(ativoX), codigo: 'MNT-0001', descricao: 'Split', caminho: null },
    ],
  };

  async function chamado(extra: Record<string, unknown> = {}) {
    seq += 1;
    const doc = {
      _id: new Types.ObjectId(),
      ticket_number: `CHM-2026-${String(seq).padStart(5, '0')}`,
      titulo: 'Título que nunca sai',
      descricao: 'Relato que nunca sai',
      solicitanteId: outro,
      unitId: unidade,
      localExato: 'sala 205',
      tipoServico: 'Ar-Condicionado',
      subtypeId: subtipo,
      catalogServiceId: servico,
      status: 'aberto',
      finalPriority: 'ALTA',
      ativoId: null,
      createdAt: new Date(Date.UTC(2026, 9, 7, 12) - seq * 60_000),
      ...extra,
    };
    await ChamadoModel.collection.insertOne(doc);
    return doc;
  }

  beforeAll(async () => {
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ buscarDuplicados } = await import('../duplicados'));
    ({ duplicadoDoCartaoSchema } = await import('@/shared/conversas/conversa.schemas'));
    todos = [ChamadoModel, AtivoModel, ServiceCatalogModel] as never;
    await conectarMongoDeTeste(todos, 'severino_test_duplicados');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    seq = 0;
    await ServiceCatalogModel.collection.insertOne({
      _id: servico,
      name: 'REPARO DE SPLIT',
      code: 'ARCO-002',
    });
    await AtivoModel.collection.insertOne({
      _id: ativoX,
      codigo: 'MNT-0001',
      descricao: 'Split',
      tierManutencao: 'A',
      status: 'em_operacao',
    });
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  const buscar = (cartao: Record<string, unknown>, quem = viewer) =>
    buscarDuplicados({ conversaId: 'c1', viewer: quem, cartao: cartao as never });

  describe('ramo da regra (AC-2)', () => {
    it('acha o chamado do mesmo subtipo e unidade com palavra do local em comum, só com os campos do item', async () => {
      // Arrange
      const c = await chamado({ localExato: 'sala 205' });

      // Act
      const r = await buscar(cartaoIa());

      // Assert
      expect(r).toEqual([
        {
          chamadoId: String(c._id),
          ticketNumber: c.ticket_number,
          rotuloServico: 'REPARO DE SPLIT',
          localExato: 'sala 205',
          ativoCodigo: null,
          status: 'aberto',
          abertoEm: c.createdAt.toISOString(),
          proprio: false,
          jaTemAcesso: false,
        },
      ]);
      expect(duplicadoDoCartaoSchema.safeParse(r![0]).success).toBe(true);
    });

    it('não conta o chamado sem palavra do local em comum, mesmo com serviço e unidade iguais', async () => {
      await chamado({ localExato: 'sala 101' });
      expect(await buscar(cartaoIa({ localExato: 'sala 305' }))).toBeNull();
    });

    it('não conta chamado fora de andamento, de outro subtipo ou de outra unidade', async () => {
      await chamado({ status: 'concluído' });
      await chamado({ status: 'encerrado' });
      await chamado({ status: 'cancelado' });
      await chamado({ subtypeId: outroSubtipo });
      await chamado({ unitId: outraUnidade });
      expect(await buscar(cartaoIa())).toBeNull();
    });

    it('conta os cinco status em andamento', async () => {
      for (const status of [
        'aberto',
        'validado',
        'em atendimento',
        'aguardando_solicitante',
        'aguardando_terceiros',
      ]) {
        await chamado({ status });
      }
      // O teto do cartão é 3; os cinco entraram na leitura.
      expect(await buscar(cartaoIa())).toHaveLength(3);
    });
  });

  describe('sem sinal, sem aviso (AC-3)', () => {
    it('cartão ia sem unidade ou com local vazio só usa o ramo do equipamento', async () => {
      await chamado();
      expect(await buscar(cartaoIa({ unidade: null }))).toBeNull();
      expect(await buscar(cartaoIa({ localExato: '' }))).toBeNull();
      expect(await buscar(cartaoIa({ localExato: 'sala' }))).toBeNull();
    });

    it('cartão manual só acha pelo código do equipamento', async () => {
      // Arrange
      await chamado();
      const doAtivo = await chamado({
        ativoId: ativoX,
        subtypeId: outroSubtipo,
        localExato: 'deposito',
      });
      const manual = {
        modo: 'manual',
        servico: null,
        unidade: { unitId: String(unidade), rotulo: 'Sede', andar: '' },
        localExato: 'sala 205',
      };

      // Act / Assert
      expect(await buscar({ ...manual, ativo: null })).toBeNull();
      expect((await buscar({ ...manual, ativo: codigoX }))!.map((d) => d.chamadoId)).toEqual([
        String(doAtivo._id),
      ]);
    });
  });

  describe('ramo do equipamento (AC-1, AC-6)', () => {
    it('acha o chamado do mesmo ativo em outra unidade e outro serviço, sem o local de quem abriu', async () => {
      // Arrange
      const c = await chamado({
        ativoId: ativoX,
        unitId: outraUnidade,
        subtypeId: outroSubtipo,
        catalogServiceId: null,
        localExato: 'gabinete do Dr. Fulano',
      });

      // Act
      const r = await buscar(cartaoIa({ ativo: codigoX }));

      // Assert
      expect(r).toEqual([
        expect.objectContaining({
          chamadoId: String(c._id),
          localExato: null,
          ativoCodigo: 'MNT-0001',
          rotuloServico: 'A definir na triagem',
        }),
      ]);
    });

    it('mostra o local quando o chamado de outra unidade é do próprio usuário', async () => {
      await chamado({
        ativoId: ativoX,
        unitId: outraUnidade,
        solicitanteId: eu,
        localExato: 'minha sala',
      });
      expect(await buscar(cartaoIa({ ativo: codigoX }))).toEqual([
        expect.objectContaining({ localExato: 'minha sala', proprio: true }),
      ]);
    });

    it('ignora o ativo da regra com mais de um candidato', async () => {
      await chamado({ ativoId: ativoX, unitId: outraUnidade });
      const palpite = {
        origem: 'regra',
        candidatos: [
          codigoX.candidatos[0],
          { ...codigoX.candidatos[0], ativoId: String(new Types.ObjectId()) },
        ],
      };
      expect(await buscar(cartaoIa({ ativo: palpite }))).toBeNull();
    });
  });

  describe('ordem e teto (AC-4)', () => {
    it('equipamento primeiro, depois mais palavras, depois o mais novo, e só três', async () => {
      // Arrange: `chamado()` cria cada um um minuto mais velho que o anterior.
      const umaNovo = await chamado({ localExato: 'sala 205' });
      const umaVelho = await chamado({ localExato: 'corredor 205' });
      const duas = await chamado({ localExato: 'sala 205 norte' });
      const equip = await chamado({ ativoId: ativoX, localExato: 'deposito' });

      // Act
      const r = await buscar(cartaoIa({ ativo: codigoX }));

      // Assert
      expect(r!.map((d) => d.chamadoId)).toEqual([
        String(equip._id),
        String(duas._id),
        String(umaNovo._id),
      ]);
      expect(r!.map((d) => d.chamadoId)).not.toContain(String(umaVelho._id));
    });

    it('lê só os 50 mais recentes do subtipo na unidade: um parecido mais antigo escapa', async () => {
      for (let i = 0; i < 50; i += 1) await chamado({ localExato: `copa ${i}a` });
      await chamado({ localExato: 'sala 205 norte' });
      expect(await buscar(cartaoIa())).toBeNull();
    });
  });

  describe('próprio e quem já tem acesso (AC-5)', () => {
    it('marca `proprio` no chamado do próprio usuário, sem `jaTemAcesso`', async () => {
      await chamado({ solicitanteId: eu });
      expect(await buscar(cartaoIa())).toEqual([
        expect.objectContaining({ proprio: true, jaTemAcesso: false }),
      ]);
    });

    it('marca `jaTemAcesso` para o técnico atribuído', async () => {
      await chamado({ assignedToUserId: tecnico });
      const r = await buscar(cartaoIa(), { userId: String(tecnico), role: 'Técnico' });
      expect(r).toEqual([expect.objectContaining({ proprio: false, jaTemAcesso: true })]);
    });

    it.each(['Preposto', 'Admin'] as const)('marca `jaTemAcesso` para %s', async (role) => {
      await chamado();
      const r = await buscar(cartaoIa(), { userId: String(new Types.ObjectId()), role });
      expect(r).toEqual([expect.objectContaining({ jaTemAcesso: true })]);
    });

    it('outro técnico, não atribuído, pode acompanhar', async () => {
      await chamado({ assignedToUserId: tecnico });
      const r = await buscar(cartaoIa(), { userId: String(new Types.ObjectId()), role: 'Técnico' });
      expect(r).toEqual([expect.objectContaining({ jaTemAcesso: false })]);
    });
  });

  it('o item nunca leva título, relato, prioridade, unidade nem quem abriu (AC-6)', async () => {
    await chamado();
    const [item] = (await buscar(cartaoIa()))!;
    const texto = JSON.stringify(item);
    expect(texto).not.toMatch(/Título que nunca sai|Relato que nunca sai|ALTA/);
    expect(texto).not.toContain(String(outro));
    expect(texto).not.toContain(String(unidade));
  });
});
