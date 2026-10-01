'use client';

import { Loader2, Pencil, Plus, PowerOff, Tags } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type Criticidade,
  CRITICIDADE_LABELS,
  CRITICIDADES,
} from '@/shared/ativos/ativo.constants';

import {
  criarCategoriaAtivoAction,
  desativarCategoriaAtivoAction,
  editarCategoriaAtivoAction,
} from '../actions';

export type CategoriaLinha = {
  id: string;
  chave: string;
  nome: string;
  criticidadePadrao: Criticidade;
  periodicidadePreventivaDias: number | null;
  exigeDocumento: string[];
  vidaUtilAnos: number | null;
  serviceSubTypeId: string | null;
  isActive: boolean;
  totalAtivos: number;
};

export type OpcaoSubtipo = { id: string; rotulo: string };

const SEM_SUBTIPO = '__sem_subtipo__';

type Rascunho = {
  chave: string;
  nome: string;
  criticidadePadrao: Criticidade;
  periodicidade: string;
  documentos: string;
  vidaUtil: string;
  subtipo: string;
};

const VAZIO: Rascunho = {
  chave: '',
  nome: '',
  criticidadePadrao: 'media',
  periodicidade: '',
  documentos: '',
  vidaUtil: '',
  subtipo: '',
};

/** Categorias de ativo (spec 0011, AC-3). Só Admin chega a esta tela. */
export function GerirCategorias({
  categorias,
  subtipos,
}: {
  categorias: CategoriaLinha[];
  subtipos: OpcaoSubtipo[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<CategoriaLinha | 'nova' | null>(null);
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [desativando, setDesativando] = useState<string | null>(null);

  const rotuloSubtipo = new Map(subtipos.map((s) => [s.id, s.rotulo]));

  function abrir(c: CategoriaLinha | 'nova') {
    setEditando(c);
    setErro(null);
    setR(
      c === 'nova'
        ? VAZIO
        : {
            chave: c.chave,
            nome: c.nome,
            criticidadePadrao: c.criticidadePadrao,
            periodicidade: c.periodicidadePreventivaDias
              ? String(c.periodicidadePreventivaDias)
              : '',
            documentos: c.exigeDocumento.join(', '),
            vidaUtil: c.vidaUtilAnos ? String(c.vidaUtilAnos) : '',
            subtipo: c.serviceSubTypeId ?? '',
          },
    );
  }

  function salvar() {
    if (!editando) return;
    setErro(null);
    const dados = {
      chave: r.chave,
      nome: r.nome,
      criticidadePadrao: r.criticidadePadrao,
      periodicidadePreventivaDias: r.periodicidade,
      exigeDocumento: r.documentos.split(','),
      vidaUtilAnos: r.vidaUtil,
      serviceSubTypeId: r.subtipo,
    };
    iniciar(async () => {
      const res =
        editando === 'nova'
          ? await criarCategoriaAtivoAction(dados)
          : await editarCategoriaAtivoAction({ ...dados, id: editando.id });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success(editando === 'nova' ? 'Categoria criada.' : 'Categoria atualizada.');
      setEditando(null);
      router.refresh();
    });
  }

  async function desativar(c: CategoriaLinha) {
    setDesativando(c.id);
    const res = await desativarCategoriaAtivoAction({ id: c.id });
    setDesativando(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${c.nome} desativada. Os ativos dela continuam cadastrados.`);
    router.refresh();
  }

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((a) => ({ ...a, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A criticidade padrão vale para os ativos novos; cada ativo pode ter a sua.
        </p>
        <Button
          onClick={() => abrir('nova')}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nova categoria
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        {categorias.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Tags className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">Nenhuma categoria</p>
            <p className="max-w-md text-sm text-muted-foreground">
              A carga do Tier A cria as 9 categorias iniciais. Você também pode criar à mão.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Criticidade padrão</TableHead>
                  <TableHead>Preventiva</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead>Subtipo de serviço</TableHead>
                  <TableHead className="text-right">Ativos</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((c) => (
                  <TableRow key={c.id} className={c.isActive ? undefined : 'opacity-60'}>
                    <TableCell>
                      <p className="font-medium">{c.nome}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.chave}</p>
                    </TableCell>
                    <TableCell>{CRITICIDADE_LABELS[c.criticidadePadrao]}</TableCell>
                    <TableCell>
                      {c.periodicidadePreventivaDias
                        ? `a cada ${c.periodicidadePreventivaDias} dias`
                        : '—'}
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      {c.exigeDocumento.length ? c.exigeDocumento.join(', ') : '—'}
                    </TableCell>
                    <TableCell>
                      {c.serviceSubTypeId ? (rotuloSubtipo.get(c.serviceSubTypeId) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.totalAtivos}</TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrir(c)}
                            aria-label={`Editar ${c.nome}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void desativar(c)}
                            disabled={desativando === c.id}
                            aria-label={`Desativar ${c.nome}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {desativando === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <PowerOff className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="rounded-full">
                          Desativada
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando === 'nova' ? 'Nova categoria' : `Editar ${editando?.nome ?? ''}`}
            </DialogTitle>
            <DialogDescription>
              O subtipo de serviço faz o formulário do chamado sugerir tipo e subtipo para os ativos
              desta categoria.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-chave">Chave</Label>
              <Input
                id="cat-chave"
                value={r.chave}
                onChange={(e) => set('chave', e.target.value)}
                placeholder="climatizacao"
                className="font-mono"
                readOnly={editando !== 'nova'}
                aria-describedby={editando !== 'nova' ? 'cat-chave-ajuda' : undefined}
              />
              {editando !== 'nova' && (
                <p id="cat-chave-ajuda" className="text-xs text-muted-foreground">
                  A chave não muda depois de criada.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-nome">Nome</Label>
              <Input id="cat-nome" value={r.nome} onChange={(e) => set('nome', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-crit">Criticidade padrão</Label>
              <Select
                value={r.criticidadePadrao}
                onValueChange={(v) => v && set('criticidadePadrao', v as Criticidade)}
              >
                <SelectTrigger id="cat-crit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITICIDADES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CRITICIDADE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-sub">Subtipo de serviço (opcional)</Label>
              <Select
                value={r.subtipo || SEM_SUBTIPO}
                onValueChange={(v) => v && set('subtipo', v === SEM_SUBTIPO ? '' : v)}
              >
                <SelectTrigger id="cat-sub" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_SUBTIPO}>Nenhum</SelectItem>
                  {subtipos.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-per">Preventiva a cada (dias)</Label>
              <Input
                id="cat-per"
                type="number"
                min={1}
                value={r.periodicidade}
                onChange={(e) => set('periodicidade', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-vida">Vida útil (anos)</Label>
              <Input
                id="cat-vida"
                type="number"
                min={1}
                value={r.vidaUtil}
                onChange={(e) => set('vidaUtil', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cat-docs">Documentos exigidos</Label>
              <Input
                id="cat-docs"
                value={r.documentos}
                onChange={(e) => set('documentos', e.target.value)}
                placeholder="PMOC, ART"
                aria-describedby="cat-docs-ajuda"
              />
              <p id="cat-docs-ajuda" className="text-xs text-muted-foreground">
                Separe por vírgula.
              </p>
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
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
