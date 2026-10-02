'use client';

import { FolderPlus, Loader2, WifiOff } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LOCALIZACAO_TIPO_LABELS, type LocalizacaoTipo } from '@/shared/ativos/ativo.constants';
import type { LocalDoPacote } from '@/shared/vistoria/vistoria.schemas';

import { criarLocalizacaoAction } from '../../../actions';

/** Abaixo de um prédio ou andar a gestão cria andar, sala ou área técnica. */
const TIPOS_EM_CAMPO: LocalizacaoTipo[] = ['andar', 'sala', 'area_tecnica'];

/**
 * Criar local direto na tela de campo (spec 0012, AC-14): só Admin e
 * Preposto, só com sinal, pelas regras da 0011 (`criarLocalizacaoAction`).
 * O novo local fica abaixo de `pai` e entra no pacote do aparelho na hora.
 */
export function CriarLocalCampo({
  pai,
  online,
  onCriado,
}: {
  pai: LocalDoPacote;
  online: boolean;
  onCriado: (local: LocalDoPacote) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<LocalizacaoTipo>('sala');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!online) {
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Sem sinal não dá para criar local. Escolha o local mais próximo e ajuste depois na ficha.
      </p>
    );
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 rounded-xl text-primary"
        onClick={() => setAberto(true)}
      >
        <FolderPlus className="h-4 w-4" aria-hidden />
        Criar local abaixo de {pai.nome}
      </Button>
    );
  }

  return (
    <form
      aria-label={`Criar local abaixo de ${pai.nome}`}
      className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        setErro(null);
        try {
          const r = await criarLocalizacaoAction({ nome, tipo, parentId: pai.id });
          if (!r.ok) {
            setErro(r.error);
            return;
          }
          const nomeLimpo = nome.trim();
          await onCriado({
            id: r.id,
            nome: nomeLimpo,
            tipo,
            parentId: pai.id,
            caminho: `${pai.caminho}/${nomeLimpo}`,
          });
          setNome('');
          setAberto(false);
        } catch {
          setErro('Sem conexão com o servidor. Tente de novo.');
        } finally {
          setEnviando(false);
        }
      }}
    >
      <p className="text-sm font-medium">Novo local abaixo de {pai.caminho}</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="novo-local-tipo">Tipo</Label>
          <select
            id="novo-local-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as LocalizacaoTipo)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TIPOS_EM_CAMPO.map((t) => (
              <option key={t} value={t}>
                {LOCALIZACAO_TIPO_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="novo-local-nome">Nome</Label>
          <Input
            id="novo-local-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            autoComplete="off"
            className="h-11 rounded-xl"
          />
        </div>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando || !nome.trim()} className="rounded-xl">
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Criar local
        </Button>
      </div>
    </form>
  );
}
