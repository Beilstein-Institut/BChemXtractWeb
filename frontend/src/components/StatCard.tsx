/**
 * StatCard — single summary metric tile (Phase 5, D-08).
 * UI-SPEC: Card bg, px-6 py-5, 40px weight-600 number, 14px muted label.
 */

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

/** Single metric tile. Shows Skeleton while loading=true. */
export function StatCard({ label, value, loading = false, icon, className }: StatCardProps) {
  if (loading) {
    return <Skeleton className={cn("h-[88px] rounded-lg", className)} />;
  }

  const displayValue = value === "" || value === null || value === undefined ? "—" : value;

  return (
    <Card className={cn("px-6 py-5 transition-shadow hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]", className)}>
      <p className="text-display font-semibold text-foreground">
        {displayValue}
      </p>
      <div className="mt-1 flex items-center gap-1">
        {icon && (
          <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <p className="text-caption text-muted-foreground">
          {label}
        </p>
      </div>
    </Card>
  );
}
