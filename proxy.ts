// proxy.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { decrypt } from '@/lib/session';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'session';

const protectedPrefixes = [
  '/dashboard',
  '/meus-chamados',
  '/chamados-atribuidos',
  '/gestao',
  '/relatorios',
  '/relatorio-imr',
  '/catalogo',
  '/tecnicos',
  '/unidades',
  '/usuarios',
  '/sla',
];

// Rotas que requerem role de Admin
const ADMIN_ONLY = ['/usuarios', '/catalogo', '/unidades'];

function isProtected(pathname: string) {
  return protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAdminRoute(pathname: string) {
  return ADMIN_ONLY.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

function isPublic(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/login/');
}

function isIgnored(pathname: string) {
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/api')) return true;
  return false;
}

// ✅ Next 16.1+ usa proxy no lugar de middleware
export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isIgnored(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = await decrypt(token);

  // /login é público; se já logado, manda pro /dashboard
  if (isPublic(pathname)) {
    if (session?.userId) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }

  // Protege páginas do dashboard e módulos - requer login
  if (isProtected(pathname) && !session?.userId) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Verifica se a rota requer admin e se o usuário tem role de Admin
  if (isAdminRoute(pathname) && session?.role !== 'Admin') {
    // Redireciona para home se não for admin
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
