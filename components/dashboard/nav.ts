// components/dashboard/nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Calendar,
  CalendarClock,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  Repeat,
  Settings,
  Ticket,
  TicketCheck,
  TrendingDown,
  Users,
  Wrench,
} from 'lucide-react';

/** Roles que podem ver o item. Se ausente, todos os roles têm acesso. */
export type NavItemRole = 'Admin' | 'Preposto' | 'Solicitante' | 'Técnico';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Grupo/seção do menu. Usado para agrupar e exibir títulos de seção. */
  group: 'Principal' | 'Chamados' | 'Gestão' | 'Admin';
  /** Apenas estes roles veem o item. Se não informado, todos veem. */
  allowedRoles?: readonly NavItemRole[];
};

/** Ordem dos grupos na sidebar */
export const NAV_GROUP_ORDER: readonly NavItem['group'][] = [
  'Principal',
  'Chamados',
  'Gestão',
  'Admin',
];

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Painel de Gestão',
    href: '/dashboard',
    icon: LayoutDashboard,
    group: 'Principal',
  },
  {
    label: 'Meus Chamados',
    href: '/meus-chamados',
    icon: Ticket,
    group: 'Principal',
  },
  {
    label: 'Chamados Atribuídos',
    href: '/chamados-atribuidos',
    icon: TicketCheck,
    group: 'Chamados',
    allowedRoles: ['Técnico'],
  },
  {
    label: 'Gestão',
    href: '/gestao',
    icon: ClipboardList,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Chamados Recorrentes',
    href: '/gestao/recurring',
    icon: Repeat,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Painel de Gestão SLA',
    href: '/sla-dashboard',
    icon: Gauge,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Relatórios IMR',
    href: '/relatorios/imr',
    icon: FileText,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Relatório de Breaches',
    href: '/relatorios/breach',
    icon: TrendingDown,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Catálogo',
    href: '/catalogo',
    icon: Wrench,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Unidades',
    href: '/unidades',
    icon: Building2,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Usuários',
    href: '/usuarios',
    icon: Users,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'SLA',
    href: '/sla',
    icon: Settings,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Expediente',
    href: '/configuracoes/expediente',
    icon: CalendarClock,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Feriados',
    href: '/configuracoes/feriados',
    icon: Calendar,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
];
