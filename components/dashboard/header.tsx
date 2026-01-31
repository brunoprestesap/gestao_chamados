export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4 sm:mb-5 md:mb-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl md:text-2xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground sm:mt-1 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
