'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { createTemplateAction } from '@/app/(dashboard)/meus-chamados/template-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NewTicketFormInput } from '@/shared/chamados/new-ticket.schemas';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formValues: NewTicketFormInput;
  canCreateGlobal: boolean;
  onSaved: () => void;
};

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  formValues,
  canCreateGlobal,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'global' | 'personal'>('personal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    if (name.trim().length < 3) {
      setError('Nome deve ter pelo menos 3 caracteres');
      return;
    }

    setSaving(true);
    const result = await createTemplateAction({
      name: name.trim(),
      scope,
      descricao: formValues.descricao || undefined,
      tipoServico: formValues.tipoServico || undefined,
      naturezaAtendimento: formValues.naturezaAtendimento || undefined,
      grauUrgencia: formValues.grauUrgencia || undefined,
      unitId: formValues.unitId || undefined,
      subtypeId: formValues.subtypeId || undefined,
      catalogServiceId: formValues.catalogServiceId || undefined,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success('Template salvo com sucesso');
    setName('');
    setScope('personal');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Save className="h-4 w-4" />
            Salvar como Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Nome do Template *</Label>
            <Input
              id="template-name"
              placeholder="Ex: Ar-condicionado com defeito"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Visibilidade</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as 'global' | 'personal')}
              disabled={!canCreateGlobal}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Pessoal (apenas eu)</SelectItem>
                {canCreateGlobal && (
                  <SelectItem value="global">Global (todos os usuários)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
