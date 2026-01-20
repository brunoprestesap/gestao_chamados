export const USER_ROLES = ['Admin', 'Preposto', 'Solicitante', 'Técnico'] as const;
export type UserRole = (typeof USER_ROLES)[number];
