import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface PillToggleOption<T extends string> {
  /** Value reported to onChange when this option is picked. */
  value: T;
  /** Visible label. */
  label: string;
}

interface PillToggleProps<T extends string> {
  /** The selected option's value. */
  value: T;
  /** Called with the newly chosen value (never with the current one). */
  onChange: (value: T) => void;
  /** Options in display order. */
  options: readonly PillToggleOption<T>[];
  /** Accessible name for the group, e.g. "Search scope". */
  "aria-label": string;
  /** Extra classes for the track. */
  className?: string;
  /** Test/selector hook forwarded to the group root. */
  "data-slot"?: string;
}

/**
 * Single-choice segmented switch in the header nav's glass-pill style: a
 * rounded frosted track with the chosen option as a soft accent pill, so
 * page-level mode switches read as part of the same family as the top nav.
 */
export function PillToggle<T extends string>({
  value,
  onChange,
  options,
  className,
  ...rest
}: PillToggleProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values: string[]) => {
        // Single choice: ignore the deselect of the current option.
        const next = values.find((v) => v !== value);
        if (next) onChange(next as T);
      }}
      // Non-zero spacing opts out of the group's joined, square-cornered items.
      spacing={1}
      className={cn(
        "rounded-full border border-border bg-surface-muted/75 p-1 backdrop-blur-sm",
        className,
      )}
      {...rest}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            "h-8 rounded-full px-3 text-xs font-medium text-foreground-muted",
            "hover:bg-accent hover:text-foreground",
            "data-pressed:bg-accent data-pressed:font-semibold data-pressed:text-primary",
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
