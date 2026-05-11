import { Client, InvalidCredentialsError } from 'ldapts';

// ── Tipos ──────────────────────────────────────────────────────

export interface LdapUserProfile {
  displayName: string | null;
  email: string | null;
  department: string | null;
}

export type LdapAuthResult =
  | { status: 'success'; profile: LdapUserProfile }
  | { status: 'invalid_credentials' }
  | { status: 'not_found' }
  | { status: 'error' };

interface LdapConfig {
  url: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  searchFilter: string;
  tlsRejectUnauthorized: boolean;
}

// ── Configuração ───────────────────────────────────────────────

function getLdapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL;
  const baseDn = process.env.LDAP_BASE_DN;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPassword = process.env.LDAP_BIND_PASSWORD;

  if (!url || !baseDn || !bindDn || !bindPassword) return null;

  return {
    url,
    baseDn,
    bindDn,
    bindPassword,
    searchFilter: process.env.LDAP_USER_SEARCH_FILTER ?? '(sAMAccountName={{username}})',
    tlsRejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
  };
}

export function isLdapConfigured(): boolean {
  return getLdapConfig() !== null;
}

// ── Escape para filtro LDAP (previne LDAP injection) ───────────

function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\x00/]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(2, '0');
    return `\\${hex}`;
  });
}

// ── Debug ──────────────────────────────────────────────────────

const DEBUG = process.env.LDAP_DEBUG === 'true';

function ldapDebug(...args: unknown[]) {
  if (DEBUG) console.warn('[LDAP:debug]', ...args);
}

// ── Autenticação ───────────────────────────────────────────────

const TIMEOUT_MS = 5_000;

/** Extrai o primeiro valor string de um atributo LDAP (pode ser string, Buffer ou array). */
function extractAttr(entry: Record<string, unknown>, attr: string): string | null {
  const val = entry[attr];
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return typeof val[0] === 'string' ? val[0] : null;
  return null;
}

/**
 * Tenta autenticar o usuário contra LDAP/AD.
 *
 * Retorna um objeto com `status`:
 * - `'success'`             — credenciais válidas; inclui `profile` com atributos do AD
 * - `'invalid_credentials'` — usuário existe no LDAP mas senha errada
 * - `'not_found'`           — usuário não encontrado no LDAP (permite fallback local)
 * - `'error'`               — LDAP indisponível (permite fallback local)
 */
export async function authenticateWithLdap(
  username: string,
  password: string,
): Promise<LdapAuthResult> {
  const config = getLdapConfig();
  if (!config) {
    ldapDebug('LDAP não configurado, pulando');
    return { status: 'not_found' };
  }

  ldapDebug(`Iniciando autenticação para "${username}" em ${config.url}`);

  const searchClient = new Client({
    url: config.url,
    timeout: TIMEOUT_MS,
    connectTimeout: TIMEOUT_MS,
    tlsOptions: { rejectUnauthorized: config.tlsRejectUnauthorized },
  });

  try {
    // 1. Bind com conta de serviço para buscar o DN do usuário
    ldapDebug('Bind com conta de serviço:', config.bindDn);
    await searchClient.bind(config.bindDn, config.bindPassword);
    ldapDebug('Bind com conta de serviço OK');

    // 2. Busca o DN e atributos do usuário pelo filtro configurado
    const filter = config.searchFilter.replace(/\{\{username\}\}/g, escapeLdapFilter(username));

    ldapDebug(`Buscando usuário — base: "${config.baseDn}", filtro: "${filter}"`);

    const { searchEntries } = await searchClient.search(config.baseDn, {
      scope: 'sub',
      filter,
      attributes: ['dn', 'displayName', 'cn', 'mail', 'department'],
      sizeLimit: 1,
      timeLimit: 5,
    });

    if (searchEntries.length === 0) {
      ldapDebug(`Usuário "${username}" não encontrado no LDAP`);
      return { status: 'not_found' };
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;

    const profile: LdapUserProfile = {
      displayName: extractAttr(entry, 'displayName') ?? extractAttr(entry, 'cn'),
      email: extractAttr(entry, 'mail'),
      department: extractAttr(entry, 'department'),
    };

    ldapDebug(`Usuário encontrado — DN: "${userDn}"`, {
      displayName: profile.displayName,
      email: profile.email,
      department: profile.department,
    });

    // 3. Bind como o usuário para validar a senha
    const userClient = new Client({
      url: config.url,
      timeout: TIMEOUT_MS,
      connectTimeout: TIMEOUT_MS,
      tlsOptions: { rejectUnauthorized: config.tlsRejectUnauthorized },
    });

    try {
      ldapDebug(`Validando senha via bind como "${userDn}"`);
      await userClient.bind(userDn, password);
      ldapDebug(`Autenticação LDAP bem-sucedida para "${username}"`);
      return { status: 'success', profile };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        ldapDebug(`Senha inválida no LDAP para "${username}"`);
        return { status: 'invalid_credentials' };
      }
      console.warn('[LDAP] Falha no bind do usuário:', (err as Error).message);
      ldapDebug('Erro inesperado no bind do usuário:', (err as Error).message);
      return { status: 'error' };
    } finally {
      try {
        await userClient.unbind();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[LDAP] Erro no serviço (fallback para auth local):', (err as Error).message);
    ldapDebug('Erro no serviço LDAP:', (err as Error).message);
    return { status: 'error' };
  } finally {
    try {
      await searchClient.unbind();
    } catch {
      /* ignore */
    }
  }
}
