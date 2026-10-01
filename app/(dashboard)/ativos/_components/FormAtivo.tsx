'use client';

import { Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  type Criticidade,
  CRITICIDADE_LABELS,
  CRITICIDADES,
  ORIGEM_CODIGO_LABELS,
  type OrigemCodigo,
  type TierManutencao,
  TIERS_MANUTENCAO,
} from '@/shared/ativos/ativo.constants';

import { criarAtivoAction, editarAtivoAction } from '../actions';

export type OpcaoCategoria = { id: string; nome: string; criticidadePadrao: Criticidade };
export type OpcaoLocal = { id: string; caminho: string };

export type ValoresAtivo = {
  origemCodigo: OrigemCodigo;
  tombamento: string;
  descricao: string;
  categoriaId: string;
  localizacaoId: string;
  tierManutencao: TierManutencao | '';
  fabricante: string;
  modelo: string;
  numeroSerie: string;
  dataInstalacao: string;
  criticidade: Criticidade | '';
};

const SEM_LOCAL = '__sem_local__';

function Campo({
  id,
  rotulo,
  ajuda,
  children,
  className,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
    </div>
  );
}

/**
 * Cadastro e edição do ativo (spec 0011, AC-4 a AC-6). No cadastro, a origem
 * decide o código: patrimoniado usa o tombamento; interno ganha `MNT-####`
 * do sistema. Na edição, código, origem e tombamento não mudam.
 */
