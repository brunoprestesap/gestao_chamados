'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { loginAction } from './actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const LoginFormSchema = z.object({
  username: z
    .string()
    .min(1, 'Informe a matrícula')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Informe a senha'),
});

type LoginForm = z.infer<typeof LoginFormSchema>;

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get('callbackUrl') || '/dashboard';

  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    setAuthError(null);

    try {
      // Cria FormData a partir dos valores do formulário
      const formData = new FormData();
      formData.append('username', values.username);
      formData.append('password', values.password);

      const result = await loginAction(formData);

      setSubmitting(false);

      if (!result.ok) {
        setAuthError(result.error || 'Matrícula ou senha inválidos.');
        return;
      }

      // ✅ Login bem-sucedido, redireciona
      router.replace(callbackUrl);
      router.refresh(); // Força atualização para pegar a sessão
    } catch (error) {
      setSubmitting(false);
      setAuthError('Falha inesperada no login. Tente novamente.');
      console.error('Erro no login:', error);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="space-y-1 mb-6">
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="text-sm text-muted-foreground">
            Use sua matrícula e senha para acessar o sistema.
          </p>
        </div>

        {authError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            {authError}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matrícula</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: ap20256" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Sua senha"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
