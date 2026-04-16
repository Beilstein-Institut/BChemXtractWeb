/**
 * ExportMenu — reusable format picker dropdown for chemical export.
 *
 * Used at all four export entry points (D-01 through D-04, D-05, D-06):
 *   - Toolbar selected: triggerVariant="label", triggerLabel="Export N selected"
 *   - Toolbar Export All: triggerVariant="label", triggerLabel="Export All"
 *   - StructureSheet: triggerVariant="label", triggerLabel="Export"
 *   - Per-card icon: triggerVariant="icon"
 *
 * One click on a format item triggers the download via onExport callback.
 * No modal, no confirmation (D-05).
 *
 * STRIDE: T-08-08: RXN item is aria-disabled to prevent accidental action.
 */
import {
  DownloadIcon,
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
   * "icon" — icon-only DownloadIcon (used on StructureCard).
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
}

/** Icon for each format item. RXN gets ArrowRightLeftIcon. */
const FORMAT_ICONS: Record<ExportFormat, React.ReactNode> = {
  sdf: <FileCode2Icon className="size-4" />,
  json: <BracesIcon className="size-4" />,
  csv: <TableIcon className="size-4" />,
  png: <ImageIcon className="size-4" />,
  svg: <FileImageIcon className="size-4" />,
  cml: <FileCode2Icon className="size-4" />,
  v3000: <FileCode2Icon className="size-4" />,
  rxn: <ArrowRightLeftIcon className="size-4" />,
};

/** Ordered format list as shown in dropdown (D-05, UI-SPEC format list order). */
const FORMAT_ORDER: ExportFormat[] = [
  "sdf",
  "json",
  "csv",
  "png",
  "svg",
  "cml",
  "v3000",
];

/**
 * ExportMenu — the shared format picker dropdown.
 *
 * RXN/RDfile item is always rendered but disabled with a tooltip explaining
 * it becomes available after Phase 10 reaction extraction (D-11).
 */
export function ExportMenu({
  onExport,
  triggerVariant = "label",
  triggerLabel = "Export",
  disabled = false,
  align = "end",
  onTriggerClick,
}: ExportMenuProps) {
  const trigger =
    triggerVariant === "icon" ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Export structure"
              disabled={disabled}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onTriggerClick}
            />
          }
        >
          <DownloadIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Export structure</TooltipContent>
      </Tooltip>
    ) : (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onTriggerClick}
      >
        <DownloadIcon className="size-4 mr-1.5" />
        {triggerLabel}
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<span />}>
        {trigger}
      </DropdownMenuTrigger>
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
          {/* RXN/RDfile — disabled until Phase 10 (D-11) */}
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
            <TooltipContent side="left">
              Available after reaction extraction (Phase 10)
            </TooltipContent>
          </Tooltip>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
