import './globals.css';

import type { Metadata } from 'next';
import { Toaster } from 'sonner';

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
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
