declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'user' | 'admin';
      name?: string | null;
      email?: string | null;
    };
  }
}
