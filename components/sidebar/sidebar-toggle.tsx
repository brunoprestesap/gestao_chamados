'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useSidebarStore } from '@/lib/stores/sidebar-store';

type SidebarToggleProps = {
  className?: string;
};

export function SidebarToggle({ className }: SidebarToggleProps) {
  const { collapsed, toggle } = useSidebarStore();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('shrink-0', className)}
      aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" aria-hidden />
      ) : (
        <PanelLeftClose className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}