export function FormAtivo({
  modo,
  ativoId,
  codigo,
  inicial,
  categorias,
  locais,
}: {
  modo: 'novo' | 'editar';
  ativoId?: string;
  codigo?: string;
  inicial: ValoresAtivo;
  categorias: OpcaoCategoria[];
  locais: OpcaoLocal[];
}) {
  const router = useRouter();
  const [v, setV] = useState<ValoresAtivo>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const set = <K extends keyof ValoresAtivo>(campo: K, valor: ValoresAtivo[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  const categoria = categorias.find((c) => c.id === v.categoriaId);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const comum = {
        descricao: v.descricao,
        categoriaId: v.categoriaId,
        localizacaoId: v.localizacaoId,
        tierManutencao: v.tierManutencao as TierManutencao,
        fabricante: v.fabricante,
        modelo: v.modelo,
        numeroSerie: v.numeroSerie,
        dataInstalacao: v.dataInstalacao,
      };
      if (modo === 'novo') {
        const r = await criarAtivoAction({
          ...comum,
          origemCodigo: v.origemCodigo,
          tombamento: v.origemCodigo === 'patrimonio' ? v.tombamento : undefined,
          criticidade: v.criticidade,
        });
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        toast.success(`Ativo ${r.codigo} cadastrado.`);
        router.push(`/ativos/${r.id}`);
        return;
      }
      const r = await editarAtivoAction({
        ...comum,
        id: ativoId!,
        criticidade: v.criticidade as Criticidade,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success('Alterações salvas.');
      router.push(`/ativos/${ativoId}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={salvar}
      className="relative space-y-8 overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6"
      noValidate
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
      />

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Identificação</legend>
        {modo === 'novo' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-sm font-medium" id="origem-rotulo">
                Origem do código
              </span>
              <div
                role="radiogroup"
                aria-labelledby="origem-rotulo"
                className="grid grid-cols-2 gap-2"
              >
                {(['patrimonio', 'interno'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={v.origemCodigo === o}
                    onClick={() => set('origemCodigo', o)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                      v.origemCodigo === o
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                        : 'border-input hover:bg-muted/50',
                    )}
                  >
                    <span className="block font-medium">{ORIGEM_CODIGO_LABELS[o]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {o === 'patrimonio' ? 'Tem etiqueta do SICAM' : 'O Sigma gera MNT-####'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {v.origemCodigo === 'patrimonio' && (
              <Campo id="tombamento" rotulo="Tombamento *" ajuda="Só números, como na etiqueta.">
                <Input
                  id="tombamento"
                  inputMode="numeric"
                  value={v.tombamento}
                  onChange={(e) => set('tombamento', e.target.value)}
                  aria-describedby="tombamento-ajuda"
                  className="font-mono"
                  required
                />
              </Campo>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Código <span className="font-mono font-semibold text-foreground">{codigo}</span>. O
            código, a origem e o tombamento não mudam depois do cadastro.
          </p>
        )}
        <Campo id="descricao" rotulo="Descrição *">
          <Textarea
            id="descricao"
            rows={3}
            value={v.descricao}
            onChange={(e) => set('descricao', e.target.value)}
            required
          />
        </Campo>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Classificação e local</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="categoria" rotulo="Categoria *">
            <Select
              value={v.categoriaId || undefined}
              onValueChange={(c) => c && set('categoriaId', c)}
            >
              <SelectTrigger id="categoria" className="w-full">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            id="criticidade"
            rotulo={modo === 'novo' ? 'Criticidade' : 'Criticidade *'}
            ajuda={
              modo === 'novo' && categoria
                ? `Sem escolha, vale a da categoria: ${CRITICIDADE_LABELS[categoria.criticidadePadrao].toLowerCase()}.`
                : undefined
            }
          >
            <Select
              value={v.criticidade || undefined}
              onValueChange={(c) => c && set('criticidade', c as Criticidade)}
            >
              <SelectTrigger
                id="criticidade"
                className="w-full"
                aria-describedby="criticidade-ajuda"
              >
                <SelectValue placeholder="Da categoria" />
              </SelectTrigger>
              <SelectContent>
                {CRITICIDADES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CRITICIDADE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            id="tier"
            rotulo="Tier de manutenção *"
            ajuda="A e B podem receber chamado; C e D ficam só no cadastro."
          >
            <Select
              value={v.tierManutencao || undefined}
              onValueChange={(t) => t && set('tierManutencao', t as TierManutencao)}
            >
              <SelectTrigger id="tier" className="w-full" aria-describedby="tier-ajuda">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {TIERS_MANUTENCAO.map((t) => (
                  <SelectItem key={t} value={t}>
                    Tier {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            id="local"
            rotulo="Local"
            className="sm:col-span-2 lg:col-span-3"
            ajuda={
              locais.length === 0
                ? 'Ainda não há locais. Cadastre a árvore em Ativos, Localizações.'
                : 'Validar o cadastro exige um local.'
            }
          >
            <Select
              value={v.localizacaoId || SEM_LOCAL}
              onValueChange={(l) => l && set('localizacaoId', l === SEM_LOCAL ? '' : l)}
            >
              <SelectTrigger id="local" className="w-full" aria-describedby="local-ajuda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_LOCAL}>Sem local</SelectItem>
                {locais.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.caminho}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Dados técnicos</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="fabricante" rotulo="Fabricante">
            <Input
              id="fabricante"
              value={v.fabricante}
              onChange={(e) => set('fabricante', e.target.value)}
            />
          </Campo>
          <Campo id="modelo" rotulo="Modelo">
            <Input id="modelo" value={v.modelo} onChange={(e) => set('modelo', e.target.value)} />
          </Campo>
          <Campo id="serie" rotulo="Número de série">
            <Input
              id="serie"
              value={v.numeroSerie}
              onChange={(e) => set('numeroSerie', e.target.value)}
            />
          </Campo>
          <Campo id="instalacao" rotulo="Data de instalação">
            <Input
              id="instalacao"
              type="date"
              value={v.dataInstalacao}
              onChange={(e) => set('dataInstalacao', e.target.value)}
            />
          </Campo>
        </div>
      </fieldset>

      {erro && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {erro}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-5 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={modo === 'editar' && ativoId ? `/ativos/${ativoId}` : '/ativos'}>
            Cancelar
          </Link>
        </Button>
        <Button
          type="submit"
          disabled={salvando}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {modo === 'novo' ? 'Cadastrar ativo' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  );
}
