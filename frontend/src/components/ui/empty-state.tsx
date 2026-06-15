/**
 * EmptyState — shared empty-state primitive.
 *
 * Variants:
 *   large   (default): illustration at size-16, title in text-sub-heading/600
 *   compact: illustration at size-10, title in text-caption/600
 *
 * We compose raw shadcn `Empty` primitives rather than relying on
 * `EmptyMedia` variants (size-8) because the design requires larger icon
 * wrappers (size-16 large / size-10 compact) than the size-8 default.
 */
import type { LucideIcon } from "lucide-react";
import { PackageOpenIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Custom illustration — overrides `icon`. */
  illustration?: ReactNode;
  /** Shorthand for default icon-in-circle treatment. */
  icon?: LucideIcon;
  title: string;
  message: string | ReactNode;
  /** Optional action slot (Button, DidYouMean chips, etc.). */
  action?: ReactNode;
  size?: "compact" | "large";
  className?: string;
}

export function EmptyState({
  illustration,
  icon: Icon,
  title,
  message,
  action,
  size = "large",
  className,
}: EmptyStateProps) {
  const isLarge = size === "large";

  const IconSlot = illustration ?? (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center",
        isLarge ? "size-16" : "size-10",
      )}
    >
      {Icon ? (
        <Icon
          className={cn("text-muted-foreground", isLarge ? "size-6" : "size-4")}
          aria-hidden="true"
        />
      ) : (
        <PackageOpenIcon
          className={cn("text-muted-foreground", isLarge ? "size-6" : "size-4")}
          aria-hidden="true"
        />
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        isLarge ? "min-h-[320px] py-16 gap-4 justify-center" : "py-8 gap-3",
        className,
      )}
    >
      {IconSlot}
      <h2
        className={cn(
          "font-semibold tracking-tight text-foreground",
          isLarge ? "text-sub-heading" : "text-caption",
        )}
      >
        {title}
      </h2>
      <div
        className={cn("text-muted-foreground max-w-[400px]", isLarge ? "text-body" : "text-micro")}
      >
        {message}
      </div>
      {action && <div className={cn("mt-2", isLarge ? "mt-6" : "mt-4")}>{action}</div>}
    </div>
  );
}
