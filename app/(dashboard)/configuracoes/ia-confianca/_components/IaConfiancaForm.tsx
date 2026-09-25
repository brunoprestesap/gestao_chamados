'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { salvarIaAutonomiaConfigAction } from '@/app/(dashboard)/configuracoes/ia-confianca/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { IaAutonomiaConfigLida } from '@/lib/ia-confianca/config';
import { salvarIaAutonomiaConfigSchema } from '@/shared/ia-confianca/ia-confianca.schemas';

type FormValues = {
  servico: { limiteConfianca: string; amostraMinima: number };
  prioridade: { limiteConfianca: string; amostraMinima: number };
  autonomiaAtiva: boolean;
  atribuicaoAutomaticaAtiva: boolean;
};

type Campo = 'servico' | 'prioridade';

const CAMPO_LABELS: Record<Campo, string> = { servico: 'Serviço', prioridade: 'Prioridade' };

function paraFormValues(config: IaAutonomiaConfigLida): FormValues {
  return {
    servico: {
      limiteConfianca:
        config.servico.limiteConfianca === null ? '' : String(config.servico.limiteConfianca),
      amostraMinima: config.servico.amostraMinima,
    },
    prioridade: {
      limiteConfianca:
        config.prioridade.limiteConfianca === null ? '' : String(config.prioridade.limiteConfianca),
      amostraMinima: config.prioridade.amostraMinima,
    },
    autonomiaAtiva: config.autonomiaAtiva,
    atribuicaoAutomaticaAtiva: config.atribuicaoAutomaticaAtiva,
  };
}

export function IaConfiancaForm({
  config,
  sugestoes,
}: {
  config: IaAutonomiaConfigLida;
  sugestoes: Record<Campo, number | null>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(salvarIaAutonomiaConfigSchema) as any,
    defaultValues: paraFormValues(config),
  });

  const aplicarSugestao = useCallback(
    (campo: Campo) => {
      const sugestao = sugestoes[campo];
      if (sugestao === null) return;
      form.setValue(`${campo}.limiteConfianca`, sugestao.toFixed(2), { shouldDirty: true });
    },
    [form, sugestoes],
  );

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await salvarIaAutonomiaConfigAction(values as any);
        if (result.ok) {
          toast.success('Configuração salva.');
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [router],
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {(['servico', 'prioridade'] as const).map((campo) => (
            <Card key={campo} className="rounded-2xl border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{CAMPO_LABELS[campo]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name={`${campo}.limiteConfianca`}
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Limite de confiança (0 a 1, em branco = sem limite)</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            placeholder="sem limite definido"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        {sugestoes[campo] !== null && (
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0 rounded-xl"
                            onClick={() => aplicarSugestao(campo)}
                          >
                            Usar sugestão
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`${campo}.amostraMinima`}
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Amostra mínima</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} step={1} className="rounded-xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="pt-6">
            <FormField
              control={form.control}
              name="autonomiaAtiva"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5 rounded-md"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel className="cursor-pointer font-medium">
                      Autonomia da IA ativa
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Interruptor global. Ligado, o chamado aberto pelo chat com confiança igual ou
                      acima do limite de prioridade nasce validado, sem esperar o Preposto.
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardContent className="pt-6">
            <FormField
              control={form.control}
              name="atribuicaoAutomaticaAtiva"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5 rounded-md"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel className="cursor-pointer font-medium">
                      Atribuição automática de técnico
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Só vale com a autonomia da IA ligada. Ligada, o chamado validado pela IA já
                      vai para o técnico com a especialidade do serviço e a menor carga; sem técnico
                      elegível, ele fica com o Preposto. Não depende da versão do prompt.
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type="submit" disabled={submitting} className="rounded-xl">
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar configuração
        </Button>
      </form>
    </Form>
  );
}
