import { describe, expect, it } from 'vitest';

import { getNotificationUrl } from '@/lib/notification-url';

describe('getNotificationUrl', () => {
  // ── ticket:assigned ───────────────────────────────────────────────

  describe('when type is "ticket:assigned"', () => {
    it('should return /chamados-atribuidos/{ticketId} when ticketId is present', () => {
      const result = getNotificationUrl('ticket:assigned', { ticketId: 'abc123' });

      expect(result).toBe('/chamados-atribuidos/abc123');
    });

    it('should return /chamados-atribuidos when ticketId is absent', () => {
      const result = getNotificationUrl('ticket:assigned', {});

      expect(result).toBe('/chamados-atribuidos');
    });

    it('should return /chamados-atribuidos when ticketId is empty string', () => {
      const result = getNotificationUrl('ticket:assigned', { ticketId: '' });

      expect(result).toBe('/chamados-atribuidos');
    });

    it('should return /chamados-atribuidos when data is null', () => {
      const result = getNotificationUrl('ticket:assigned', null);

      expect(result).toBe('/chamados-atribuidos');
    });

    it('should return /chamados-atribuidos when data is undefined', () => {
      const result = getNotificationUrl('ticket:assigned');

      expect(result).toBe('/chamados-atribuidos');
    });

    it('should return /chamados-atribuidos when ticketId is not a string (number)', () => {
      const result = getNotificationUrl('ticket:assigned', { ticketId: 42 });

      expect(result).toBe('/chamados-atribuidos');
    });

    it('should return /chamados-atribuidos when ticketId is null', () => {
      const result = getNotificationUrl('ticket:assigned', { ticketId: null });

      expect(result).toBe('/chamados-atribuidos');
    });
  });

  // ── ticket:new ────────────────────────────────────────────────────

  describe('when type is "ticket:new"', () => {
    it('should return /gestao regardless of data', () => {
      expect(getNotificationUrl('ticket:new', { ticketId: 'xyz' })).toBe('/gestao');
    });

    it('should return /gestao when data is null', () => {
      expect(getNotificationUrl('ticket:new', null)).toBe('/gestao');
    });

    it('should return /gestao when data is undefined', () => {
      expect(getNotificationUrl('ticket:new')).toBe('/gestao');
    });
  });

  // ── ticket:execution_registered ──────────────────────────────────

  describe('when type is "ticket:execution_registered"', () => {
    it('should return /meus-chamados/{ticketId} when ticketId is present', () => {
      const result = getNotificationUrl('ticket:execution_registered', { ticketId: 'tid99' });

      expect(result).toBe('/meus-chamados/tid99');
    });

    it('should return /meus-chamados when ticketId is absent', () => {
      const result = getNotificationUrl('ticket:execution_registered', {});

      expect(result).toBe('/meus-chamados');
    });

    it('should return /meus-chamados when data is null', () => {
      const result = getNotificationUrl('ticket:execution_registered', null);

      expect(result).toBe('/meus-chamados');
    });
  });

  // ── ticket:closed ────────────────────────────────────────────────

  describe('when type is "ticket:closed"', () => {
    it('should return /meus-chamados/{ticketId} when ticketId is present', () => {
      const result = getNotificationUrl('ticket:closed', { ticketId: 'close01' });

      expect(result).toBe('/meus-chamados/close01');
    });

    it('should return /meus-chamados when ticketId is absent', () => {
      const result = getNotificationUrl('ticket:closed', {});

      expect(result).toBe('/meus-chamados');
    });

    it('should return /meus-chamados when data is undefined', () => {
      const result = getNotificationUrl('ticket:closed');

      expect(result).toBe('/meus-chamados');
    });
  });

  // ── tipo desconhecido ────────────────────────────────────────────

  describe('when type is unknown', () => {
    it('should return /meus-chamados for unknown type with data', () => {
      const result = getNotificationUrl('ticket:unknown', { ticketId: 'any' });

      expect(result).toBe('/meus-chamados');
    });

    it('should return /meus-chamados for empty string type', () => {
      const result = getNotificationUrl('', { ticketId: 'any' });

      expect(result).toBe('/meus-chamados');
    });

    it('should return /meus-chamados for arbitrary string type', () => {
      const result = getNotificationUrl('some:other:event');

      expect(result).toBe('/meus-chamados');
    });
  });
});
