'use client';

import { motion } from 'framer-motion';

import { SidebarContent } from '@/components/dashboard/sidebar-content';
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  useSidebarStore,
} from '@/lib/stores/sidebar-store';

const springTransition = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 30,
};

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);

  return (
    <motion.aside
      className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:flex-col border-r border-border bg-background overflow-hidden"
      initial={false}
      animate={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
      }}
      transition={springTransition}
      aria-label="Barra lateral de navegação"
    >
      <div className="flex h-full w-full flex-col min-w-0">
        <SidebarContent collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}
