import { requireAdmin } from '@/lib/dal';

export default async function SlaLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
