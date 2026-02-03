import type { UserRole } from '@/shared/auth/auth.constants';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      name?: string | null;
      email?: string | null;
      role: UserRole;
      unitId?: string | null;
      isActive: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    username?: string;
    role?: UserRole;
    unitId?: string | null;
    isActive?: boolean;
  }
}
