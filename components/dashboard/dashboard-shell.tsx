'use client';

import { cn } from '@/lib/utils';
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  useSidebarStore,
} from '@/lib/stores/sidebar-store';

import { Sidebar } from '@/components/sidebar/sidebar';

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
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-6 md:px-6">
          {children}
        </div>
      </main>
    </>
  );
}
