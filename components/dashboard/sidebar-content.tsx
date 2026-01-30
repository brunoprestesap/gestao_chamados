'use client';

import { LogOut, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { logoutAction } from '@/app/(auth)/login/actions';
import { NAV_GROUP_ORDER, NAV_ITEMS } from '@/components/dashboard/nav';
import type { NavItem } from '@/components/dashboard/nav';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type SessionUser = {
  name: string;
  role: string;
  username: string;
};

function filterByRole(items: readonly NavItem[], role: string | undefined): NavItem[] {
  if (!role) return [];
  return items.filter((item) => {
    if (!item.allowedRoles) return true;
    return item.allowedRoles.includes(role as (typeof item.allowedRoles)[number]);
  });
}

function groupItems(items: NavItem[]) {
  const byGroup = new Map<NavItem['group'], NavItem[]>();
  for (const item of items) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  return NAV_GROUP_ORDER.map((group) => ({ group, items: byGroup.get(group) ?? [] })).filter(
    (g) => g.items.length > 0,
  );
}

export function SidebarContent({
  onNavigate,
  inDrawer,
}: { onNavigate?: () => void; inDrawer?: boolean }) {
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

  const grouped = useMemo(() => {
    const filtered = filterByRole([...NAV_ITEMS], user?.role);
    return groupItems(filtered);
  }, [user?.role]);

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-linear-to-br from-slate-100 via-blue-50/80 to-indigo-100/90 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/90 text-foreground',
        inDrawer && 'pt-14',
      )}
    >
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Wrench className="h-5 w-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">Chamados</p>
          <p className="truncate text-xs text-muted-foreground">
            Manutenção Predial & HVAC
          </p>
        </div>
      </div>

      {/* Navegação em grupos */}
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-6 px-3 py-4">
          {grouped.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <p
                className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                aria-hidden
              >
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-3 rounded-md border-l-2 py-2 pr-3 pl-[10px] text-sm transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2',
                        isActive
                          ? 'border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'border-transparent text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator />

      {/* Rodapé: usuário + Sair */}
      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold uppercase text-sidebar-accent-foreground"
            aria-hidden
          >
            {user?.name?.charAt(0) ?? user?.username?.charAt(0) ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name ?? 'Carregando…'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.role ?? '—'}</p>
          </div>
          <form action={logoutAction} className="shrink-0">
            <Button type="submit" variant="ghost" size="icon" title="Sair" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
