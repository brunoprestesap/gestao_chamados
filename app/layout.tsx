import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { AuthSessionProvider } from '@/components/providers/session-provider';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';

export const metadata: Metadata = {
  title: 'Sigma - Sistema Integrado de Manutenção',
  description: 'Sistema integrado de gerenciamento de chamados de manutenção',
  icons: {
    icon: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sigma',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
