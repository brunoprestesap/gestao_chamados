import '@/app/globals.css';

import { MobileHeader } from '@/components/dashboard/mobile-header';
import { SidebarDesktop } from '@/components/dashboard/sidebar-desktop';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Mobile top bar com hamburguer */}
      <MobileHeader />

      {/* Sidebar fixa no desktop */}
      <SidebarDesktop />

      <main className="md:pl-64">
        <div className="px-4 py-6 md:px-6">{children}</div>
      </main>
    </div>
  );
}
