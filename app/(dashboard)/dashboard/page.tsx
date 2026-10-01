import { DashboardAdminContent } from '@/app/(dashboard)/dashboard/_components/DashboardAdminContent';
import { DashboardPrepostoContent } from '@/app/(dashboard)/dashboard/_components/DashboardPrepostoContent';
import { DashboardSolicitanteContent } from '@/app/(dashboard)/dashboard/_components/DashboardSolicitanteContent';
import { DashboardTecnicoContent } from '@/app/(dashboard)/dashboard/_components/DashboardTecnicoContent';
import { PainelIndisponivel } from '@/app/(dashboard)/dashboard/_components/PainelIndisponivel';
import {
  getDashboardAdminData,
  getDashboardPrepostoData,
  getDashboardSolicitanteData,
  getDashboardTecnicoData,
} from '@/app/(dashboard)/dashboard/actions';
import { PageEnter } from '@/components/motion/page-enter';
import { requireSession } from '@/lib/dal';

export default async function DashboardPage() {
  const session = await requireSession();

  if (session.role === 'Admin') {
    const data = await getDashboardAdminData();
    if (data) {
      return (
        <PageEnter>
          <DashboardAdminContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Solicitante') {
    const data = await getDashboardSolicitanteData();
    if (data) {
      return (
        <PageEnter>
          <DashboardSolicitanteContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Preposto') {
    const data = await getDashboardPrepostoData();
    if (data) {
      return (
        <PageEnter>
          <DashboardPrepostoContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Técnico') {
    const data = await getDashboardTecnicoData();
    if (data) {
      return (
        <PageEnter>
          <DashboardTecnicoContent data={data} />
        </PageEnter>
      );
    }
  }

  // Perfil sem painel próprio ou dados indisponíveis: nunca mostra números inventados.
  return (
    <PageEnter>
      <PainelIndisponivel />
    </PageEnter>
  );
}
