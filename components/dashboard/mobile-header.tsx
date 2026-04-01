'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';

import { SidebarContent } from '@/components/dashboard/sidebar-content';
import { NotificationsBell } from '@/components/realtime/NotificationsBell';
import { SeverinoLogo } from '@/components/severino-logo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-foreground/70 hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu de navegação"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <SeverinoLogo size={30} />
          <p className="truncate text-sm font-bold tracking-tight" title="Severino">
            Severino
          </p>
        </div>
        <NotificationsBell />
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
