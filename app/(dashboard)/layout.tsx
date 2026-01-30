import '@/app/globals.css';

import { MobileHeader } from '@/components/dashboard/mobile-header';
import { SidebarDesktop } from '@/components/dashboard/sidebar-desktop';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <MobileHeader />
      <SidebarDesktop />
      <main className="md:pl-[280px]">
        <div className="px-4 py-6 md:px-6">{children}</div>
      </main>
    </div>
  );
}
