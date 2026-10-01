'use client';

import { LayoutDashboard, MessagesSquare } from 'lucide-react';
import Link from 'next/link';

import { EmptyState, PainelRoot } from '@/app/(dashboard)/dashboard/_components/painel-ui';
import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';

export function PainelIndisponivel() {
  return (
    <PainelRoot>
      <PageHeader title="Painel de Gestão" subtitle="Visão geral dos chamados de manutenção" />
      <EmptyState
        icon={LayoutDashboard}
        title="Não há indicadores para o seu perfil"
        description="Seus chamados e conversas continuam disponíveis no menu lateral."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/conversas">
              <MessagesSquare aria-hidden />
              Ir para conversas
            </Link>
          </Button>
        }
      />
    </PainelRoot>
  );
}
