import { requireManager } from '@/lib/dal';

export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  await requireManager();
  return <>{children}</>;
}
