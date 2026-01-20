import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      username: string;
      role: 'Admin' | 'Preposto' | 'Solicitante' | 'Técnico';
      unitId: string | null;
      isActive: boolean;
    };
  }

  interface User {
    id: string;
    username: string;
    role: 'Admin' | 'Preposto' | 'Solicitante' | 'Técnico';
    unitId: string | null;
    isActive: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    role: 'Admin' | 'Preposto' | 'Solicitante' | 'Técnico';
    unitId: string | null;
    isActive: boolean;
  }
}
