'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';

import type { NavItem } from '@/components/dashboard/nav';
import { NAV_GROUP_ORDER, NAV_ITEMS } from '@/components/dashboard/nav';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import { SigmaLogo } from '@/components/sigma-logo';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  const sidebarClasses = inDrawer
    ? 'bg-sidebar text-sidebar-foreground'
    : '';

  return (
    <div
      className={cn(
        'flex h-full flex-col',
        sidebarClasses,
        inDrawer && 'pt-14',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-sidebar-border py-5',
          collapsed ? 'flex-col justify-center gap-2 px-0' : 'gap-3 px-5',
        )}
      >
        <SigmaLogo size={36} />
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
                className="truncate text-sm font-bold tracking-tight text-sidebar-foreground"
                title="Sigma"
              >
                Sigma
              </p>
              <p
                className="truncate text-[11px] text-sidebar-foreground/50"
                title="Gestão de Chamados"
              >
                Gestão de Chamados
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
              <SidebarToggle className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover" />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className={cn('flex flex-col px-3 py-4', collapsed ? 'gap-2' : 'gap-5')}>
          {grouped.map(({ group, items }) => (
            <div key={group} className="space-y-0.5">
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.p
                    key={`title-${group}`}
                    className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35"
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
                        'group/item flex items-center rounded-lg py-2.5 text-[13px] font-medium transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2',
                        collapsed
                          ? 'justify-center px-2.5'
                          : 'gap-3 px-3',
                        isActive
                          ? 'bg-sidebar-active font-semibold text-sidebar-active-foreground'
                          : 'text-sidebar-foreground/65 hover:bg-sidebar-hover hover:text-sidebar-hover-foreground',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          isActive
                            ? 'text-sidebar-primary'
                            : 'text-sidebar-foreground/50 group-hover/item:text-sidebar-foreground/80',
                        )}
                        aria-hidden
                      />
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

      {/* Footer: user + logout */}
      <div
        className={cn(
          'shrink-0 border-t border-sidebar-border p-4',
          collapsed && 'flex flex-col items-center gap-2 px-2',
        )}
      >
        <div className={cn('flex items-center gap-3', collapsed && 'flex-col gap-2')}>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-blue-600 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/20"
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
                  className="truncate text-sm font-medium text-sidebar-foreground"
                  title={user?.name ?? undefined}
                >
                  {user?.name ?? 'Carregando...'}
                </p>
                <p
                  className="truncate text-[11px] text-sidebar-foreground/45"
                  title={user?.role ?? undefined}
                >
                  {user?.role ?? '—'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Sair"
                  className={cn(
                    'h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-hover',
                    collapsed && 'h-9 w-9',
                  )}
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Sair
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
