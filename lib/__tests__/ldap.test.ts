import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock do módulo ldapts
const mockBind = vi.fn();
const mockSearch = vi.fn();
const mockUnbind = vi.fn();

vi.mock('ldapts', () => {
  class MockClient {
    bind = mockBind;
    search = mockSearch;
    unbind = mockUnbind;
  }
  class InvalidCredentialsError extends Error {
    name = 'InvalidCredentialsError';
  }
  return { Client: MockClient, InvalidCredentialsError };
});

// Importamos depois de configurar os mocks
import { authenticateWithLdap, isLdapConfigured } from '@/lib/ldap';

function setLdapEnv(overrides: Partial<Record<string, string>> = {}) {
  const defaults = {
    LDAP_URL: 'ldaps://ad.empresa.com:636',
    LDAP_BASE_DN: 'DC=empresa,DC=com',
    LDAP_BIND_DN: 'CN=svc,DC=empresa,DC=com',
    LDAP_BIND_PASSWORD: 'svc-password',
    LDAP_USER_SEARCH_FILTER: '(sAMAccountName={{username}})',
    LDAP_TLS_REJECT_UNAUTHORIZED: 'true',
    LDAP_DEBUG: 'false',
  };
  const env = { ...defaults, ...overrides };
  for (const [key, val] of Object.entries(env)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

function clearLdapEnv() {
  for (const key of [
    'LDAP_URL',
    'LDAP_BASE_DN',
    'LDAP_BIND_DN',
    'LDAP_BIND_PASSWORD',
    'LDAP_USER_SEARCH_FILTER',
    'LDAP_TLS_REJECT_UNAUTHORIZED',
    'LDAP_DEBUG',
  ]) {
    delete process.env[key];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLdapEnv();
});

afterEach(() => {
  clearLdapEnv();
});

// ── isLdapConfigured ─────────────────────────────────────────────

describe('isLdapConfigured', () => {
  it('retorna false quando variáveis ausentes', () => {
    expect(isLdapConfigured()).toBe(false);
  });

  it('retorna true quando todas as variáveis estão presentes', () => {
    setLdapEnv();
    expect(isLdapConfigured()).toBe(true);
  });

  it('retorna false se LDAP_URL ausente', () => {
    setLdapEnv({ LDAP_URL: undefined });
    expect(isLdapConfigured()).toBe(false);
  });

  it('retorna false se LDAP_BASE_DN ausente', () => {
    setLdapEnv({ LDAP_BASE_DN: undefined });
    expect(isLdapConfigured()).toBe(false);
  });

  it('retorna false se LDAP_BIND_DN ausente', () => {
    setLdapEnv({ LDAP_BIND_DN: undefined });
    expect(isLdapConfigured()).toBe(false);
  });

  it('retorna false se LDAP_BIND_PASSWORD ausente', () => {
    setLdapEnv({ LDAP_BIND_PASSWORD: undefined });
    expect(isLdapConfigured()).toBe(false);
  });
});

// ── authenticateWithLdap ─────────────────────────────────────────

describe('authenticateWithLdap', () => {
  it('retorna not_found se LDAP não configurado', async () => {
    const result = await authenticateWithLdap('joao', 'senha123');
    expect(result).toEqual({ status: 'not_found' });
    expect(mockBind).not.toHaveBeenCalled();
  });

  it('retorna success com profile quando autenticação funciona', async () => {
    setLdapEnv();
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        {
          dn: 'CN=Joao,DC=empresa,DC=com',
          displayName: 'João Silva',
          mail: 'joao@empresa.com',
          department: 'TI',
        },
      ],
    });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha123');
    expect(result).toEqual({
      status: 'success',
      profile: {
        displayName: 'João Silva',
        email: 'joao@empresa.com',
        department: 'TI',
      },
    });
  });

  it('retorna not_found quando usuário não existe no LDAP', async () => {
    setLdapEnv();
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({ searchEntries: [] });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('inexistente', 'senha');
    expect(result).toEqual({ status: 'not_found' });
  });

  it('retorna invalid_credentials quando senha errada', async () => {
    setLdapEnv();
    // Primeiro bind (serviço) OK
    mockBind
      .mockResolvedValueOnce(undefined) // bind de serviço
      .mockRejectedValueOnce(new (await import('ldapts')).InvalidCredentialsError()); // bind do usuário

    mockSearch.mockResolvedValue({
      searchEntries: [{ dn: 'CN=Joao,DC=empresa,DC=com', displayName: 'João' }],
    });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha-errada');
    expect(result).toEqual({ status: 'invalid_credentials' });
  });

  it('retorna error quando bind de serviço falha', async () => {
    setLdapEnv();
    mockBind.mockRejectedValue(new Error('Connection refused'));
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha');
    expect(result).toEqual({ status: 'error' });
  });

  it('retorna error quando bind do usuário falha com erro genérico', async () => {
    setLdapEnv();
    mockBind.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Timeout'));

    mockSearch.mockResolvedValue({
      searchEntries: [{ dn: 'CN=Joao,DC=empresa,DC=com', displayName: 'João' }],
    });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha');
    expect(result).toEqual({ status: 'error' });
  });

  it('extrai displayName de array', async () => {
    setLdapEnv();
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        {
          dn: 'CN=Joao,DC=empresa,DC=com',
          displayName: ['João Silva', 'Outro Nome'],
          mail: ['joao@empresa.com'],
          department: null,
        },
      ],
    });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha123');
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.profile.displayName).toBe('João Silva');
      expect(result.profile.email).toBe('joao@empresa.com');
      expect(result.profile.department).toBeNull();
    }
  });

  it('fallback para cn quando displayName ausente', async () => {
    setLdapEnv();
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        {
          dn: 'CN=Joao,DC=empresa,DC=com',
          cn: 'joao.silva',
          // sem displayName
        },
      ],
    });
    mockUnbind.mockResolvedValue(undefined);

    const result = await authenticateWithLdap('joao', 'senha123');
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.profile.displayName).toBe('joao.silva');
    }
  });

  it('escapa caracteres especiais no filtro (LDAP injection)', async () => {
    setLdapEnv();
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({ searchEntries: [] });
    mockUnbind.mockResolvedValue(undefined);

    // Username com caracteres de injection
    await authenticateWithLdap('user*)(uid=*)', 'senha');

    // Verifica que o filtro foi chamado com caracteres escapados
    expect(mockSearch).toHaveBeenCalledWith(
      'DC=empresa,DC=com',
      expect.objectContaining({
        filter: expect.not.stringContaining('*)('),
      }),
    );
  });

  it('chama unbind mesmo em caso de erro', async () => {
    setLdapEnv();
    mockBind.mockRejectedValue(new Error('fail'));
    mockUnbind.mockResolvedValue(undefined);

    await authenticateWithLdap('joao', 'senha');

    // O searchClient.unbind deve ter sido chamado no finally
    expect(mockUnbind).toHaveBeenCalled();
  });
});
