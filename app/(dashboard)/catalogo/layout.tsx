import type { ReactNode } from 'react';

import { requireAdmin } from '@/lib/dal';

export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
