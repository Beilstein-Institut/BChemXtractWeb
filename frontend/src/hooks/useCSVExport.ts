/**
 * useCSVExport — client-side CSV serialisation + download.
 *
 * Produces a stable `(items, options) => void` callback that serialises an
 * array of rows to RFC 4180 CSV and triggers a browser download. The hook
 * does not hold any state; it only wraps the serialiser in `useCallback`
 * so call sites can add it to effect/memo dependency arrays without
 * tripping lint rules.
 *
 * Escaping contract: any cell containing a comma, double quote, carriage
 * return, or newline is wrapped in double quotes with embedded quotes
 * doubled (`"` → `""`). Other cells pass through unquoted. Line endings
 * are CRLF (`\r\n`) per RFC 4180.
 *
 * The download path uses a short-lived Blob + object URL. Cleanup
 * happens inside the callback so callers do not need to release the URL.
 *
 * Intentionally framework-agnostic: the caller owns the header list, the
 * filename, and the per-cell formatters. The hook only knows how to
 * escape, join, and download.
 */
import { useCallback } from "react";

/**
 * One column in the CSV export.
 *
 * `key` is read from each row via bracket access. `format` — when
 * provided — transforms the raw value (and receives the full row for
 * cross-field formatting). If `format` is omitted, the raw value is
 * coerced to string (null/undefined → "").
 */
export interface CSVColumn<T> {
  /** Property key on the row or an arbitrary string used only as an id. */
  key: keyof T | string;
  /** Header label emitted on the first line. */
  label: string;
  /** Optional formatter — receives the raw value and the full row. */
  format?: (value: unknown, row: T) => string;
}

export interface CSVExportOptions<T> {
  /** Filename as offered to the browser download (include `.csv`). */
  filename: string;
  /** Column definitions in output order. */
  columns: ReadonlyArray<CSVColumn<T>>;
}

/** Escape a single cell per RFC 4180. Pure — exported for tests. */
export function escapeCSVCell(value: string): string {
  // Neutralize spreadsheet formula injection (CWE-1236): a cell beginning
  // with =, +, -, @, tab, or CR is interpreted as a formula by Excel /
  // LibreOffice / Sheets. The uploaded filename is fully client-controlled,
  // so prefix a single quote to force literal-text rendering. Runs before
  // RFC-4180 quoting so the guard survives the quote-wrapping.
  let cell = value;
  if (cell.length > 0 && /^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Serialise rows + columns to a CSV string (no download). Pure; testable. */
export function serializeCSV<T>(
  items: ReadonlyArray<T>,
  columns: ReadonlyArray<CSVColumn<T>>,
): string {
  const headerLine = columns.map((c) => escapeCSVCell(c.label)).join(",");
  const rowLines = items.map((row) =>
    columns
      .map((c) => {
        const raw = (row as Record<string, unknown>)[c.key as string];
        const formatted = c.format
          ? c.format(raw, row)
          : raw === null || raw === undefined
            ? ""
            : String(raw);
        return escapeCSVCell(formatted);
      })
      .join(","),
  );
  return [headerLine, ...rowLines].join("\r\n");
}

/**
 * Trigger a browser download of a generated CSV. Uses a Blob + anchor
 * click. Private to this module — the hook is the only caller.
 */
function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * React hook — returns a stable export callback.
 *
 * Usage:
 * ```ts
 * const exportCsv = useCSVExport<HistoryListItem>();
 * exportCsv(items, {
 *   filename: "history.csv",
 *   columns: [
 *     { key: "filename", label: "File" },
 *     { key: "created_at", label: "Date", format: (v) => new Date(v as string).toISOString() },
 *   ],
 * });
 * ```
 */
export function useCSVExport<T>(): (items: ReadonlyArray<T>, options: CSVExportOptions<T>) => void {
  return useCallback((items, options) => {
    const csv = serializeCSV(items, options.columns);
    downloadCSV(csv, options.filename);
  }, []);
}
