import { NextResponse } from 'next/server';

import { signIn } from '@/auth';
import { dbConnect } from '@/lib/db';
import { authenticateWithLdap, isLdapConfigured } from '@/lib/ldap';
import { UserModel } from '@/models/user.model';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get('username');

  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    envVars: {
      LDAP_URL: process.env.LDAP_URL ? `✅ ${process.env.LDAP_URL}` : '❌ não definido',
      LDAP_BASE_DN: process.env.LDAP_BASE_DN ? `✅ ${process.env.LDAP_BASE_DN}` : '❌ não definido',
      LDAP_BIND_DN: process.env.LDAP_BIND_DN
        ? `✅ (${process.env.LDAP_BIND_DN.length} chars)`
        : '❌ não definido',
      LDAP_BIND_PASSWORD: process.env.LDAP_BIND_PASSWORD
        ? `✅ (${process.env.LDAP_BIND_PASSWORD.length} chars)`
        : '❌ não definido',
      LDAP_USER_SEARCH_FILTER:
        process.env.LDAP_USER_SEARCH_FILTER ?? '(não definido, usando padrão)',
      LDAP_TLS_REJECT_UNAUTHORIZED: process.env.LDAP_TLS_REJECT_UNAUTHORIZED ?? '(não definido)',
      LDAP_DEBUG: process.env.LDAP_DEBUG ?? '(não definido)',
    },
    isLdapConfigured: isLdapConfigured(),
  };

  // Teste 1: Bind de serviço com usuário fictício
  if (isLdapConfigured()) {
    try {
      const result = await authenticateWithLdap('__teste_diagnostico__', 'dummy');
      diag.ldapBindTest = { result, note: 'Bind de serviço OK (not_found esperado)' };
    } catch (err) {
      diag.ldapBindTest = {
        error: (err as Error).message,
        stack: (err as Error).stack?.split('\n').slice(0, 5),
      };
    }
  }

  // Teste 2: Buscar usuário real no LDAP (sem autenticar, só verifica se existe)
  if (username && isLdapConfigured()) {
    try {
      const ldapResult = await authenticateWithLdap(username, '__senha_invalida_proposital__');
      diag.ldapUserSearch = {
        username,
        result: ldapResult.status,
        note:
          ldapResult.status === 'invalid_credentials'
            ? '✅ Usuário ENCONTRADO no LDAP (senha dummy recusada, esperado)'
            : ldapResult.status === 'not_found'
              ? '❌ Usuário NÃO encontrado no LDAP'
              : `⚠️ Status: ${ldapResult.status}`,
      };
    } catch (err) {
      diag.ldapUserSearch = { username, error: (err as Error).message };
    }
  }

  // Teste 3: Buscar usuário no MongoDB
  if (username) {
    try {
      await dbConnect();
      const user = await UserModel.findOne({ username: username.trim().toLowerCase() }).lean();
      diag.mongoUser = user
        ? {
            found: true,
            id: String(user._id),
            name: user.name,
            role: user.role,
            isActive: user.isActive,
            hasPasswordHash: !!user.passwordHash,
          }
        : { found: false, note: 'Usuário não existe no MongoDB (será provisionado via LDAP)' };
    } catch (err) {
      diag.mongoUser = { error: (err as Error).message };
    }
  }

  // Teste 4: Importação do auth.ts
  try {
    const authModule = await import('@/auth');
    diag.authModule = {
      loaded: true,
      exports: Object.keys(authModule),
    };
  } catch (err) {
    diag.authModule = {
      loaded: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.split('\n').slice(0, 8),
    };
  }

  if (!username) {
    diag.hint = 'Adicione ?username=SEU_LOGIN&password=SUA_SENHA para teste completo';
  }

  return NextResponse.json(diag, { status: 200 });
}

/**
 * POST /api/debug-ldap — simula o fluxo completo do authorize
 * Body: { "username": "...", "password": "..." }
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: 'username e password são obrigatórios' }, { status: 400 });
  }

  const steps: Record<string, unknown> = {};
  const u = username.trim().toLowerCase();

  // Passo 1: MongoDB
  await dbConnect();
  const user = await UserModel.findOne({ username: u }).lean();
  steps['1_mongodb'] = user
    ? { found: true, isActive: user.isActive, hasPasswordHash: !!user.passwordHash }
    : { found: false };

  // Passo 2: LDAP
  let authenticated = false;
  if (isLdapConfigured()) {
    const ldapResult = await authenticateWithLdap(u, password);
    steps['2_ldap'] = { status: ldapResult.status };

    if (ldapResult.status === 'success') {
      authenticated = true;
      steps['2_ldap_profile'] = ldapResult.profile;
    } else if (ldapResult.status === 'invalid_credentials') {
      steps['resultado'] = '❌ LDAP: senha incorreta (sem fallback local)';
      return NextResponse.json(steps, { status: 200 });
    }
  } else {
    steps['2_ldap'] = 'não configurado';
  }

  // Passo 3: Provisionamento
  if (authenticated && !user) {
    steps['3_provisioning'] = 'Usuário seria criado automaticamente no MongoDB';
  }

  // Passo 4: Local fallback
  if (!authenticated && user?.passwordHash) {
    const bcrypt = await import('bcryptjs');
    const ok = await bcrypt.compare(password, user.passwordHash);
    steps['4_local_bcrypt'] = ok ? '✅ senha local válida' : '❌ senha local inválida';
    authenticated = ok;
  }

  steps['resultado'] = authenticated ? '✅ Login seria bem-sucedido' : '❌ Login negado';

  // Teste 5: Chamar signIn do NextAuth server-side
  try {
    const signInResult = await signIn('credentials', {
      username: u,
      password,
      redirect: false,
    });
    steps['5_nextauth_signIn'] = { ok: true, result: signInResult };
  } catch (err) {
    const error = err as Error & { cause?: unknown; code?: string; type?: string };
    steps['5_nextauth_signIn'] = {
      ok: false,
      name: error.name,
      message: error.message,
      type: error.type,
      code: error.code,
      cause: error.cause ? String(error.cause) : undefined,
      stack: error.stack?.split('\n').slice(0, 8),
    };
  }

  return NextResponse.json(steps, { status: 200 });
}
