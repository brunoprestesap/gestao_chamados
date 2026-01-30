'use client';

// Ícones (lucide)
import { LogOut, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { logoutAction } from '@/app/(auth)/login/actions';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { NAV_ITEMS } from './nav';

type SessionUser = {
  name: string;
  role: string;
  username: string;
};

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.userId) {
          setUser({
            name: data.name ?? data.username,
            role: data.role ?? '—',
            username: data.username ?? '',
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:w-64 md:flex-col">
      <div className="flex h-full flex-col border-r bg-background">
        {/* Topo / Logo */}
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Manutenção</p>
            <p className="text-xs text-muted-foreground">Sistema de Chamados</p>
          </div>
        </div>

        <Separator />

        {/* Menu */}
        <ScrollArea className="flex-1">
          <nav className="px-3 py-4">
            <div className="space-y-1">
              {NAV_ITEMS.filter((item) => {
                if (!user?.role) return false;
                if (!item.allowedRoles) return true;
                return item.allowedRoles.includes(user.role as (typeof item.allowedRoles)[number]);
              }).map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition',
                      'hover:bg-muted hover:text-foreground',
                      active && 'bg-muted text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </ScrollArea>

        <Separator />

        {/* Rodapé / Usuário */}
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
              {user?.name?.charAt(0) ?? user?.username?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name ?? 'Carregando…'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.role ?? '—'}</p>
            </div>
            <form action={logoutAction} className="shrink-0">
              <Button type="submit" variant="ghost" size="icon" title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
