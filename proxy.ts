// proxy.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

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
  '/configuracoes',
  '/ativos',
];

const ADMIN_ONLY = ['/usuarios', '/catalogo', '/unidades', '/configuracoes', '/ativos/importar'];

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

// Next 16.1+ usa proxy no lugar de middleware
export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isIgnored(pathname)) return NextResponse.next();

  const session = await auth();

  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (isPublic(pathname)) {
    if (userId) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }

  if (isProtected(pathname) && !userId) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminRoute(pathname) && role !== 'Admin') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

// `api/ativos/documentos` fica fora do matcher: com o proxy rodando, o Next guarda
// o corpo só até 10 MB e corta o resto sem erro, e o documento aceita até 20 MB
// (spec 0013, AC-15). O proxy já ignora `/api`, então nada muda na checagem.
export const config = {
  matcher: ['/((?!api/ativos/documentos|_next/static|_next/image|favicon.ico).*)'],
};
