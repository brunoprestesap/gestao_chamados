import '@/app/globals.css';

import { ExpedienteConfigProvider } from '@/components/config/expediente-provider';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MobileHeader } from '@/components/dashboard/mobile-header';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';
import { requireSession } from '@/lib/dal';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessao = await requireSession();

  return (
    <ExpedienteConfigProvider>
      <RealtimeProvider userId={sessao.userId}>
        <div className="min-h-screen bg-background">
          <MobileHeader />
          <DashboardShell>{children}</DashboardShell>
        </div>
      </RealtimeProvider>
    </ExpedienteConfigProvider>
  );
}
