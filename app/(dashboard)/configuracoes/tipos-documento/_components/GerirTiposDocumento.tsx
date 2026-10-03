'use client';

import { FileText, Loader2, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TipoDocumentoLinha } from '@/lib/ativos/documentos/tipos';

import {
  alternarTipoDocumentoAction,
  criarTipoDocumentoAction,
  editarTipoDocumentoAction,
} from '../actions';

/** Tipos de documento (spec 0013, AC-1). Só Admin chega a esta tela. */
export function GerirTiposDocumento({ tipos }: { tipos: TipoDocumentoLinha[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<TipoDocumentoLinha | 'novo' | null>(null);
  const [chave, setChave] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [alternando, setAlternando] = useState<string | null>(null);

  function abrir(t: TipoDocumentoLinha | 'novo') {
    setEditando(t);
    setErro(null);
    setChave(t === 'novo' ? '' : t.chave);
    setNome(t === 'novo' ? '' : t.nome);
  }

  function salvar() {
    if (!editando) return;
    setErro(null);
    iniciar(async () => {
      const r =
        editando === 'novo'
          ? await criarTipoDocumentoAction({ chave, nome })
          : await editarTipoDocumentoAction({ id: editando.id, nome });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(editando === 'novo' ? 'Tipo criado.' : 'Tipo renomeado.');
      setEditando(null);
      router.refresh();
    });
  }

  async function alternar(t: TipoDocumentoLinha) {
    setAlternando(t.id);
    const r = await alternarTipoDocumentoAction({ id: t.id });
    setAlternando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.isActive
        ? `${t.nome} ativado.`
        : `${t.nome} desativado. Os documentos já cadastrados continuam valendo.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tipo desativado some das escolhas, mas os documentos dele continuam visíveis e avisando.
        </p>
        <Button
          onClick={() => abrir('novo')}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo tipo
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        {tipos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">Nenhum tipo de documento</p>
            <p className="max-w-md text-sm text-muted-foreground">
              A carga cria PMOC, AVCB, ART, laudo de SPDA e garantia. Você também pode criar à mão.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Vigentes</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipos.map((t) => (
                  <TableRow key={t.id} className={t.isActive ? undefined : 'opacity-70'}>
                    <TableCell>
                      <p className="font-medium">{t.nome}</p>
                      <p className="font-mono text-xs text-muted-foreground">{t.chave}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        {t.isActive ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.totalVigentes}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrir(t)}
                          aria-label={`Renomear ${t.nome}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void alternar(t)}
                          disabled={alternando === t.id}
                          aria-label={t.isActive ? `Desativar ${t.nome}` : `Ativar ${t.nome}`}
                          className="text-muted-foreground"
                        >
                          {alternando === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : t.isActive ? (
                            <PowerOff className="h-4 w-4" aria-hidden />
                          ) : (
                            <Power className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editando === 'novo' ? 'Novo tipo de documento' : `Renomear ${editando?.nome ?? ''}`}
            </DialogTitle>
            <DialogDescription>
              A chave identifica o tipo nas categorias e nos documentos, e não muda depois de
              criada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tipo-chave">Chave</Label>
              <Input
                id="tipo-chave"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder="laudo_eletrico"
                className="font-mono"
                readOnly={editando !== 'novo'}
                aria-describedby="tipo-chave-ajuda"
              />
              <p id="tipo-chave-ajuda" className="text-xs text-muted-foreground">
                {editando === 'novo'
                  ? 'De 2 a 40 letras minúsculas, números ou "_".'
                  : 'A chave não muda depois de criada.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo-nome">Nome</Label>
              <Input
                id="tipo-nome"
                value={nome}
                maxLength={80}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
