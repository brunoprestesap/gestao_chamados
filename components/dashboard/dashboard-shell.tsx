'use client';

import { NotificationsBell } from '@/components/realtime/NotificationsBell';
import { Sidebar } from '@/components/sidebar/sidebar';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { cn } from '@/lib/utils';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <>
      <Sidebar />
      <main
        className={cn(
          'flex h-screen min-h-screen flex-col transition-[padding-left] duration-200 ease-out',
          collapsed ? 'md:pl-[72px]' : 'md:pl-[280px]',
        )}
      >
        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-6 backdrop-blur-xl md:flex lg:px-8">
          <SidebarToggle className="md:hidden" />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationsBell />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-6 md:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </main>
    </>
  );
}
