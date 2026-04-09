'use client';

import { Globe, Loader2, Trash2, User, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  deleteTemplateAction,
  listTemplatesAction,
} from '@/app/(dashboard)/meus-chamados/template-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { TemplateListItem } from '@/shared/chamados/ticket-template.schemas';

type Props = {
  onSelect: (template: TemplateListItem) => void;
  refreshKey?: number;
};

export function TemplateSelector({ onSelect, refreshKey }: Props) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTemplatesAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setTemplates(result.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!loaded)
    return (
      <div className="flex h-10 items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" aria-hidden="true" />
        <span className="text-xs text-muted-foreground/60">Carregando templates…</span>
      </div>
    );
  if (templates.length === 0) return null;

  const globalTemplates = templates.filter((t) => t.scope === 'global');
  const personalTemplates = templates.filter((t) => t.scope === 'personal');

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-indigo-200/60 bg-indigo-50/50 px-3 py-2 dark:border-indigo-800/40 dark:bg-indigo-950/20"
      role="group"
      aria-label="Selecionar template de chamado"
    >
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <span className="hidden shrink-0 text-xs font-medium text-indigo-700 dark:text-indigo-300 sm:inline">
        Atalho:
      </span>
      <Select
        value=""
        onValueChange={(id) => {
          const tpl = templates.find((t) => t.id === id);
          if (tpl) onSelect(tpl);
        }}
      >
        <SelectTrigger
          className="h-7 flex-1 min-w-0 border-0 bg-transparent text-xs text-indigo-700 shadow-none focus:ring-0 focus-visible:ring-0 dark:text-indigo-300 [&>svg]:text-indigo-400"
          aria-label="Escolher template para preencher formulário"
        >
          <SelectValue placeholder="Escolher template…" />
        </SelectTrigger>
        <SelectContent>
          {globalTemplates.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                <Globe className="h-3 w-3" aria-hidden="true" />
                Templates Globais
              </div>
              {globalTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </>
          )}
          {globalTemplates.length > 0 && personalTemplates.length > 0 && (
            <Separator className="my-1" />
          )}
          {personalTemplates.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                <User className="h-3 w-3" aria-hidden="true" />
                Meus Templates
              </div>
              {personalTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

type ManageProps = {
  sessionRole: string;
  sessionUserId: string;
  onDeleted: () => void;
};

export function TemplateManager({ sessionRole, sessionUserId, onDeleted }: ManageProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplatesAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setTemplates(result.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    const result = await deleteTemplateAction(id);
    if (result.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      onDeleted();
    } else {
      toast.error(result.error ?? 'Erro ao excluir template');
    }
    setDeleting(null);
  }

  const canManageGlobal = sessionRole === 'Admin' || sessionRole === 'Preposto';

  const globalTemplates = templates.filter((t) => t.scope === 'global');
  const personalTemplates = templates.filter(
    (t) => t.scope === 'personal' && t.createdByUserId === sessionUserId,
  );

  if (!loaded) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>;
  }

  if (globalTemplates.length === 0 && personalTemplates.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">Nenhum template encontrado.</p>
    );
  }

  return (
    <ScrollArea className="max-h-64">
      <div className="space-y-3 p-1">
        {personalTemplates.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Meus Templates</p>
            <div className="space-y-1.5">
              {personalTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  canDelete
                  deleting={deleting === t.id}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </div>
          </div>
        )}
        {globalTemplates.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Templates Globais</p>
            <div className="space-y-1.5">
              {globalTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  canDelete={canManageGlobal}
                  deleting={deleting === t.id}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function TemplateRow({
  template,
  canDelete,
  deleting,
  onDelete,
}: {
  template: TemplateListItem;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2',
        'transition hover:bg-muted/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{template.name}</span>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {template.scope === 'global' ? 'Global' : 'Pessoal'}
          </Badge>
        </div>
        {template.tipoServico && (
          <p className="truncate text-xs text-muted-foreground">{template.tipoServico}</p>
        )}
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Excluir template ${template.name}`}
          className="ml-2 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
