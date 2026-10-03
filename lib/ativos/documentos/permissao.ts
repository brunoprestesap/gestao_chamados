import type { UserRole } from '@/shared/auth/auth.constants';

/** Quem lê documentos e baixa o arquivo (spec 0013, AC-10): todos menos o Solicitante. */
export function podeVerDocumentos(role: UserRole | string | null | undefined): boolean {
  return role === 'Admin' || role === 'Preposto' || role === 'Técnico';
}
