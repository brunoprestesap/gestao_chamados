// components/dashboard/nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileBadge,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Gauge,
  LayoutDashboard,
  MapPinned,
  MessagesSquare,
  PackageSearch,
  Repeat,
  Settings,
  Sparkles,
  Tags,
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
    label: 'Conversas',
    href: '/conversas',
    icon: MessagesSquare,
    group: 'Principal',
  },
  {
    label: 'Meus Chamados',
    href: '/meus-chamados',
    icon: Ticket,
    group: 'Principal',
  },
  {
    label: 'Ativos',
    href: '/ativos',
    icon: PackageSearch,
    group: 'Principal',
  },
  {
    label: 'Vistoria',
    href: '/ativos/vistoria',
    icon: ClipboardCheck,
    group: 'Principal',
    allowedRoles: ['Admin', 'Preposto', 'Técnico'],
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
    label: 'Localizações',
    href: '/ativos/localizacoes',
    icon: MapPinned,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Documentos',
    href: '/ativos/documentos',
    icon: FileBadge,
    group: 'Gestão',
    allowedRoles: ['Admin', 'Preposto', 'Técnico'],
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
    label: 'Relatório por contrato',
    href: '/relatorios/contrato',
    icon: FileSpreadsheet,
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
  {
    label: 'Calibração da IA',
    href: '/configuracoes/ia-confianca',
    icon: Sparkles,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Categorias de ativo',
    href: '/configuracoes/categorias-ativo',
    icon: Tags,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Tipos de documento',
    href: '/configuracoes/tipos-documento',
    icon: FileText,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Contratos',
    href: '/configuracoes/contratos',
    icon: FileSignature,
    group: 'Admin',
    allowedRoles: ['Admin'],
  },
];

/**
 * O item do menu que corresponde à rota: o de `href` mais específico entre os
 * que casam (a própria rota ou um prefixo seguido de `/`). Assim, em
 * `/ativos/localizacoes` só "Localizações" fica marcado, não "Ativos" junto.
 */
export function hrefAtivo(pathname: string | null, hrefs: readonly string[]): string | null {
  if (!pathname) return null;
  let melhor: string | null = null;
  for (const href of hrefs) {
    const casa =
      href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    if (casa && (!melhor || href.length > melhor.length)) melhor = href;
  }
  return melhor;
}
