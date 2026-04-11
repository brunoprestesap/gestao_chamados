import { requireManager } from '@/lib/dal';

import { SlaDashboardClient } from './_components/SlaDashboardClient';

export default async function SlaDashboardPage() {
  await requireManager();
  return <SlaDashboardClient />;
}
