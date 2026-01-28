// app/page.tsx
import { redirect } from 'next/navigation';

import { verifySession } from '@/lib/dal';

export default async function HomePage() {
  const session = await verifySession();

  if (session?.userId) {
    redirect('/dashboard');
  }

  redirect('/login');
}
