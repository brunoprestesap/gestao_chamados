import { requireAdmin } from '@/lib/dal';

export default async function IaConfiancaLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
