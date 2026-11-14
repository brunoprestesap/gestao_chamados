import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';
import {
  comOrgaoDeTeste,
  criarDoisOrgaos,
  ORGAO_A_ID,
  ORGAO_B_ID,
  usarModo,
} from '@/tests/orgao-test-env';

/**
 * Spec 0025, fatia 3: unicidade e numeração por órgão no MongoDB de verdade.
 * AC-11 (o mesmo valor de negócio em dois órgãos, repetido dentro de um só
 * recusado), AC-12 (o `Contador` por órgão, o órgão 1 seguindo de onde parou e
 * a corrida do primeiro número de um órgão novo) e a parte do AC-15 que cabe a
 * esta fatia.
 */
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => {
    throw new Error('fora da requisição');
  }),
}));

import { Types } from 'mongoose';

import { semOrgao } from '@/lib/orgaos/contexto';
import { ChamadoModel } from '@/models/Chamado';
import { ContadorModel } from '@/models/Contador';
import { HolidayModel } from '@/models/Holiday';
import { OrgaoModel } from '@/models/Orgao';
import { ServiceTypeModel } from '@/models/ServiceType';
import { UserModel } from '@/models/user.model';

const A = ORGAO_A_ID;
const B = ORGAO_B_ID;
const ANO = new Date().getFullYear();
const naoTemMongo = !temMongoDeTeste;

const MODELOS = [
  ChamadoModel,
  UserModel,
  ServiceTypeModel,
  HolidayModel,
  ContadorModel,
  OrgaoModel,
];

function dadosChamado(ticket_number: string) {
  return {
    ticket_number,
    titulo: 'Teste',
    descricao: 'Descrição',
    unitId: new Types.ObjectId(),
    localExato: 'Sala 1',
    tipoServico: 'Ar-Condicionado',
    subtypeId: new Types.ObjectId(),
    catalogServiceId: new Types.ObjectId(),
    status: 'aberto',
    solicitanteId: new Types.ObjectId(),
  };
}

const codigoDoErro = (e: unknown) => (e as { code?: number }).code;

