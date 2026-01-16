'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { SidebarContent } from '@/components/dashboard/sidebar-content';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="leading-tight">
          <p className="text-sm font-semibold">Manutenção</p>
          <p className="text-xs text-muted-foreground">Sistema de Chamados</p>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-6 py-4">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Navegação do sistema</SheetDescription>
          </SheetHeader>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
