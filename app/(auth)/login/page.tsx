'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Wrench } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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

import { loginAction } from './actions';

const LoginFormSchema = z.object({
  username: z
    .string()
    .min(1, 'Informe sua matrícula')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Informe sua senha'),
});

type LoginForm = z.infer<typeof LoginFormSchema>;

function LoginPageContent() {
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
      const formData = new FormData();
      formData.append('username', values.username);
      formData.append('password', values.password);

      const result = await loginAction(formData);

      setSubmitting(false);

      if (!result.ok) {
        setAuthError(result.error || 'Matrícula ou senha incorretos. Verifique e tente novamente.');
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch (error) {
      setSubmitting(false);
      setAuthError('Não foi possível acessar. Tente novamente em instantes.');
      console.error('Erro no login:', error);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-slate-100 via-blue-50/80 to-indigo-100/90 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/90 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl flex flex-col lg:flex-row lg:items-stretch lg:gap-0 rounded-2xl border bg-card text-card-foreground shadow-lg overflow-hidden">
        {/* Branding - esquerda em desktop, topo em mobile */}
        <div className="flex flex-col justify-center gap-6 px-6 py-8 lg:px-10 lg:py-12 lg:w-1/2 bg-linear-to-br from-primary/5 via-muted/20 to-transparent dark:from-primary/10 dark:via-muted/10">
          <div className="flex items-center gap-4">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
              aria-hidden
            >
              <Wrench className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Severino</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Gestão de Chamados de Manutenção
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Faça login com sua matrícula e senha para acessar o painel de chamados e acompanhar suas
            solicitações.
          </p>
        </div>

        {/* Form - direita em desktop */}
        <div className="flex flex-col justify-center px-6 py-8 lg:px-10 lg:py-12 lg:w-1/2">
          <Card className="border-0 shadow-none bg-transparent p-0">
            <div className="space-y-1 mb-6">
              <h2 className="text-lg font-semibold">Entrar</h2>
              <p className="text-sm text-muted-foreground">
                Digite sua matrícula e senha para continuar.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive dark:bg-destructive/15 dark:text-destructive"
              >
                {authError}
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: ap20256"
                          autoComplete="username"
                          autoFocus
                          disabled={submitting}
                          {...field}
                        />
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
                          disabled={submitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4 pt-1">
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                  >
                    {submitting ? 'Entrando...' : 'Entrar'}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Problemas para acessar? Contate o suporte.
                  </p>
                </div>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-slate-100 via-blue-50/80 to-indigo-100/90 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/90 p-4">
          <div className="text-sm text-muted-foreground">Carregando...</div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