describe.skipIf(naoTemMongo)('unicidade e numeração por órgão (spec 0025, fatia 3)', () => {
  // Importados no `beforeAll`: `lib/db.ts` exige `MONGODB_URI` já na
  // importação, e sem banco de teste o arquivo tem de ser pulado, não quebrar.
  let generateTicketNumber: typeof import('@/lib/chamado-utils').generateTicketNumber;
  let proximoCodigoInterno: typeof import('@/lib/ativos/cadastro').proximoCodigoInterno;

  beforeAll(async () => {
    ({ generateTicketNumber } = await import('@/lib/chamado-utils'));
    ({ proximoCodigoInterno } = await import('@/lib/ativos/cadastro'));
    await conectarMongoDeTeste(MODELOS, 'orgao_unicidade');
    // Base limpa a cada rodada: os índices do banco são só os do schema de hoje.
    await mongoose.connection.dropDatabase();
    await Promise.all(MODELOS.map((m) => m.createIndexes()));
    await criarDoisOrgaos();
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    usarModo('estrito');
    await semOrgao('teste: limpar', async () => {
      await ChamadoModel.deleteMany({});
      await UserModel.deleteMany({});
      await ServiceTypeModel.deleteMany({});
      await HolidayModel.deleteMany({});
      await ContadorModel.deleteMany({});
    });
  });

  describe('índices únicos por órgão (AC-11)', () => {
    it('o mesmo número de chamado vale em dois órgãos e repete recusado no mesmo', async () => {
      await comOrgaoDeTeste(A, () => ChamadoModel.create(dadosChamado('CHM-2026-00001')));
      await comOrgaoDeTeste(B, () => ChamadoModel.create(dadosChamado('CHM-2026-00001')));

      const repetido = await comOrgaoDeTeste(A, () =>
        ChamadoModel.create(dadosChamado('CHM-2026-00001')),
      ).catch((e: unknown) => e);

      expect(codigoDoErro(repetido)).toBe(11000);
      const total = await semOrgao('teste: conferir', () =>
        ChamadoModel.countDocuments({ ticket_number: 'CHM-2026-00001' }),
      );
      expect(total).toBe(2);
    });

    it('a mesma matrícula vale em dois órgãos e repete recusada no mesmo', async () => {
      await comOrgaoDeTeste(A, () => UserModel.create({ username: 'ana', name: 'Ana A' }));
      await comOrgaoDeTeste(B, () => UserModel.create({ username: 'ana', name: 'Ana B' }));

      const repetido = await comOrgaoDeTeste(B, () =>
        UserModel.create({ username: 'ANA', name: 'Outra' }),
      ).catch((e: unknown) => e);

      expect(codigoDoErro(repetido)).toBe(11000);
    });

    it('tipo de serviço e feriado também valem por órgão', async () => {
      for (const orgao of [A, B]) {
        await comOrgaoDeTeste(orgao, async () => {
          await ServiceTypeModel.create({ name: 'Elevador' });
          await HolidayModel.create({ date: `${ANO}-12-25`, name: 'Natal' });
        });
      }

      const tipo = await comOrgaoDeTeste(A, () =>
        ServiceTypeModel.create({ name: 'Elevador' }),
      ).catch((e: unknown) => e);
      const feriado = await comOrgaoDeTeste(B, () =>
        HolidayModel.create({ date: `${ANO}-12-25`, name: 'Natal de novo' }),
      ).catch((e: unknown) => e);

      expect(codigoDoErro(tipo)).toBe(11000);
      expect(codigoDoErro(feriado)).toBe(11000);
    });
  });

  describe('Contador por órgão (AC-12)', () => {
    it('o órgão 1 segue a sequência de hoje e o órgão novo começa do 1', async () => {
      // Arrange: o contador do órgão 1 com o _id de hoje, já no número 41.
      await comOrgaoDeTeste(A, () => ContadorModel.create({ _id: `chamado_${ANO}`, seq: 41 }));

      // Act
      const deA = await comOrgaoDeTeste(A, () => generateTicketNumber());
      const deB = await comOrgaoDeTeste(B, () => generateTicketNumber());

      // Assert
      expect(deA).toBe(`CHM-${ANO}-00042`);
      expect(deB).toBe(`CHM-${ANO}-00001`);
      const contadores = await semOrgao('teste: conferir', () =>
        ContadorModel.find({}).sort({ _id: 1 }).lean(),
      );
      expect(
        contadores.map((c) => ({
          _id: c._id,
          seq: c.seq,
          orgaoId: String((c as { orgaoId?: unknown }).orgaoId),
        })),
      ).toEqual([
        { _id: `${B}:chamado_${ANO}`, seq: 1, orgaoId: B },
        { _id: `chamado_${ANO}`, seq: 42, orgaoId: A },
      ]);
    });

    it('o contador novo parte do maior número já gravado no próprio órgão, não no outro', async () => {
      // Arrange: o órgão A tem o 00077 e nenhum contador; o B não tem nada.
      await comOrgaoDeTeste(A, () => ChamadoModel.create(dadosChamado(`CHM-${ANO}-00077`)));

      // Act
      const deB = await comOrgaoDeTeste(B, () => generateTicketNumber());
      const deA = await comOrgaoDeTeste(A, () => generateTicketNumber());

      // Assert
      expect(deB).toBe(`CHM-${ANO}-00001`);
      expect(deA).toBe(`CHM-${ANO}-00078`);
    });

    it('a corrida do primeiro número de um órgão novo não repete nem pula', async () => {
      // Act: cinco aberturas ao mesmo tempo, sem contador nenhum no órgão B.
      const numeros = await comOrgaoDeTeste(B, () =>
        Promise.all(Array.from({ length: 5 }, () => generateTicketNumber())),
      );

      // Assert
      expect([...numeros].sort()).toEqual(
        [1, 2, 3, 4, 5].map((n) => `CHM-${ANO}-${String(n).padStart(5, '0')}`),
      );
    });

    it('o código MNT é por órgão, inclusive na corrida do primeiro código', async () => {
      // Arrange: o órgão 1 já no MNT-0010, com o _id de hoje.
      await comOrgaoDeTeste(A, () => ContadorModel.create({ _id: 'ativo_mnt', seq: 10 }));

      // Act
      const deB = await comOrgaoDeTeste(B, () =>
        Promise.all(Array.from({ length: 4 }, () => proximoCodigoInterno())),
      );
      const deA = await comOrgaoDeTeste(A, () => proximoCodigoInterno());

      // Assert
      expect([...deB].sort()).toEqual(['MNT-0001', 'MNT-0002', 'MNT-0003', 'MNT-0004']);
      expect(deA).toBe('MNT-0011');
      const doB = await comOrgaoDeTeste(B, () => ContadorModel.findById(`${B}:ativo_mnt`).lean());
      expect(doB?.seq).toBe(4);
    });

    it('na observação, sem contexto, o contador antigo sem orgaoId segue de onde parou', async () => {
      // Arrange: o contador de hoje na produção, gravado antes do órgão existir.
      usarModo('observacao');
      await ContadorModel.collection.insertOne({ _id: `chamado_${ANO}`, seq: 7 } as never);

      // Act
      const numero = await generateTicketNumber();

      // Assert
      expect(numero).toBe(`CHM-${ANO}-00008`);
    });

    it('no estrito, sem órgão, o número não é gerado', async () => {
      await expect(generateTicketNumber()).rejects.toThrow(/sem órgão conhecido/);
    });
  });
});
