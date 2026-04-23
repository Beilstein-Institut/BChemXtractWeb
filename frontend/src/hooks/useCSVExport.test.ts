/**
 * useCSVExport tests — Phase 3 Task 12.
 *
 * Covers:
 *   - `escapeCSVCell`: comma, double quote, CR, LF escaping.
 *   - `serializeCSV`: header row, format callback, null/undefined
 *     fallback, CRLF row separator.
 *   - `useCSVExport` hook: triggers Blob + anchor click + object URL
 *     cleanup. The anchor + URL APIs are mocked; we don't hit the DOM
 *     download path.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { escapeCSVCell, serializeCSV, useCSVExport, type CSVColumn } from "./useCSVExport";

interface Row {
  id: number;
  name: string;
  note?: string | null;
}

const columns: CSVColumn<Row>[] = [
  { key: "id", label: "Id" },
  { key: "name", label: "Name" },
  { key: "note", label: "Note" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("escapeCSVCell", () => {
  it("passes plain values through unquoted", () => {
    expect(escapeCSVCell("hello")).toBe("hello");
    expect(escapeCSVCell("")).toBe("");
  });

  it("quotes + escapes cells containing a comma", () => {
    expect(escapeCSVCell("a,b")).toBe('"a,b"');
  });

  it("quotes + doubles embedded double quotes", () => {
    expect(escapeCSVCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes cells containing a CR or LF", () => {
    expect(escapeCSVCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCSVCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("serializeCSV", () => {
  it("emits header row followed by data rows, separated by CRLF", () => {
    const rows: Row[] = [
      { id: 1, name: "Alpha", note: "plain" },
      { id: 2, name: "Beta", note: "also fine" },
    ];
    const csv = serializeCSV(rows, columns);
    expect(csv).toBe(["Id,Name,Note", "1,Alpha,plain", "2,Beta,also fine"].join("\r\n"));
  });

  it("escapes cells with commas, quotes, and newlines", () => {
    const rows: Row[] = [
      { id: 1, name: "Comma, name", note: 'quote "x" here' },
      { id: 2, name: "newline\nhere", note: null },
    ];
    const csv = serializeCSV(rows, columns);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Id,Name,Note");
    expect(lines[1]).toBe('1,"Comma, name","quote ""x"" here"');
    expect(lines[2]).toBe('2,"newline\nhere",');
  });

  it("runs per-column formatters with the raw value + full row", () => {
    const rows: Row[] = [{ id: 42, name: "fourty-two", note: "n/a" }];
    const observed: Array<{ value: unknown; row: Row }> = [];
    const cols: CSVColumn<Row>[] = [
      {
        key: "id",
        label: "Id",
        format: (value, row) => {
          observed.push({ value, row });
          return `#${value}`;
        },
      },
      { key: "name", label: "Name" },
    ];
    const csv = serializeCSV(rows, cols);
    expect(csv).toBe(["Id,Name", "#42,fourty-two"].join("\r\n"));
    expect(observed).toEqual([{ value: 42, row: rows[0] }]);
  });

  it("coerces null/undefined raw values to empty string", () => {
    const rows: Row[] = [
      { id: 1, name: "has null", note: null },
      { id: 2, name: "has undefined", note: undefined },
    ];
    const csv = serializeCSV(rows, columns);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("1,has null,");
    expect(lines[2]).toBe("2,has undefined,");
  });

  it("emits only a header row when items is empty", () => {
    const csv = serializeCSV<Row>([], columns);
    expect(csv).toBe("Id,Name,Note");
  });
});

describe("useCSVExport", () => {
  it("creates an object URL, clicks an anchor, and revokes the URL", () => {
    // Mock URL + anchor so JSDOM does not actually navigate / download.
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const anchorClick = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === "a") {
          el.click = anchorClick;
        }
        return el;
      });

    const { result } = renderHook(() => useCSVExport<Row>());
    const exportCsv = result.current;

    act(() => {
      exportCsv(
        [
          { id: 1, name: "Alpha", note: "n" },
          { id: 2, name: "B, eta", note: null },
        ],
        {
          filename: "rows.csv",
          columns,
        },
      );
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createSpy.mock.calls[0] as [Blob];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toContain("text/csv");
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
    expect(createElementSpy).toHaveBeenCalledWith("a");
  });

  it("returns a stable callback reference across renders", () => {
    const { result, rerender } = renderHook(() => useCSVExport<Row>());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
