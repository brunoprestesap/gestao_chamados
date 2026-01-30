export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4 sm:mb-6">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground sm:mt-1">{subtitle}</p> : null}
    </header>
  );
}
