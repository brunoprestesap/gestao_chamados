import { SidebarContent } from '@/components/dashboard/sidebar-content';

export function SidebarDesktop() {
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:w-64 md:flex-col">
      <div className="h-full border-r">
        <SidebarContent />
      </div>
    </aside>
  );
}
