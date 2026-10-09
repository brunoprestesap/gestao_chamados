'use client';

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'framer-motion';
import { ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useId, useMemo, useState } from 'react';

import type { NavGroup, NavItem } from '@/components/dashboard/nav';
import {
  hrefAtivo,
  NAV_GROUP_LABEL,
  NAV_GROUP_ORDER,
  NAV_GROUPS_RECOLHIVEIS,
  NAV_ITEMS,
} from '@/components/dashboard/nav';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import { SigmaLogo } from '@/components/sigma-logo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { cn } from '@/lib/utils';

type SessionUser = {
  userId: string;
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
  const byGroup = new Map<NavGroup, NavItem[]>();
  for (const item of items) {
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  return NAV_GROUP_ORDER.map((group) => ({ group, items: byGroup.get(group) ?? [] })).filter(
    (g) => g.items.length > 0,
  );
}

function iniciais(nome: string | undefined): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? '') : '';
  return (primeira + ultima).toUpperCase() || '?';
}

const labelVariants = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -6 },
};

const indicadorSpring = { type: 'spring' as const, stiffness: 520, damping: 40 };

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
  const gruposFechados = useSidebarStore((s) => s.gruposFechados);
  const alternarGrupo = useSidebarStore((s) => s.alternarGrupo);
  const abrirGrupo = useSidebarStore((s) => s.abrirGrupo);
  // Desktop e gaveta podem coexistir: cada um anima o próprio indicador.
  const layoutId = useId();

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.userId) {
          setUser({
            userId: data.userId,
            name: data.name ?? data.username,
            role: data.role ?? '—',
            username: data.username ?? '',
          });
        }
      })
      .catch(() => {});
  }, []);

  // Vistoria em campo (spec 0012, AC-15): avisa das conferências ainda no
  // aparelho e apaga o pacote da pessoa; a fila fica para o próximo login dela.
  const [pendentesAoSair, setPendentesAoSair] = useState(0);

  async function sairDeVez() {
    if (user?.userId) {
      try {
        const { apagarPacote } = await import('@/lib/vistoria-offline');
        await apagarPacote(user.userId);
      } catch {
        // Sem IndexedDB não há pacote a apagar.
      }
    }
    await signOut({ callbackUrl: '/login' });
  }

  async function sair() {
    let pendentes = 0;
    if (user?.userId) {
      try {
        const { contarPendentes } = await import('@/lib/vistoria-offline');
        pendentes = await contarPendentes(user.userId);
      } catch {
        pendentes = 0;
      }
    }
    if (pendentes > 0) {
      setPendentesAoSair(pendentes);
      return;
    }
    await sairDeVez();
  }

  const grouped = useMemo(() => {
    const filtered = filterByRole([...NAV_ITEMS], user?.role);
    return groupItems(filtered);
  }, [user?.role]);
  const ativo = hrefAtivo(
    pathname,
    grouped.flatMap(({ items }) => items.map((i) => i.href)),
  );
  const grupoAtivo = grouped.find(({ items }) => items.some((i) => i.href === ativo))?.group;

  // Quem chega a uma tela de um grupo recolhido vê o grupo aberto.
  useEffect(() => {
    if (grupoAtivo) abrirGrupo(grupoAtivo);
  }, [grupoAtivo, abrirGrupo]);

  const sidebarClasses = inDrawer ? 'bg-sidebar text-sidebar-foreground' : '';

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          'relative isolate flex h-full flex-col overflow-hidden',
          sidebarClasses,
          inDrawer && 'pt-14',
        )}
      >
        {/* Atmosfera: brilho índigo no topo e filete de luz na borda direita */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(130%_70%_at_0%_0%,oklch(0.55_0.21_268/0.22),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-[radial-gradient(90%_80%_at_100%_100%,oklch(0.6_0.17_240/0.10),transparent_70%)]"
        />
        {!inDrawer && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/15 via-white/[0.04] to-transparent"
          />
        )}

        {/* Header */}
        <div
          className={cn(
            'flex shrink-0 items-center py-5',
            collapsed ? 'flex-col justify-center gap-3 px-0' : 'gap-3 px-5',
          )}
        >
          <div className="relative shrink-0">
            <div aria-hidden className="absolute -inset-1.5 rounded-2xl bg-indigo-500/25 blur-md" />
            <SigmaLogo size={36} className="relative" />
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
                  className="truncate text-[15px] font-bold tracking-tight text-sidebar-foreground"
                  title="Sigma"
                >
                  Sigma
                </p>
                <p
                  className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-sidebar-foreground/40"
                  title="Sistema Integrado de Manutenção"
                >
                  Manutenção integrada
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
                <SidebarToggle className="h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-hover hover:text-sidebar-foreground" />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div
          aria-hidden
          className="mx-4 h-px shrink-0 bg-gradient-to-r from-transparent via-sidebar-border to-transparent"
        />

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1">
          <LayoutGroup id={layoutId}>
            <nav
              aria-label="Menu principal"
              className={cn('flex flex-col px-3 py-4', collapsed ? 'gap-1' : 'gap-4')}
            >
              {grouped.map(({ group, items }, indice) => {
                const recolhivel = !collapsed && NAV_GROUPS_RECOLHIVEIS.includes(group);
                const aberto = collapsed || !recolhivel || !gruposFechados.includes(group);
                const listaId = `${layoutId}-grupo-${indice}`;
                const titulo = NAV_GROUP_LABEL[group];

                return (
                  <div key={group} role="group" aria-label={titulo}>
                    {collapsed ? (
                      indice > 0 && (
                        <div aria-hidden className="mx-auto my-2 h-px w-6 bg-sidebar-border" />
                      )
                    ) : recolhivel ? (
                      <button
                        type="button"
                        onClick={() => alternarGrupo(group)}
                        aria-expanded={aberto}
                        aria-controls={listaId}
                        className={cn(
                          'group/titulo mb-1 flex w-full items-center gap-2 rounded-md px-3 py-1 text-left',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                        )}
                      >
                        <TituloGrupo titulo={titulo} ativo={group === grupoAtivo} />
                        {!aberto && (
                          <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] font-semibold tabular-nums text-sidebar-foreground/50">
                            {items.length}
                          </span>
                        )}
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 text-sidebar-foreground/30 transition-transform duration-200 group-hover/titulo:text-sidebar-foreground/70',
                            !aberto && '-rotate-90',
                          )}
                        />
                      </button>
                    ) : (
                      <div className="mb-1 flex items-center gap-2 px-3 py-1" aria-hidden>
                        <TituloGrupo titulo={titulo} ativo={group === grupoAtivo} />
                      </div>
                    )}

                    <AnimatePresence initial={false}>
                      {aberto && (
                        <motion.ul
                          id={listaId}
                          key="lista"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                          className={cn(
                            'space-y-0.5',
                            collapsed && 'flex flex-col items-center gap-0.5 space-y-0',
                            // A margem negativa deixa a barra do item ativo encostar na borda.
                            !collapsed && '-mx-3 overflow-hidden px-3',
                          )}
                        >
                          {items.map((item) => (
                            <li key={item.href} className={cn(!collapsed && 'w-full')}>
                              <ItemMenu
                                item={item}
                                ativo={item.href === ativo}
                                collapsed={collapsed}
                                onNavigate={onNavigate}
                              />
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </LayoutGroup>
        </ScrollArea>

        {/* Footer: user + logout */}
        <div className={cn('shrink-0 p-3', collapsed && 'px-2')}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl bg-white/[0.035] p-2.5 ring-1 ring-inset ring-white/[0.06]',
              collapsed && 'flex-col gap-2 bg-transparent p-1.5 ring-0',
            )}
          >
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-blue-600 text-[12px] font-bold tracking-wide text-white shadow-lg shadow-indigo-500/25 ring-1 ring-inset ring-white/20"
              aria-hidden
            >
              {iniciais(user?.name ?? user?.username)}
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
                    className="truncate text-[13px] font-semibold text-sidebar-foreground"
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
                      'h-8 w-8 rounded-lg text-sidebar-foreground/45 hover:bg-rose-500/15 hover:text-rose-300',
                      collapsed && 'h-9 w-9',
                    )}
                    onClick={() => void sair()}
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
        <Dialog
          open={pendentesAoSair > 0}
          onOpenChange={(aberto) => !aberto && setPendentesAoSair(0)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Há conferências aguardando envio</DialogTitle>
              <DialogDescription>
                {pendentesAoSair === 1
                  ? '1 conferência da vistoria ainda não subiu.'
                  : `${pendentesAoSair} conferências da vistoria ainda não subiram.`}{' '}
                Elas ficam guardadas neste aparelho e sobem quando você entrar de novo e abrir o
                campo.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Ficar</Button>
              </DialogClose>
              <Button onClick={() => void sairDeVez()}>Sair mesmo assim</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MotionConfig>
  );
}

function TituloGrupo({ titulo, ativo }: { titulo: string; ativo: boolean }) {
  return (
    <>
      <span
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
          ativo ? 'text-sidebar-active-foreground/80' : 'text-sidebar-foreground/35',
          'group-hover/titulo:text-sidebar-foreground/70',
        )}
      >
        {titulo}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 bg-gradient-to-r from-sidebar-border to-transparent"
      />
    </>
  );
}

