'use client';

import { PackagePlus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ORIGEM_CODIGO_LABELS, type OrigemCodigo } from '@/shared/ativos/ativo.constants';
import {
  CAMPOS_TECNICOS,
  type CampoTecnico,
  type TierCadastroCampo,
  TIERS_CADASTRO_CAMPO,
} from '@/shared/vistoria/vistoria.constants';
import type { LocalDoPacote } from '@/shared/vistoria/vistoria.schemas';

export type ValoresCadastro = {
  origemCodigo: OrigemCodigo;
  tombamento: string;
  descricao: string;
  categoriaId: string;
  tierManutencao: TierCadastroCampo;
} & Record<CampoTecnico, string>;

const ROTULOS_TECNICOS: Record<CampoTecnico, string> = {
  fabricante: 'Fabricante (opcional)',
  modelo: 'Modelo (opcional)',
  numeroSerie: 'Número de série (opcional)',
};

const SELECT =
  'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Cadastro em campo (spec 0012, AC-11): o equipamento que o pacote não tem.
 * Usa o local escolhido. Quem chama valida pelo schema da operação e devolve
 * o erro para mostrar; sem erro, a operação já está na fila.
 */
export function FormCadastro({
  codigoLido,
  local,
  categorias,
  onCancelar,
  onConfirmar,
}: {
  /** Código lido ou digitado que não estava no pacote; `null` no cadastro sem tombo. */
  codigoLido: string | null;
  local: LocalDoPacote;
  categorias: { id: string; nome: string }[];
  onCancelar: () => void;
  onConfirmar: (valores: ValoresCadastro) => Promise<string | null>;
}) {
  const tomboLido = codigoLido && /^\d+$/.test(codigoLido) ? codigoLido : '';
  const [valores, setValores] = useState<ValoresCadastro>({
    origemCodigo: tomboLido ? 'patrimonio' : 'interno',
    tombamento: tomboLido,
    descricao: '',
    categoriaId: '',
    tierManutencao: 'A',
    fabricante: '',
    modelo: '',
    numeroSerie: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = <K extends keyof ValoresCadastro>(campo: K, valor: ValoresCadastro[K]) =>
    setValores((v) => ({ ...v, [campo]: valor }));

  return (
    <section
      aria-labelledby="titulo-cadastro"
      className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-card p-5 shadow-lg shadow-emerald-500/5 sm:p-6"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-400"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-cadastro" className="text-lg font-semibold leading-snug">
            Cadastrar aqui
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Local: {local.caminho}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar sem cadastrar"
          onClick={onCancelar}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <form
        className="mt-5 space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            setErro(await onConfirmar(valores));
          } finally {
            setEnviando(false);
          }
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Origem do código</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['patrimonio', 'interno'] as const).map((origem) => (
              <label
                key={origem}
                className={cn(
                  'flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  valores.origemCodigo === origem
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="origemCodigo"
                  value={origem}
                  checked={valores.origemCodigo === origem}
                  onChange={() => mudar('origemCodigo', origem)}
                  className="sr-only"
                />
                {ORIGEM_CODIGO_LABELS[origem]}
              </label>
            ))}
          </div>
          {valores.origemCodigo === 'interno' && (
            <p className="text-xs text-muted-foreground">
              Sem tombo: o Sigma gera o código MNT ao sincronizar. Até lá, a tela mostra um código
              provisório.
            </p>
          )}
        </fieldset>

        {valores.origemCodigo === 'patrimonio' && (
          <div className="space-y-1.5">
            <Label htmlFor="cadastro-tombamento">Tombamento</Label>
            <Input
              id="cadastro-tombamento"
              value={valores.tombamento}
              onChange={(e) => mudar('tombamento', e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="h-11 rounded-xl font-mono text-base"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="cadastro-descricao">Descrição</Label>
          <Input
            id="cadastro-descricao"
            value={valores.descricao}
            onChange={(e) => mudar('descricao', e.target.value)}
            placeholder="Ex.: Elevador social 1"
            autoComplete="off"
            className="h-11 rounded-xl"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cadastro-categoria">Categoria</Label>
            <select
              id="cadastro-categoria"
              value={valores.categoriaId}
              onChange={(e) => mudar('categoriaId', e.target.value)}
              className={SELECT}
            >
              <option value="">Escolha a categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Tier de manutenção</legend>
            <div className="grid grid-cols-2 gap-2">
              {TIERS_CADASTRO_CAMPO.map((tier) => (
                <label
                  key={tier}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    valores.tierManutencao === tier
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted/50',
                  )}
                >
                  <input
                    type="radio"
                    name="tierManutencao"
                    value={tier}
                    checked={valores.tierManutencao === tier}
                    onChange={() => mudar('tierManutencao', tier)}
                    className="sr-only"
                  />
                  Tier {tier}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {CAMPOS_TECNICOS.map((campo) => (
          <div key={campo} className="space-y-1.5">
            <Label htmlFor={`cadastro-${campo}`}>{ROTULOS_TECNICOS[campo]}</Label>
            <Input
              id={`cadastro-${campo}`}
              value={valores[campo]}
              onChange={(e) => mudar(campo, e.target.value)}
              maxLength={120}
              autoComplete="off"
              className="h-11 rounded-xl"
            />
          </div>
        ))}

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={enviando}
            className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
          >
            <PackagePlus className="h-4 w-4" aria-hidden />
            Cadastrar e conferir
          </Button>
        </div>
      </form>
    </section>
  );
}
