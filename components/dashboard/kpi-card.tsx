import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  value,
  helper,
  icon: Icon,
  accentClassName,
}: {
  title: string;
  value: string | number;
  helper?: string;
  icon: LucideIcon;
  accentClassName?: string; // ex: "bg-blue-100 text-blue-600"
}) {
  return (
    <Card className="relative overflow-hidden">
      {/* “bolha” decorativa */}
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-muted',
          accentClassName,
        )}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
          </div>

          <div className="mt-1 rounded-md p-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
