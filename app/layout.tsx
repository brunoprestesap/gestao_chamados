import './globals.css';

import type { Metadata } from 'next';

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
      <body>{children}</body>
    </html>
  );
}
