'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { logoutAction } from '@/app/(auth)/login/actions';
import { NAV_GROUP_ORDER, NAV_ITEMS } from '@/components/dashboard/nav';
import type { NavItem } from '@/components/dashboard/nav';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

const labelVariants = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -6 },
};

export function SidebarContent({
  onNavigate,
  inDrawer,
  collapsed = false,
}: {
  onNavigate?: () => void;
  inDrawer?: boolean;
  collapsed?: boolean;
}) {
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
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-sidebar-border py-4',
          collapsed ? 'flex-col justify-center gap-2 px-0' : 'gap-3 px-5',
        )}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Wrench className="h-5 w-5" aria-hidden />
        </div>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="header-labels"
              className="min-w-0 flex-1 leading-tight"
              variants={labelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15 }}
            >
              <p
                className="truncate text-sm font-semibold text-sidebar-foreground"
                title="Severino"
              >
                Severino
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title="Manutenção Predial & HVAC"
              >
                Manutenção Predial & HVAC
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {!inDrawer && (
          <AnimatePresence mode="wait">
            <motion.div
              key={collapsed ? 'toggle-collapsed' : 'toggle-expanded'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0"
            >
              <SidebarToggle />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Navegação em grupos */}
      <ScrollArea className="flex-1">
        <nav className={cn('flex flex-col px-3 py-4', collapsed ? 'gap-2' : 'gap-6')}>
          {grouped.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.p
                    key={`title-${group}`}
                    className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                    aria-hidden
                    variants={labelVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.15 }}
                  >
                    {group}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center gap-0.5')}>
                {items.map((item) => {
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const linkContent = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center rounded-md border-l-[3px] py-2 text-sm transition-colors duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2',
                        collapsed
                          ? 'justify-center border-transparent px-0 pl-0'
                          : 'gap-3 pr-3 pl-[10px]',
                        isActive
                          ? 'border-sidebar-primary bg-sidebar-active text-sidebar-active-foreground font-semibold rounded-r-md [&_svg]:text-sidebar-active-foreground hover:bg-sidebar-active/90 dark:hover:bg-sidebar-active/80'
                          : 'border-transparent text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-hover-foreground hover:rounded-r-md',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <AnimatePresence mode="wait">
                        {!collapsed && (
                          <motion.span
                            key="label"
                            className="truncate"
                            variants={labelVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.15 }}
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  );
                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return (
                    <div key={item.href} className="w-full">
                      {linkContent}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator />

      {/* Rodapé: usuário + Sair */}
      <div
        className={cn(
          'shrink-0 border-t border-sidebar-border p-4',
          collapsed && 'flex flex-col items-center gap-2 px-2',
        )}
      >
        <div className={cn('flex items-center gap-3', collapsed && 'flex-col gap-2')}>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold uppercase text-sidebar-accent-foreground"
            aria-hidden
          >
            {user?.name?.charAt(0) ?? user?.username?.charAt(0) ?? '?'}
          </div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                key="user-info"
                className="min-w-0 flex-1"
                variants={labelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.15 }}
              >
                <p
                  className="truncate text-sm font-medium text-foreground"
                  title={user?.name ?? undefined}
                >
                  {user?.name ?? 'Carregando…'}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={user?.role ?? undefined}
                >
                  {user?.role ?? '—'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <form action={logoutAction} className="shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="Sair"
                  className={collapsed ? 'size-9' : undefined}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Sair
              </TooltipContent>
            </Tooltip>
          </form>
        </div>
      </div>
    </div>
  );
}
