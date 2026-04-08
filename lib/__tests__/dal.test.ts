import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de server-only (já feito via alias no vitest.config)
// Mock de next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

// Mock de react cache — retorna a função sem cache
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// Mock de @/auth
const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

import { redirect } from 'next/navigation';

import {
  canManage,
  isAdmin,
  isTechnician,
  requireAdmin,
  requireManager,
  requireSession,
  requireTechnician,
  verifySession,
} from '@/lib/dal';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Funções síncronas ────────────────────────────────────────────

describe('canManage', () => {
  it('retorna true para Admin', () => expect(canManage('Admin')).toBe(true));
  it('retorna true para Preposto', () => expect(canManage('Preposto')).toBe(true));
  it('retorna false para Solicitante', () => expect(canManage('Solicitante')).toBe(false));
  it('retorna false para Técnico', () => expect(canManage('Técnico')).toBe(false));
  it('retorna false para undefined', () => expect(canManage(undefined)).toBe(false));
});

describe('isTechnician', () => {
  it('retorna true para Técnico', () => expect(isTechnician('Técnico')).toBe(true));
  it('retorna false para Admin', () => expect(isTechnician('Admin')).toBe(false));
  it('retorna false para undefined', () => expect(isTechnician(undefined)).toBe(false));
});

describe('isAdmin', () => {
  it('retorna true para Admin', () => expect(isAdmin('Admin')).toBe(true));
  it('retorna false para Preposto', () => expect(isAdmin('Preposto')).toBe(false));
  it('retorna false para undefined', () => expect(isAdmin(undefined)).toBe(false));
});

// ── verifySession ────────────────────────────────────────────────

describe('verifySession', () => {
  it('retorna sessão válida quando auth retorna usuário ativo', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'joao', role: 'Admin', unitId: 'unit1', isActive: true },
    });

    const session = await verifySession();
    expect(session).toEqual({
      userId: '123',
      username: 'joao',
      role: 'Admin',
      unitId: 'unit1',
      isActive: true,
    });
  });

  it('retorna null quando auth retorna null', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await verifySession()).toBeNull();
  });

  it('retorna null quando isActive é false', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'joao', role: 'Admin', isActive: false },
    });
    expect(await verifySession()).toBeNull();
  });

  it('retorna null quando user.id é undefined', async () => {
    mockAuth.mockResolvedValue({
      user: { username: 'joao', role: 'Admin', isActive: true },
    });
    expect(await verifySession()).toBeNull();
  });

  it('retorna unitId null quando ausente', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'joao', role: 'Solicitante', isActive: true },
    });
    const session = await verifySession();
    expect(session!.unitId).toBeNull();
  });
});

// ── requireSession ───────────────────────────────────────────────

describe('requireSession', () => {
  it('retorna sessão quando autenticado', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'joao', role: 'Admin', isActive: true },
    });
    const session = await requireSession();
    expect(session.userId).toBe('123');
  });

  it('redireciona para /login quando sem sessão', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

// ── requireManager ───────────────────────────────────────────────

describe('requireManager', () => {
  it('retorna sessão para Admin', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '1', username: 'admin', role: 'Admin', isActive: true },
    });
    const session = await requireManager();
    expect(session.role).toBe('Admin');
  });

  it('retorna sessão para Preposto', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '2', username: 'preposto', role: 'Preposto', isActive: true },
    });
    const session = await requireManager();
    expect(session.role).toBe('Preposto');
  });

  it('redireciona Solicitante para /dashboard', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '3', username: 'sol', role: 'Solicitante', isActive: true },
    });
    await expect(requireManager()).rejects.toThrow('REDIRECT:/dashboard');
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redireciona Técnico para /dashboard', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '4', username: 'tec', role: 'Técnico', isActive: true },
    });
    await expect(requireManager()).rejects.toThrow('REDIRECT:/dashboard');
  });
});

// ── requireTechnician ────────────────────────────────────────────

describe('requireTechnician', () => {
  it('retorna sessão para Técnico', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '4', username: 'tec', role: 'Técnico', isActive: true },
    });
    const session = await requireTechnician();
    expect(session.role).toBe('Técnico');
  });

  it('redireciona Admin para /dashboard', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '1', username: 'admin', role: 'Admin', isActive: true },
    });
    await expect(requireTechnician()).rejects.toThrow('REDIRECT:/dashboard');
  });
});

// ── requireAdmin ─────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('retorna sessão para Admin', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '1', username: 'admin', role: 'Admin', isActive: true },
    });
    const session = await requireAdmin();
    expect(session.role).toBe('Admin');
  });

  it('redireciona Preposto para /dashboard', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '2', username: 'preposto', role: 'Preposto', isActive: true },
    });
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/dashboard');
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redireciona Solicitante para /dashboard', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '3', username: 'sol', role: 'Solicitante', isActive: true },
    });
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/dashboard');
  });
});
