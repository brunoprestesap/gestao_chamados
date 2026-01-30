'use client';

import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NEW_SUBTYPE_VALUE = '__new__';

export type SubtypeItem = { _id: string; name: string; typeId: string; isActive: boolean };

type SubtypeSelectWithCreateProps = {
  typeId: string;
  value: string;
  onChange: (value: string) => void;
  subtypes: SubtypeItem[];
  onSubtypesRefetch: () => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  required?: boolean;
};

export function SubtypeSelectWithCreate({
  typeId,
  value,
  onChange,
  subtypes,
  onSubtypesRefetch,
  disabled = false,
  placeholder = 'Selecione o subtipo',
  label = 'Subtipo',
  required = false,
}: SubtypeSelectWithCreateProps) {
  const [canCreateSubtype, setCanCreateSubtype] = useState(false);
  const [openNewSubtype, setOpenNewSubtype] = useState(false);
  const [newSubtypeName, setNewSubtypeName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/session', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!cancelled && data?.role === 'Admin') setCanCreateSubtype(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectValue = value === NEW_SUBTYPE_VALUE ? '' : value;

  function handleSelectChange(v: string) {
    if (v === NEW_SUBTYPE_VALUE) {
      setNewSubtypeName('');
      setOpenNewSubtype(true);
      return;
    }
    onChange(v);
  }

  async function handleCreateSubtype() {
    const name = newSubtypeName.trim();
    if (!name || !typeId) return;

    setSubmitting(true);
    const res = await fetch('/api/catalog/subtypes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typeId, name }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? 'Erro ao cadastrar subtipo');
      return;
    }

    const data = await res.json();
    const newItem = data?.item;
    if (newItem?._id) {
      await onSubtypesRefetch();
      onChange(newItem._id);
    }
    setOpenNewSubtype(false);
    setNewSubtypeName('');
  }

  return (
    <>
      <div className="space-y-2">
        {label ? (
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label} {required ? <span className="text-red-500">*</span> : null}
          </label>
        ) : null}
        <Select
          value={selectValue}
          onValueChange={handleSelectChange}
          disabled={disabled || !typeId}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {subtypes.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
            {canCreateSubtype && typeId ? (
              <SelectItem value={NEW_SUBTYPE_VALUE}>
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  Cadastrar novo subtipo...
                </span>
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={openNewSubtype} onOpenChange={setOpenNewSubtype}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo subtipo de serviço</DialogTitle>
            <DialogDescription>
              Informe o nome do novo subtipo. Ele será vinculado ao tipo de serviço já selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nome do subtipo</label>
              <Input
                placeholder="Ex: Troca de lâmpadas"
                value={newSubtypeName}
                onChange={(e) => setNewSubtypeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubtype()}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenNewSubtype(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateSubtype}
              disabled={submitting || !newSubtypeName.trim()}
            >
              {submitting ? 'Cadastrando...' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
