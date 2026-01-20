export function canManageUsers(role?: string) {
  return role === 'Admin' || role === 'Preposto';
}
