import { requireAdmin } from '@/lib/dal';

export default async function ExpedienteLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
