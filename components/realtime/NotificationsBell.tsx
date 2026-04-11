'use client';

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  MessageSquare,
  OctagonAlert,
  Paperclip,
  TicketCheck,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeTime } from '@/lib/format-relative-time';
import { getNotificationUrl } from '@/lib/notification-url';
import { cn } from '@/lib/utils';

interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationMeta {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
}

function getNotificationMeta(type: string): NotificationMeta {
  switch (type) {
    case 'ticket:assigned':
      return {
        icon: UserCheck,
        iconBg: 'bg-indigo-100 dark:bg-indigo-500/20',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        label: 'Chamado atribuído',
      };
    case 'ticket:new':
      return {
        icon: TicketCheck,
        iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        label: 'Novo chamado',
      };
    case 'ticket:execution_registered':
      return {
        icon: ClipboardCheck,
        iconBg: 'bg-amber-100 dark:bg-amber-500/20',
        iconColor: 'text-amber-600 dark:text-amber-400',
        label: 'Execução registrada',
      };
    case 'ticket:closed':
      return {
        icon: CheckCheck,
        iconBg: 'bg-sky-100 dark:bg-sky-500/20',
        iconColor: 'text-sky-600 dark:text-sky-400',
        label: 'Chamado encerrado',
      };
    case 'ticket:comment_added':
      return {
        icon: MessageSquare,
        iconBg: 'bg-violet-100 dark:bg-violet-500/20',
        iconColor: 'text-violet-600 dark:text-violet-400',
        label: 'Comentário adicionado',
      };
    case 'ticket:attachment_added':
      return {
        icon: Paperclip,
        iconBg: 'bg-rose-100 dark:bg-rose-500/20',
        iconColor: 'text-rose-600 dark:text-rose-400',
        label: 'Anexo adicionado',
      };
    case 'sla:warning':
      return {
        icon: AlertTriangle,
        iconBg: 'bg-amber-100 dark:bg-amber-500/20',
        iconColor: 'text-amber-600 dark:text-amber-400',
        label: 'SLA próximo do vencimento',
      };
    case 'sla:breach':
      return {
        icon: OctagonAlert,
        iconBg: 'bg-red-100 dark:bg-red-500/20',
        iconColor: 'text-red-600 dark:text-red-400',
        label: 'SLA estourou',
      };
    default:
      return {
        icon: Bell,
        iconBg: 'bg-muted',
        iconColor: 'text-muted-foreground',
        label: 'Notificação',
      };
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // readAt == null captura tanto null quanto undefined
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.readAt == null).length,
    [notifications],
  );

  const fetchNotifications = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/notifications', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: NotificationItem[]) => {
        setNotifications(list);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setNotifications([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Refetch when popover opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Listen for real-time socket events
  useEffect(() => {
    const handler = () => fetchNotifications();
    window.addEventListener('notification:new', handler);
    return () => window.removeEventListener('notification:new', handler);
  }, [fetchNotifications]);

  async function markAsRead(id: string) {
    const snapshot = notifications;
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      setNotifications(snapshot);
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    const snapshot = notifications;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      setNotifications(snapshot);
    } finally {
      setMarkingAll(false);
    }
  }

  function handleClickNotification(n: NotificationItem) {
    if (!n.readAt) markAsRead(n._id);
    setOpen(false);
    router.push(getNotificationUrl(n.type, n.data));
  }

  // Render plain button during SSR to avoid Radix ID hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-xl text-foreground/70"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={unreadCount > 0 ? `Notificações — ${unreadCount} não lidas` : 'Notificações'}
        >
          <Bell className="h-5 w-5" />
          {!loading && unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white shadow-sm ring-2 ring-background"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* Screen reader live region for unread count */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {unreadCount > 0 ? `${unreadCount} notificações não lidas` : ''}
      </span>

      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[340px] overflow-hidden rounded-2xl border border-border/50 p-0 shadow-xl shadow-black/8"
      >
        {/* Accent stripe */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-indigo-500 via-blue-500 to-indigo-400 opacity-80" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold tracking-tight">Notificações</h2>
            {unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                {unreadCount}
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={markingAll}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors',
                'hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
              aria-label="Marcar todas as notificações como lidas"
            >
              {markingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Marcar todas
            </button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[380px]">
          {loading ? (
            /* Loading skeleton */
            <div
              className="flex flex-col divide-y divide-border/40"
              aria-label="Carregando notificações"
              aria-busy="true"
            >
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="h-2.5 w-8 animate-pulse rounded bg-muted/60" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center gap-3 px-4 py-12">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/60">
                <BellOff className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/70">Tudo em dia</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Nenhuma notificação por enquanto
                </p>
              </div>
            </div>
          ) : (
            <div
              className="divide-y divide-border/40"
              role="list"
              aria-label="Lista de notificações"
            >
              {notifications.map((n) => {
                const meta = getNotificationMeta(n.type);
                const Icon = meta.icon;
                const isUnread = !n.readAt;

                return (
                  <button
                    key={n._id}
                    type="button"
                    role="listitem"
                    onClick={() => handleClickNotification(n)}
                    aria-label={`${meta.label}: ${n.title}${isUnread ? ' — não lida' : ''}`}
                    className={cn(
                      'group flex w-full items-start gap-3 px-4 py-3.5 text-left',
                      'transition-colors duration-150',
                      'hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      isUnread ? 'bg-primary/4' : 'bg-transparent',
                    )}
                  >
                    {/* Icon container with type-specific color */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        'relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-transform duration-150 group-hover:scale-105',
                        meta.iconBg,
                      )}
                    >
                      <Icon className={cn('h-4 w-4', meta.iconColor)} />
                      {/* Unread indicator dot on icon */}
                      {isUnread && (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'line-clamp-1 text-sm leading-snug',
                          isUnread
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-foreground/80',
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] font-medium text-muted-foreground/70">
                        {meta.label}
                      </p>
                    </div>

                    <span
                      aria-hidden="true"
                      className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground/60"
                    >
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {!loading && notifications.length > 0 && (
          <div className="border-t border-border/50 px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/meus-chamados');
              }}
              className={cn(
                'w-full rounded-lg py-1.5 text-center text-xs font-medium text-muted-foreground',
                'transition-colors hover:bg-accent hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
            >
              Ver todos os chamados
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
