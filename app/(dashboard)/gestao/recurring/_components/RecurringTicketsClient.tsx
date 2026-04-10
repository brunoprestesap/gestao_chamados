'use client';

import {
  CalendarCheck,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import {
  deleteRecurringTemplateAction,
  toggleRecurringTemplateAction,
} from '@/app/(dashboard)/gestao/recurring/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DAY_OF_WEEK_LABELS,
  RECURRENCE_TYPE_LABELS,
  type RecurrenceType,
} from '@/shared/chamados/recurring-ticket.schemas';

import { RecurringTicketDialog } from './RecurringTicketDialog';

export type RecurringItem = {
  _id: string;
  name: string;
  titulo: string;
  descricao: string;
  tipoServico: string;
  naturezaAtendimento: string;
  grauUrgencia: string;
  recurrenceType: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  intervalDays?: number;
  nextRunAt: string;
  lastRunAt?: string;
  totalGenerated: number;
  isActive: boolean;
  unitId: string;
  solicitanteId: string;
  subtypeId?: string;
  catalogServiceId?: string;
};

function formatRecurrence(item: RecurringItem): string {
  const type = item.recurrenceType as RecurrenceType;
  const label = RECURRENCE_TYPE_LABELS[type] ?? type;

  switch (type) {
    case 'weekly':
      return `${label} — ${DAY_OF_WEEK_LABELS[item.dayOfWeek ?? 1] ?? ''}`;
    case 'monthly':
      return `${label} — Dia ${item.dayOfMonth ?? 1}`;
    case 'custom':
      return `A cada ${item.intervalDays ?? 30} dias`;
    default:
      return label;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Belem',
  });
}

interface Props {
  items: RecurringItem[];
}

export function RecurringTicketsClient({ items: initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleCreate = useCallback(() => {
    setEditingItem(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: RecurringItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  }, []);

  const handleToggle = useCallback(
    (id: string) => {
      setActionId(id);
      startTransition(async () => {
        try {
          const result = await toggleRecurringTemplateAction(id);
          if (result.ok) {
            setItems((prev) =>
              prev.map((it) => (it._id === id ? { ...it, isActive: !it.isActive } : it)),
            );
          }
        } finally {
          setActionId(null);
        }
      });
    },
    [],
  );

  const handleDelete = useCallback(
    (id: string, name: string) => {
      if (!confirm(`Deseja realmente excluir o agendamento "${name}"?`)) return;
      setActionId(id);
      startTransition(async () => {
        try {
          const result = await deleteRecurringTemplateAction(id);
          if (result.ok) {
            setItems((prev) => prev.filter((it) => it._id !== id));
          }
        } finally {
          setActionId(null);
        }
      });
    },
    [],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Chamados Recorrentes
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
            Gerencie agendamentos para criação automática de chamados de manutenção preventiva.
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 shadow-md shadow-indigo-500/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Agendamento
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
            <Repeat className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Nenhum agendamento cadastrado
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie agendamentos para gerar chamados automaticamente em intervalos regulares.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo Serviço</TableHead>
                  <TableHead className="hidden sm:table-cell">Recorrência</TableHead>
                  <TableHead>Próxima Execução</TableHead>
                  <TableHead className="hidden lg:table-cell">Último Gerado</TableHead>
                  <TableHead className="hidden sm:table-cell text-center">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const isProcessing = isPending && actionId === item._id;
                  return (
                    <TableRow key={item._id} className={!item.isActive ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate md:hidden">
                            {item.tipoServico}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {item.tipoServico}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {formatRecurrence(item)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(item.nextRunAt)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">
                        {formatDate(item.lastRunAt)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">
                        <Badge variant="secondary" className="tabular-nums">
                          {item.totalGenerated}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={item.isActive ? 'default' : 'outline'}
                          className={
                            item.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : ''
                          }
                        >
                          {item.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(item)}
                                disabled={isProcessing}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleToggle(item._id)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : item.isActive ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.isActive ? 'Desativar' : 'Ativar'}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(item._id, item.name)}
                                disabled={isProcessing}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <RecurringTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingItem={editingItem}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
