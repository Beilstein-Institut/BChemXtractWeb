/**
 * ExportMenu — reusable format picker dropdown for chemical export.
 *
 * Used at all four export entry points:
 *   - Toolbar selected: triggerVariant="label", triggerLabel="Export N selected"
 *   - Toolbar Export all: triggerVariant="label", triggerLabel="Export all"
 *   - StructureSheet: triggerVariant="label", triggerLabel="Export"
 *   - Per-card icon: triggerVariant="icon"
 *
 * One click on a format item triggers the download via onExport callback.
 * No modal, no confirmation.
 *
 * The RXN item is aria-disabled to prevent accidental action.
 */
import {
  FileOutputIcon,
  FileCode2Icon,
  BracesIcon,
  TableIcon,
  ImageIcon,
  FileImageIcon,
  ArrowRightLeftIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/types/export";
import { FORMAT_LABELS } from "@/types/export";

export interface ExportMenuProps {
  /**
   * Called when user selects a non-disabled export format.
   * Receives the format string. Caller is responsible for building
   * ExportRequest payload and calling postExport().
   */
  onExport: (format: ExportFormat) => void;
  /**
   * Trigger button appearance.
   * "label" — text button (used in toolbar and sheet).
   * "icon" — icon-only export glyph (used on StructureCard).
   */
  triggerVariant?: "label" | "icon";
  /** Text shown on the trigger button when triggerVariant="label". */
  triggerLabel?: string;
  /** If true, the trigger button is disabled (e.g., no structures to export). */
  disabled?: boolean;
  /**
   * Dropdown alignment relative to trigger.
   * "end" for toolbar/sheet (aligns right), "start" for per-card (aligns left).
   */
  align?: "start" | "end" | "center";
  /**
   * Optional click handler on the trigger button wrapper.
   * Used by StructureCard to call e.stopPropagation() before the dropdown opens.
   */
  onTriggerClick?: (e: React.MouseEvent) => void;
  /**
   * When true, the RXN/RDfile item is enabled and
   * its "Available after reaction extraction" tooltip is suppressed. Clicking
   * the item fires onExport("rxn"). Default false — preserves substance-only
   * behavior for all existing call sites (StructureCard, StructureSheet,
   * BrowseToolbar, StructureBrowser).
   */
  reactionsAvailable?: boolean;
  /**
   * When true (label variant only), the trigger collapses to an icon-only
   * button below the `sm` breakpoint and shows the label at sm+. Lets a
   * crowded mobile toolbar fit without cropping while desktop keeps the text.
   */
  compactLabel?: boolean;
}

/** Icon for each format item. RXN gets ArrowRightLeftIcon. */
const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  sdf: <FileCode2Icon className="size-4" />,
  json: <BracesIcon className="size-4" />,
  tsv: <TableIcon className="size-4" />,
  png: <ImageIcon className="size-4" />,
  svg: <FileImageIcon className="size-4" />,
  v3000: <FileCode2Icon className="size-4" />,
  rxn: <ArrowRightLeftIcon className="size-4" />,
};

/** Ordered format list as shown in dropdown. */
const FORMAT_ORDER: ExportFormat[] = ["sdf", "json", "tsv", "png", "svg", "v3000"];

/**
 * ExportMenu — the shared format picker dropdown.
 *
 * RXN/RDfile item is always rendered but disabled with a tooltip explaining
 * it becomes available after reaction extraction.
 */
export function ExportMenu({
  onExport,
  triggerVariant = "label",
  triggerLabel = "Export",
  disabled = false,
  align = "end",
  onTriggerClick,
  reactionsAvailable = false,
  compactLabel = false,
}: ExportMenuProps) {
  // The menu trigger renders the <Button> directly (not wrapped in a <span>),
  // so the trigger IS a native <button> — correct ARIA/keyboard semantics and
  // no nested-interactive element (matches the Sheet/Tooltip trigger pattern
  // used elsewhere). The icon variant composes the tooltip and menu triggers
  // onto the same Button via nested `render` props.
  return (
    <DropdownMenu>
      {triggerVariant === "icon" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Export structure"
                    disabled={disabled}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={onTriggerClick}
                  />
                }
              />
            }
          >
            <FileOutputIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Export structure</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onTriggerClick}
              aria-label={triggerLabel}
            />
          }
        >
          <FileOutputIcon className={cn("size-4", compactLabel ? "sm:mr-1.5" : "mr-1.5")} />
          <span className={compactLabel ? "hidden sm:inline" : undefined}>{triggerLabel}</span>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-micro font-semibold uppercase tracking-widest text-muted-foreground px-3 py-1.5">
            Format
          </DropdownMenuLabel>
          {FORMAT_ORDER.map((fmt) => (
            <DropdownMenuItem
              key={fmt}
              className="px-3 py-2 gap-2 text-caption cursor-pointer"
              onClick={() => onExport(fmt)}
            >
              {FORMAT_ICONS[fmt]}
              {FORMAT_LABELS[fmt]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* RXN/RDfile — enabled when reactionsAvailable=true,
              otherwise rendered disabled with the "available after reaction
              extraction" tooltip so existing substance-only call sites retain
              their behavior. */}
          {reactionsAvailable ? (
            <DropdownMenuItem
              className="px-3 py-2 gap-2 text-caption cursor-pointer"
              onClick={() => onExport("rxn")}
            >
              {FORMAT_ICONS["rxn"]}
              {FORMAT_LABELS["rxn"]}
            </DropdownMenuItem>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>
                <DropdownMenuItem
                  className="px-3 py-2 gap-2 text-caption pointer-events-none opacity-50"
                  aria-disabled="true"
                >
                  {FORMAT_ICONS["rxn"]}
                  {FORMAT_LABELS["rxn"]}
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="left">Available after reaction extraction</TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
