'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Sino de notificações: exibe contador das últimas não lidas e link para lista.
 * Inserir no header/nav do dashboard (ex: components/dashboard/header.tsx ou mobile-header.tsx).
 * GET /api/notifications retorna últimas 20; contador = quantas têm readAt === null.
 */
export function NotificationsBell() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Array<{ readAt: string | null }>) => {
        if (!cancelled) {
          const unread = list.filter((n) => n.readAt == null).length;
          setCount(unread);
        }
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Button variant="ghost" size="icon" asChild className="relative">
      <Link href="/meus-chamados" aria-label="Notificações" className="relative inline-flex">
        <Bell className="h-5 w-5" />
        {!loading && count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
