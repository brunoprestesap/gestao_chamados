// components/dashboard/nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Ticket,
  TicketCheck,
  Users,
  Wrench,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Meus Chamados', href: '/meus-chamados', icon: Ticket },
  { label: 'Chamados Atribuídos', href: '/chamados-atribuidos', icon: TicketCheck },
  { label: 'Gestão de Chamados', href: '/gestao', icon: ClipboardList },
  { label: 'Relatório IMR', href: '/relatorio-imr', icon: FileText },
  { label: 'Catálogo de Serviços', href: '/catalogo', icon: Wrench },
  { label: 'Unidades', href: '/unidades', icon: Building2 },
  { label: 'Usuários', href: '/usuarios', icon: Users },
  { label: 'Configurações SLA', href: '/sla', icon: Settings },
] as const;
