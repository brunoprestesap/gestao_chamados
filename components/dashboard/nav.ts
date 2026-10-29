// components/dashboard/nav.ts
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileBadge,
  FileCog,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Gauge,
  Landmark,
  LayoutDashboard,
  MapPinned,
  MessagesSquare,
  PackageSearch,
  ReceiptText,
  Repeat,
  Scale,
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

export type NavGroup =
  | 'Principal'
  | 'Chamados'
  | 'Gestão'
  | 'Material'
  | 'Ativos'
  | 'Relatórios'
  | 'Admin';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Grupo/seção do menu. Usado para agrupar e exibir títulos de seção. */
  group: NavGroup;
  /** Apenas estes roles veem o item. Se não informado, todos veem. */
  allowedRoles?: readonly NavItemRole[];
  /**
   * Cotação de material (spec 0019): além do perfil, aparece para quem tem
   * designação vigente no fluxo; o Admin vê sempre (leitura).
   */
  exigeDesignacaoMaterial?: boolean;
};

/** Ordem dos grupos na sidebar */
export const NAV_GROUP_ORDER: readonly NavGroup[] = [
  'Principal',
  'Chamados',
  'Gestão',
  'Material',
  'Ativos',
  'Relatórios',
  'Admin',
];

/** Título que a sidebar mostra para cada grupo. */
export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  Principal: 'Principal',
  Chamados: 'Chamados',
  Gestão: 'Gestão',
  Material: 'Material',
  Ativos: 'Gestão de ativos',
  Relatórios: 'Relatórios',
  Admin: 'Administração',
};

/** Grupos que a pessoa pode recolher; o Principal fica sempre aberto. */
export const NAV_GROUPS_RECOLHIVEIS: readonly NavGroup[] = [
  'Gestão',
  'Material',
  'Ativos',
  'Relatórios',
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
  // ── Material (spec 0019): a fila das cotações, por designação
  {
    label: 'Cotações',
    href: '/cotacoes',
    icon: ReceiptText,
    group: 'Material',
    allowedRoles: ['Admin', 'Preposto', 'Técnico'],
    exigeDesignacaoMaterial: true,
  },
  {
    label: 'Cadastro de material',
    href: '/configuracoes/material',
    icon: Landmark,
    group: 'Material',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Relatório de material',
    href: '/relatorios/material',
    icon: BarChart3,
    group: 'Material',
    allowedRoles: ['Admin'],
  },
  // IMR do contrato (spec 0023): fiscal e gestor só existem para Admin, então basta o perfil
  {
    label: 'IMR do contrato',
    href: '/relatorios/imr-contrato',
    icon: Scale,
    group: 'Material',
    allowedRoles: ['Admin'],
  },
  // ── Gestão de ativos (specs 0011–0015): operação primeiro, cadastro de apoio no fim
  {
    label: 'Ativos',
    href: '/ativos',
    icon: PackageSearch,
    group: 'Ativos',
  },
  {
    label: 'Vistoria',
    href: '/ativos/vistoria',
    icon: ClipboardCheck,
    group: 'Ativos',
    allowedRoles: ['Admin', 'Preposto', 'Técnico'],
  },
  {
    label: 'Documentos',
    href: '/ativos/documentos',
    icon: FileBadge,
    group: 'Ativos',
    allowedRoles: ['Admin', 'Preposto', 'Técnico'],
  },
  {
    label: 'Localizações',
    href: '/ativos/localizacoes',
    icon: MapPinned,
    group: 'Ativos',
    allowedRoles: ['Admin', 'Preposto'],
  },
  {
    label: 'Categorias de ativo',
    href: '/configuracoes/categorias-ativo',
    icon: Tags,
    group: 'Ativos',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Tipos de documento',
    href: '/configuracoes/tipos-documento',
    icon: FileCog,
    group: 'Ativos',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Relatórios IMR',
    href: '/relatorios/imr',
    icon: FileText,
    group: 'Relatórios',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Relatório por contrato',
    href: '/relatorios/contrato',
    icon: FileSpreadsheet,
    group: 'Relatórios',
    allowedRoles: ['Admin'],
  },
  {
    label: 'Relatório de Breaches',
    href: '/relatorios/breach',
    icon: TrendingDown,
    group: 'Relatórios',
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
    label: 'Contratos',
    href: '/configuracoes/contratos',
    icon: FileSignature,
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
