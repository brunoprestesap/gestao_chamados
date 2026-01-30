import { requireAdmin } from '@/lib/dal';

export default async function ImrLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
