'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { CONVERSAS_SUBTITULO, CONVERSAS_TITULO } from '../_constants';
import type { CursorLateral, ItemLateral } from '../_types';
import { ListaLateral } from './ListaLateral';

/**
 * O quadro da tela (spec 0003). Duas colunas no computador; no celular, uma
 * tela de cada vez, escolhida pela rota e trocada por CSS, sem gaveta (AC-11).
 *
 * É aqui também que mora a recarga em tempo real: a tela pega carona no evento
 * de navegador que o `RealtimeProvider` já dispara, sem sala nem evento novo
 * no socket (AC-13).
 */

/** Espera antes de recarregar, para uma rajada de avisos virar uma recarga só. */
const AGRUPAR_MS = 800;

type Props = {
  rascunhos: ItemLateral[];
  chamados: ItemLateral[];
  temMais: boolean;
  cursor: CursorLateral | null;
  children: React.ReactNode;
};

export function ConversasShell({ rascunhos, chamados, temMais, cursor, children }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const naLista = caminho === '/conversas';

  useEffect(() => {
    let agendado: ReturnType<typeof setTimeout> | null = null;

    function aoNotificar() {
      if (agendado) clearTimeout(agendado);
      agendado = setTimeout(() => router.refresh(), AGRUPAR_MS);
    }

    window.addEventListener('notification:new', aoNotificar);
    return () => {
      window.removeEventListener('notification:new', aoNotificar);
      if (agendado) clearTimeout(agendado);
    };
  }, [router]);

  return (
    // Primeira tela do projeto a ocupar a altura toda da área de conteúdo: o
    // desconto é do cabeçalho do shell mais o respiro que ele já aplica.
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[30rem] flex-col gap-3">
      <div className="hidden shrink-0 md:block">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{CONVERSAS_TITULO}</h1>
        <p className="text-sm text-muted-foreground">{CONVERSAS_SUBTITULO}</p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <ListaLateral
          rascunhos={rascunhos}
          chamados={chamados}
          temMais={temMais}
          cursor={cursor}
          className={cn('w-full md:w-[19rem]', naLista ? 'flex' : 'hidden md:flex')}
        />

        <div className={cn('min-w-0 flex-1', naLista ? 'hidden md:flex' : 'flex')}>{children}</div>
      </div>
    </div>
  );
}
