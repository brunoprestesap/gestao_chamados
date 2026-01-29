import { requireTechnician } from '@/lib/dal';

export default async function ChamadosAtribuidosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireTechnician();
  return <>{children}</>;
}