function ItemMenu({
  item,
  ativo,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  ativo: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'group/item relative isolate flex items-center rounded-lg text-[13px] font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2',
        ativo
          ? 'text-sidebar-active-foreground'
          : 'text-sidebar-foreground/65 hover:bg-sidebar-hover hover:text-sidebar-hover-foreground',
      )}
    >
      {ativo && (
        <>
          <motion.span
            layoutId="sidebar-item-ativo-fundo"
            transition={indicadorSpring}
            aria-hidden
            className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-sidebar-primary/[0.22] via-sidebar-primary/[0.10] to-sidebar-primary/[0.03] ring-1 ring-inset ring-sidebar-primary/20"
          />
          <motion.span
            layoutId="sidebar-item-ativo-barra"
            transition={indicadorSpring}
            aria-hidden
            className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary shadow-[0_0_12px_2px_oklch(0.65_0.19_264/0.55)]"
          />
        </>
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-[color,transform] duration-150',
          ativo
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground/45 group-hover/item:scale-110 group-hover/item:text-sidebar-foreground/85',
        )}
        aria-hidden
      />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            key="label"
            className={cn(
              'truncate transition-transform duration-150',
              !ativo && 'group-hover/item:translate-x-0.5',
              ativo && 'font-semibold',
            )}
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

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
