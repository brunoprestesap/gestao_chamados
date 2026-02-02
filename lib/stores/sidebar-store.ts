import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'sidebar-collapsed';

export type SidebarState = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
);

export const SIDEBAR_WIDTH_EXPANDED = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 72;
