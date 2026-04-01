'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  Headset,
  Lock,
  Settings,
  User,
  Wrench,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SeverinoLogo } from '@/components/severino-logo';
import { Button } from '@/components/ui/button';
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
    .min(1, 'Informe sua matrícula')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Informe sua senha'),
});

type LoginForm = z.infer<typeof LoginFormSchema>;

/* ------------------------------------------------------------------ */
/*  Floating icon animation for the background                        */
/* ------------------------------------------------------------------ */
function FloatingIcon({
  icon: Icon,
  className,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: 'easeOut' }}
      className={className}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4 + delay, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon className="h-full w-full" />
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Background panel — contextualized with the app's domain           */
/* ------------------------------------------------------------------ */
function BrandingPanel() {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 px-8 py-12 text-white lg:px-14 xl:px-20">
      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/15 blur-[150px]" />

      {/* Floating contextual icons */}
      <FloatingIcon
        icon={ClipboardList}
        delay={0}
        className="absolute top-[12%] left-[10%] h-10 w-10 text-white/10 lg:h-12 lg:w-12"
      />
      <FloatingIcon
        icon={Wrench}
        delay={0.4}
        className="absolute top-[18%] right-[12%] h-8 w-8 text-white/8 lg:h-10 lg:w-10"
      />
      <FloatingIcon
        icon={Clock}
        delay={0.8}
        className="absolute bottom-[25%] left-[8%] h-9 w-9 text-white/8 lg:h-11 lg:w-11"
      />
      <FloatingIcon
        icon={Settings}
        delay={1.2}
        className="absolute bottom-[15%] right-[10%] h-10 w-10 text-white/10 lg:h-12 lg:w-12"
      />
      <FloatingIcon
        icon={Headset}
        delay={0.6}
        className="absolute top-[50%] left-[18%] h-7 w-7 text-white/8 lg:h-9 lg:w-9"
      />
      <FloatingIcon
        icon={CheckCircle2}
        delay={1.0}
        className="absolute top-[40%] right-[18%] h-8 w-8 text-white/8 lg:h-10 lg:w-10"
      />

      {/* Main content */}
      <div className="relative z-10 flex max-w-md flex-col items-center text-center lg:items-start lg:text-left">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-center gap-4"
        >
          <SeverinoLogo size={52} />
          <div>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Severino</h1>
            <p className="mt-1 text-sm font-medium text-indigo-200">
              Gestão de Chamados de Manutenção
            </p>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mb-10 text-base leading-relaxed text-indigo-100/80"
        >
          Controle completo de chamados, SLA e catálogo de serviços. Acompanhe solicitações em tempo
          real e garanta a eficiência da sua equipe.
        </motion.p>

        {/* Feature highlights */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="space-y-4"
        >
          {[
            { icon: ClipboardList, text: 'Abertura e acompanhamento de chamados' },
            { icon: Clock, text: 'Controle de SLA com alertas automáticos' },
            { icon: CheckCircle2, text: 'Catálogo de serviços organizado' },
          ].map(({ icon: FeatureIcon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10">
                <FeatureIcon className="h-4 w-4 text-indigo-200" />
              </div>
              <span className="text-sm text-indigo-100/90">{text}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login form                                                         */
/* ------------------------------------------------------------------ */
function LoginPageContent() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get('callbackUrl') || '/dashboard';

  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    setAuthError(null);

    try {
      const result = await signIn('credentials', {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      setSubmitting(false);

      if (result?.error || !result?.ok) {
        setAuthError('Matrícula ou senha incorretos. Verifique e tente novamente.');
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
    <div className="grid min-h-screen w-full lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      {/* Left panel — branding & context (hidden on small screens) */}
      <div className="hidden lg:flex">
        <BrandingPanel />
      </div>

      {/* Right panel — login form */}
      <div className="relative flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-5 py-10 dark:from-slate-950 dark:to-slate-900 sm:px-8 lg:px-12 xl:px-20">
        {/* Mobile branding header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center gap-3 lg:hidden"
        >
          <SeverinoLogo size={48} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Severino</h1>
            <p className="text-xs text-muted-foreground">Gestão de Chamados</p>
          </div>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Bem-vindo de volta</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Acesse com sua matrícula e senha para continuar.
            </p>
          </div>

          {authError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              aria-live="polite"
              className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive dark:bg-destructive/10"
            >
              {authError}
            </motion.div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Matrícula</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                          placeholder="Ex: ap20256"
                          autoComplete="username"
                          autoFocus
                          disabled={submitting}
                          className="h-11 rounded-xl border-border/60 pl-10 transition-colors focus:border-primary/40"
                          {...field}
                        />
                      </div>
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
                    <FormLabel className="text-sm font-medium">Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Sua senha"
                          autoComplete="current-password"
                          disabled={submitting}
                          className="h-11 rounded-xl border-border/60 pr-10 pl-10 transition-colors focus:border-primary/40"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-2">
                <Button
                  className="h-11 w-full cursor-pointer rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-700 hover:to-blue-700 hover:shadow-xl hover:shadow-indigo-500/25 active:scale-[0.98]"
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Entrando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground/70">
                  Problemas para acessar? Contate o suporte.
                </p>
              </div>
            </form>
          </Form>
        </motion.div>

        {/* Footer */}
        <p className="absolute bottom-5 text-xs text-muted-foreground/50">
          Severino &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span className="text-sm text-muted-foreground">Carregando...</span>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
