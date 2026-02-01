import { requireAdmin } from '@/lib/dal';

export default async function FeriadosLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
