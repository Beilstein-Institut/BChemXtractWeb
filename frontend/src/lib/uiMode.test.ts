import { beforeEach, describe, expect, test } from "vitest";
import {
  UI_MODE_STORAGE_KEY,
  UI_MODE_URL_PARAM,
  getStoredUiMode,
  readUiModeFromUrl,
  resolveUiMode,
  setStoredUiMode,
} from "./uiMode";

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setSearch("");
});

describe("readUiModeFromUrl", () => {
  test("returns 'neo' when ?ui=neo is present", () => {
    setSearch("?ui=neo");
    expect(readUiModeFromUrl()).toBe("neo");
  });

  test("returns 'legacy' when ?ui=legacy is present", () => {
    setSearch("?ui=legacy");
    expect(readUiModeFromUrl()).toBe("legacy");
  });

  test("returns null when the param is missing", () => {
    setSearch("");
    expect(readUiModeFromUrl()).toBeNull();
  });

  test("returns null for unknown values", () => {
    setSearch("?ui=sparkle");
    expect(readUiModeFromUrl()).toBeNull();
  });
});

describe("getStoredUiMode / setStoredUiMode", () => {
  test("round-trips 'neo'", () => {
    setStoredUiMode("neo");
    expect(getStoredUiMode()).toBe("neo");
    expect(localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("neo");
  });

  test("round-trips 'legacy'", () => {
    setStoredUiMode("legacy");
    expect(getStoredUiMode()).toBe("legacy");
  });

  test("setStoredUiMode(null) removes the entry", () => {
    setStoredUiMode("neo");
    setStoredUiMode(null);
    expect(getStoredUiMode()).toBeNull();
    expect(localStorage.getItem(UI_MODE_STORAGE_KEY)).toBeNull();
  });

  test("getStoredUiMode returns null for unknown stored values", () => {
    localStorage.setItem(UI_MODE_STORAGE_KEY, "sparkle");
    expect(getStoredUiMode()).toBeNull();
  });
});

describe("resolveUiMode (URL wins over storage)", () => {
  test("url=neo + no storage => neo", () => {
    setSearch("?ui=neo");
    expect(resolveUiMode()).toBe("neo");
  });

  test("url=legacy + storage=neo => legacy (URL overrides)", () => {
    setSearch("?ui=legacy");
    setStoredUiMode("neo");
    expect(resolveUiMode()).toBe("legacy");
  });

  test("no url + storage=neo => neo", () => {
    setStoredUiMode("neo");
    expect(resolveUiMode()).toBe("neo");
  });

  test("no url + no storage => legacy (default)", () => {
    expect(resolveUiMode()).toBe("legacy");
  });
});

test("UI_MODE_URL_PARAM is 'ui'", () => {
  expect(UI_MODE_URL_PARAM).toBe("ui");
});

test("UI_MODE_STORAGE_KEY is 'bchemxtract-ui-mode'", () => {
  expect(UI_MODE_STORAGE_KEY).toBe("bchemxtract-ui-mode");
});
