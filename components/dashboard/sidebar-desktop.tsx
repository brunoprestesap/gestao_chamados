import { SidebarContent } from '@/components/dashboard/sidebar-content';

const SIDEBAR_WIDTH = 280;

export function SidebarDesktop() {
  return (
    <aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:flex-col border-r border-sidebar-border bg-linear-to-br from-slate-100 via-blue-50/80 to-indigo-100/90 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/90"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div className="flex h-full flex-col">
        <SidebarContent />
      </div>
    </aside>
  );
}

