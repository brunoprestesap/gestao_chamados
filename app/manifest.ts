import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sigma - Sistema Integrado de Manutenção',
    short_name: 'Sigma',
    description:
      'Sistema integrado de gerenciamento de chamados de manutenção',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8f9fc',
    theme_color: '#4f46e5',
    orientation: 'any',
    icons: [
      {
        src: '/icon-192x192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512x512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  };
}
