import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from './auth';

/**
 * Regras de acesso:
 * - Login em /login (pública)
 * - Protege páginas do dashboard e APIs privadas
 * - /usuarios e /api/users somente Admin | Preposto
 * - Login por matrícula (já tratado no NextAuth Credentials)
 */

function canManageUsers(role?: string) {
  return role === 'Admin' || role === 'Preposto';
}

function isPublicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/login/');
}

function isIgnoredPath(pathname: string) {
  // Next internals / assets
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;

  // NextAuth endpoints
  if (pathname.startsWith('/api/auth')) return true;

  // Se você tiver assets estáticos (opcional)
  if (pathname.startsWith('/assets')) return true;

  return false;
}

function isProtectedPage(pathname: string) {
  // Ajuste aqui conforme as rotas do seu dashboard
  const protectedPrefixes = ['/dashboard', '/catalogo', '/unidades', '/usuarios'];

  return protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isPrivateApi(pathname: string) {
  // Qualquer /api exceto /api/auth
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/auth');
}

/**
 * ✅ Next 16.1+ espera "proxy" no lugar do "middleware".
 */
export const proxy = auth((req: NextRequest) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Não interceptar arquivos internos/estáticos
  if (isIgnoredPath(pathname)) return NextResponse.next();

  const isLogged = !!req.auth?.user;
  const role = (req.auth?.user as any)?.role as string | undefined;

  // /login é público (se já logado, redireciona)
  if (isPublicPath(pathname)) {
    if (isLogged) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }

  // Protege páginas do app
  if (isProtectedPage(pathname) && !isLogged) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Protege APIs privadas
  if (isPrivateApi(pathname) && !isLogged) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Autorização específica: /usuarios e /api/users apenas Admin/Preposto
  if (pathname.startsWith('/usuarios')) {
    if (!canManageUsers(role)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  if (pathname.startsWith('/api/users')) {
    if (!canManageUsers(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.next();
});

/**
 * Matcher: intercepta tudo menos estáticos internos do Next.
 * (o ignore também reforça, mas o matcher reduz o custo)
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
