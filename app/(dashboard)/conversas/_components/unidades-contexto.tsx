'use client';

import { createContext, useContext } from 'react';

import type { UnidadeNaTela } from '../_types';

/**
 * As unidades ativas que o `layout.tsx` já leu no servidor (spec 0004, AC-6).
 * O cartão resumo mora dentro da página, e a página não recebe props do
 * layout: o contexto é o caminho entre os dois.
 */

const UnidadesContexto = createContext<UnidadeNaTela[]>([]);

export function UnidadesProvider({
  unidades,
  children,
}: {
  unidades: UnidadeNaTela[];
  children: React.ReactNode;
}) {
  return <UnidadesContexto value={unidades}>{children}</UnidadesContexto>;
}

export function useUnidades(): UnidadeNaTela[] {
  return useContext(UnidadesContexto);
}
