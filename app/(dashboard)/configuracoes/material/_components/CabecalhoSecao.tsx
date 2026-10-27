/** O título de cada seção do cadastro de material, com a descrição e as ações à direita (spec 0021, AC-18). */
export function CabecalhoSecao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
        {descricao && <p className="max-w-2xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export const CARTAO_CADASTRO = 'rounded-2xl border border-border/50 bg-card shadow-sm';
