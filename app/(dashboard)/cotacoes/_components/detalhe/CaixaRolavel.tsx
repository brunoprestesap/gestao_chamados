import type { ReactNode } from 'react';

/**
 * A caixa que rola a tabela de lado quando ela não cabe (spec 0021, AC-25),
 * com foco pelo teclado e rótulo (AC-26). O `w-fit min-w-full` de dentro
 * nunca fica mais estreito que a tabela, então o contêiner da `Table` do
 * shadcn não rola sozinho: quem rola é sempre esta caixa.
 */
export function CaixaRolavel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={rotulo}
      tabIndex={0}
      className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="w-fit min-w-full">{children}</div>
    </div>
  );
}
