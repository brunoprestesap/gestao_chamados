import '@/app/globals.css';

import { ExpedienteConfigProvider } from '@/components/config/expediente-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MobileHeader } from '@/components/dashboard/mobile-header';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExpedienteConfigProvider>
      <RealtimeProvider>
        <div className="min-h-screen bg-muted/40">
          <MobileHeader />
          <DashboardShell>{children}</DashboardShell>
        </div>
      </RealtimeProvider>
    </ExpedienteConfigProvider>
  );
}
