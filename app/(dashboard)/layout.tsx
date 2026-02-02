import '@/app/globals.css';

import { ExpedienteConfigProvider } from '@/components/config/expediente-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MobileHeader } from '@/components/dashboard/mobile-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExpedienteConfigProvider>
      <div className="min-h-screen bg-muted/40">
        <MobileHeader />
        <DashboardShell>{children}</DashboardShell>
      </div>
    </ExpedienteConfigProvider>
  );
}
