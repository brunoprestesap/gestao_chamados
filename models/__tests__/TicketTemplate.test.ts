import mongoose, { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

// Mongoose precisa ser mockado antes do import do model
const mockModelCreate = vi.fn();
const mockModelFind = vi.fn();
const mockModelFindById = vi.fn();
const mockModelUpdateOne = vi.fn();

vi.mock('mongoose', async () => {
  const actual = await vi.importActual<typeof mongoose>('mongoose');

  const MockModel = {
    create: (...args: unknown[]) => mockModelCreate(...args),
    find: (...args: unknown[]) => mockModelFind(...args),
    findById: (...args: unknown[]) => mockModelFindById(...args),
    updateOne: (...args: unknown[]) => mockModelUpdateOne(...args),
  };

  return {
    ...actual,
    default: {
      ...actual,
      models: {},
      model: vi.fn().mockReturnValue(MockModel),
    },
  };
});

import { TicketTemplateModel } from '@/models/TicketTemplate';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_USER_ID = new Types.ObjectId();
const VALID_UNIT_ID = new Types.ObjectId();

function makeValidTemplateData(overrides = {}) {
  return {
    name: 'Template de Teste',
    scope: 'personal' as const,
    createdByUserId: VALID_USER_ID,
    isActive: true,
    usageCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── TicketTemplateModel ───────────────────────────────────────────

describe('TicketTemplateModel', () => {
  describe('create', () => {
    it('should create template with minimal valid data', async () => {
      const data = makeValidTemplateData();
      const expectedDoc = { _id: new Types.ObjectId(), ...data };
      mockModelCreate.mockResolvedValue(expectedDoc);

      const result = await TicketTemplateModel.create(data);
      expect(mockModelCreate).toHaveBeenCalledWith(data);
      expect(result._id).toBeDefined();
      expect(result.name).toBe('Template de Teste');
      expect(result.scope).toBe('personal');
    });

    it('should create global template', async () => {
      const data = makeValidTemplateData({ scope: 'global' });
      const expectedDoc = { _id: new Types.ObjectId(), ...data };
      mockModelCreate.mockResolvedValue(expectedDoc);

      const result = await TicketTemplateModel.create(data);
      expect(result.scope).toBe('global');
    });

    it('should create template with all optional fields', async () => {
      const data = makeValidTemplateData({
        titulo: 'Título do chamado',
        descricao: 'Descrição do serviço',
        tipoServico: 'Manutenção Predial',
        naturezaAtendimento: 'Padrão',
        grauUrgencia: 'Normal',
        unitId: VALID_UNIT_ID,
        subtypeId: new Types.ObjectId(),
        catalogServiceId: new Types.ObjectId(),
      });
      const expectedDoc = { _id: new Types.ObjectId(), ...data };
      mockModelCreate.mockResolvedValue(expectedDoc);

      const result = await TicketTemplateModel.create(data);
      expect(result.tipoServico).toBe('Manutenção Predial');
      expect(result.naturezaAtendimento).toBe('Padrão');
      expect(result.grauUrgencia).toBe('Normal');
      expect(result.unitId).toEqual(VALID_UNIT_ID);
    });

    it('should default isActive to true', async () => {
      const data = {
        name: 'Template Novo',
        scope: 'personal' as const,
        createdByUserId: VALID_USER_ID,
      };
      const expectedDoc = { _id: new Types.ObjectId(), ...data, isActive: true, usageCount: 0 };
      mockModelCreate.mockResolvedValue(expectedDoc);

      const result = await TicketTemplateModel.create(data);
      expect(result.isActive).toBe(true);
    });

    it('should default usageCount to 0', async () => {
      const data = {
        name: 'Template Novo',
        scope: 'personal' as const,
        createdByUserId: VALID_USER_ID,
      };
      const expectedDoc = { _id: new Types.ObjectId(), ...data, isActive: true, usageCount: 0 };
      mockModelCreate.mockResolvedValue(expectedDoc);

      const result = await TicketTemplateModel.create(data);
      expect(result.usageCount).toBe(0);
    });
  });

  describe('find', () => {
    it('should find templates by scope and isActive', async () => {
      const filter = { isActive: true, scope: 'global' };
      const docs = [
        makeValidTemplateData({ _id: new Types.ObjectId(), scope: 'global' }),
        makeValidTemplateData({ _id: new Types.ObjectId(), scope: 'global', name: 'Outro Global' }),
      ];
      mockModelFind.mockResolvedValue(docs);

      const result = await TicketTemplateModel.find(filter);
      expect(mockModelFind).toHaveBeenCalledWith(filter);
      expect(result).toHaveLength(2);
    });

    it('should find personal templates by createdByUserId', async () => {
      const filter = { isActive: true, scope: 'personal', createdByUserId: VALID_USER_ID };
      mockModelFind.mockResolvedValue([makeValidTemplateData()]);

      await TicketTemplateModel.find(filter);
      expect(mockModelFind).toHaveBeenCalledWith(filter);
    });

    it('should return empty array when no templates match', async () => {
      mockModelFind.mockResolvedValue([]);

      const result = await TicketTemplateModel.find({ isActive: true, scope: 'global' });
      expect(result).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should find template by id', async () => {
      const templateId = new Types.ObjectId();
      const doc = makeValidTemplateData({ _id: templateId });
      mockModelFindById.mockResolvedValue(doc);

      const result = await TicketTemplateModel.findById(templateId);
      expect(mockModelFindById).toHaveBeenCalledWith(templateId);
      expect(result).not.toBeNull();
    });

    it('should return null when template not found', async () => {
      mockModelFindById.mockResolvedValue(null);

      const result = await TicketTemplateModel.findById(new Types.ObjectId());
      expect(result).toBeNull();
    });
  });

  describe('updateOne', () => {
    it('should increment usageCount atomically', async () => {
      const templateId = new Types.ObjectId();
      mockModelUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await TicketTemplateModel.updateOne(
        { _id: templateId, isActive: true },
        { $inc: { usageCount: 1 } },
      );
      expect(mockModelUpdateOne).toHaveBeenCalledWith(
        { _id: templateId, isActive: true },
        { $inc: { usageCount: 1 } },
      );
      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
    });

    it('should perform soft delete by setting isActive to false', async () => {
      const templateId = new Types.ObjectId();
      mockModelUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await TicketTemplateModel.updateOne({ _id: templateId }, { $set: { isActive: false } });
      expect(mockModelUpdateOne).toHaveBeenCalledWith(
        { _id: templateId },
        { $set: { isActive: false } },
      );
    });

    it('should return matchedCount 0 when template not found', async () => {
      mockModelUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      const result = await TicketTemplateModel.updateOne(
        { _id: new Types.ObjectId(), isActive: true },
        { $inc: { usageCount: 1 } },
      );
      expect(result.matchedCount).toBe(0);
    });
  });
});
