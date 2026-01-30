'use client';

import { Menu, Wrench } from 'lucide-react';
import { useState } from 'react';

import { SidebarContent } from '@/components/dashboard/sidebar-content';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 border-b border-sidebar-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu de navegação"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Wrench className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Chamados</p>
            <p className="truncate text-xs text-muted-foreground">
              Manutenção Predial & HVAC
            </p>
          </div>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[280px] max-w-[85vw] p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarContent onNavigate={() => setOpen(false)} inDrawer />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
