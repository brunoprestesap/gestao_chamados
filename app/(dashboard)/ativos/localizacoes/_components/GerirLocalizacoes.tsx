'use client';

import {
  Building2,
  DoorOpen,
  Layers,
  Loader2,
  MapPinned,
  Pencil,
  Plus,
  PowerOff,
  Settings2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import type { NoArvore } from '@/lib/ativos/localizacao';
import { cn } from '@/lib/utils';
import {
  LOCALIZACAO_TIPO_LABELS,
  LOCALIZACAO_TIPOS,
  type LocalizacaoTipo,
} from '@/shared/ativos/ativo.constants';

import {
  criarLocalizacaoAction,
  desativarLocalizacaoAction,
  editarLocalizacaoAction,
} from '../../actions';

type Unidade = { id: string; nome: string };

const ICONE: Record<LocalizacaoTipo, React.ComponentType<{ className?: string }>> = {
  predio: Building2,
  andar: Layers,
  sala: DoorOpen,
  area_tecnica: Settings2,
};

const SEM_UNIDADE = '__sem_unidade__';

type Edicao = { modo: 'criar'; pai: NoArvore | null } | { modo: 'editar'; no: NoArvore } | null;

/** Árvore de locais (spec 0011, AC-1 e AC-2): criar, renomear, mover e desativar. */
export function GerirLocalizacoes({ nos, unidades }: { nos: NoArvore[]; unidades: Unidade[] }) {
  const router = useRouter();
  const [edicao, setEdicao] = useState<Edicao>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<LocalizacaoTipo>('predio');
  const [paiId, setPaiId] = useState<string>('');
  const [unitId, setUnitId] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [desativando, setDesativando] = useState<string | null>(null);

  const nomeUnidade = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades]);
  const profundidade = (n: NoArvore) => n.caminho.split('/').length - 1;

  // Destinos possíveis ao mover: qualquer nó fora da subárvore do próprio nó.
  const destinos = useMemo(() => {
    if (edicao?.modo !== 'editar') return nos;
    const proprio = edicao.no.caminho;
    return nos.filter((n) => n.id !== edicao.no.id && !n.caminho.startsWith(`${proprio}/`));
  }, [edicao, nos]);

  function abrirCriar(pai: NoArvore | null) {
    setEdicao({ modo: 'criar', pai });
    setNome('');
    setTipo(pai ? (pai.tipo === 'predio' ? 'andar' : 'sala') : 'predio');
    setPaiId(pai?.id ?? '');
    setUnitId('');
    setErro(null);
  }

  function abrirEditar(no: NoArvore) {
    setEdicao({ modo: 'editar', no });
    setNome(no.nome);
    setTipo(no.tipo);
    setPaiId(no.parentId ?? '');
    setUnitId(no.unitId ?? '');
    setErro(null);
  }

  function salvar() {
    if (!edicao) return;
    setErro(null);
    iniciar(async () => {
      const r =
        edicao.modo === 'criar'
          ? await criarLocalizacaoAction({
              nome,
              tipo,
              parentId: edicao.pai?.id ?? '',
              unitId,
            })
          : await editarLocalizacaoAction({
              id: edicao.no.id,
              nome,
              ...(edicao.no.tipo !== 'predio' && paiId && { parentId: paiId }),
              unitId: unitId || null,
            });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(edicao.modo === 'criar' ? 'Local criado.' : 'Local atualizado.');
      setEdicao(null);
      router.refresh();
    });
  }

  async function desativar(no: NoArvore) {
    setDesativando(no.id);
    const r = await desativarLocalizacaoAction({ id: no.id });
    setDesativando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`${no.nome} desativado.`);
    router.refresh();
  }

  const tiposPermitidos: readonly LocalizacaoTipo[] =
    edicao?.modo === 'criar' && !edicao.pai
      ? ['predio']
      : LOCALIZACAO_TIPOS.filter((t) => t !== 'predio');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {nos.length === 0
            ? 'Nenhum local ainda.'
            : `${nos.length} local(is) ativo(s). Renomear ou mover um local atualiza o caminho de tudo abaixo dele.`}
        </p>
        <Button
          onClick={() => abrirCriar(null)}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo prédio
        </Button>
      </div>

      {nos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MapPinned className="h-6 w-6" aria-hidden />
          </span>
          <p className="font-medium">Comece pelo prédio</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Só prédio fica na raiz. Depois, adicione andares, salas e áreas técnicas abaixo dele.
          </p>
        </div>
      ) : (
        <ul
          aria-label="Árvore de locais"
          className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm"
        >
          {nos.map((n) => {
            const Icone = ICONE[n.tipo];
            const nivel = profundidade(n);
            return (
              <li
                key={n.id}
                className="group flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
                style={{ paddingLeft: `${1 + nivel * 1.5}rem` }}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                    n.tipo === 'predio'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icone className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {LOCALIZACAO_TIPO_LABELS[n.tipo]}
                    {n.unitId && nomeUnidade.get(n.unitId) && ` · ${nomeUnidade.get(n.unitId)}`}
                    {nivel > 0 && ` · ${n.caminho}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abrirCriar(n)}
                    aria-label={`Adicionar local abaixo de ${n.nome}`}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Abaixo</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abrirEditar(n)}
                    aria-label={`Editar ${n.nome}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void desativar(n)}
                    disabled={desativando === n.id}
                    aria-label={`Desativar ${n.nome}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {desativando === n.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <PowerOff className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!edicao} onOpenChange={(v) => !v && setEdicao(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {edicao?.modo === 'editar'
                ? `Editar ${edicao.no.nome}`
                : edicao?.pai
                  ? `Novo local em ${edicao.pai.nome}`
                  : 'Novo prédio'}
            </DialogTitle>
            <DialogDescription>
              {edicao?.modo === 'criar' && edicao.pai
                ? `Fica em ${edicao.pai.caminho}.`
                : 'O nome não pode ter "/" nem repetir outro local no mesmo nível.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="local-nome">Nome</Label>
              <Input
                id="local-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Sede, 3º andar, Sala 302"
                autoFocus
              />
            </div>
            {edicao?.modo === 'criar' && (
              <div className="space-y-2">
                <Label htmlFor="local-tipo">Tipo</Label>
                <Select value={tipo} onValueChange={(t) => t && setTipo(t as LocalizacaoTipo)}>
                  <SelectTrigger id="local-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposPermitidos.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LOCALIZACAO_TIPO_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {edicao?.modo === 'editar' && edicao.no.tipo !== 'predio' && (
              <div className="space-y-2">
                <Label htmlFor="local-pai">Fica dentro de</Label>
                <Select value={paiId || undefined} onValueChange={(p) => p && setPaiId(p)}>
                  <SelectTrigger id="local-pai" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.caminho}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="local-unidade">Unidade que ocupa (opcional)</Label>
              <Select
                value={unitId || SEM_UNIDADE}
                onValueChange={(u) => u && setUnitId(u === SEM_UNIDADE ? '' : u)}
              >
                <SelectTrigger id="local-unidade" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_UNIDADE}>Nenhuma</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || !nome.trim()}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
