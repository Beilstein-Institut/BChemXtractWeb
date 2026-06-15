import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

/**
 * Input — form tier (Liquid Glass rebuild).
 *
 * Shares the form-input pattern with Textarea and Select trigger:
 *   bg-surface-muted / border-border / rounded-sm / focus-visible ring-ring.
 *
 * `data-slot="input"` is the stable hook for downstream selectors and
 * tests; do not rename. The `type` prop is forwarded so `<Input type="email"
 * />` still emits `input[type=email]`.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-sm border border-border bg-surface-muted px-3 py-2 text-sm text-foreground transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
