import './globals.css';

import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { AuthSessionProvider } from '@/components/providers/session-provider';

export const metadata: Metadata = {
  title: 'Severino',
  description: 'Sistema de gerenciamento de chamados da manutenção',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthSessionProvider>
          {children}
          <Toaster richColors position="top-center" closeButton />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
