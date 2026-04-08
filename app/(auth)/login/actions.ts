'use server';

import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { AuthError } from 'next-auth';

import { signIn } from '@/auth';

export async function loginAction(username: string, password: string, callbackUrl: string) {
  try {
    await signIn('credentials', {
      username,
      password,
      redirectTo: callbackUrl,
    });

    return { ok: true };
  } catch (err) {
    // signIn bem-sucedido lança NEXT_REDIRECT — re-throw para o Next.js tratar
    if (isRedirectError(err)) {
      throw err;
    }

    // Erros de autenticação (CredentialsSignin, etc.)
    if (err instanceof AuthError) {
      return { ok: false, error: 'Matrícula ou senha incorretos. Verifique e tente novamente.' };
    }

    console.error('[Login] Erro inesperado:', err);
    return { ok: false, error: 'Não foi possível acessar. Tente novamente em instantes.' };
  }
}
