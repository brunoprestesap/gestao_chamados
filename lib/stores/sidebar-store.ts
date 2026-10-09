import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'sidebar-collapsed';

export type SidebarState = {
  collapsed: boolean;
  /** Grupos do menu que a pessoa recolheu (lembrados entre visitas). */
  gruposFechados: string[];
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  alternarGrupo: (grupo: string) => void;
  abrirGrupo: (grupo: string) => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      gruposFechados: [],
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      alternarGrupo: (grupo) =>
        set((s) => ({
          gruposFechados: s.gruposFechados.includes(grupo)
            ? s.gruposFechados.filter((g) => g !== grupo)
            : [...s.gruposFechados, grupo],
        })),
      abrirGrupo: (grupo) =>
        set((s) =>
          s.gruposFechados.includes(grupo)
            ? { gruposFechados: s.gruposFechados.filter((g) => g !== grupo) }
            : s,
        ),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        collapsed: state.collapsed,
        gruposFechados: state.gruposFechados,
      }),
    },
  ),
);

export const SIDEBAR_WIDTH_EXPANDED = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 72;
