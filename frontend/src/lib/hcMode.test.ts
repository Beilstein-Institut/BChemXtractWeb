import { beforeEach, describe, expect, test } from "vitest";
import {
  HC_MODE_STORAGE_KEY,
  HC_MODE_URL_PARAM,
  getStoredHcMode,
  readHcModeFromUrl,
  resolveHcMode,
  setStoredHcMode,
} from "./hcMode";

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setSearch("");
});

describe("readHcModeFromUrl", () => {
  test("returns true when ?hc=on is present", () => {
    setSearch("?hc=on");
    expect(readHcModeFromUrl()).toBe(true);
  });

  test("returns false when ?hc=off is present", () => {
    setSearch("?hc=off");
    expect(readHcModeFromUrl()).toBe(false);
  });

  test("returns null when the param is missing", () => {
    expect(readHcModeFromUrl()).toBeNull();
  });

  test("returns null for unknown values", () => {
    setSearch("?hc=maybe");
    expect(readHcModeFromUrl()).toBeNull();
  });
});

describe("getStoredHcMode / setStoredHcMode", () => {
  test("round-trips true", () => {
    setStoredHcMode(true);
    expect(getStoredHcMode()).toBe(true);
  });

  test("round-trips false", () => {
    setStoredHcMode(false);
    expect(getStoredHcMode()).toBe(false);
  });

  test("setStoredHcMode(null) removes the entry", () => {
    setStoredHcMode(true);
    setStoredHcMode(null);
    expect(getStoredHcMode()).toBeNull();
  });

  test("getStoredHcMode returns null for malformed values", () => {
    localStorage.setItem(HC_MODE_STORAGE_KEY, "sparkle");
    expect(getStoredHcMode()).toBeNull();
  });
});

describe("resolveHcMode (URL wins over storage)", () => {
  test("url=on + no storage => true", () => {
    setSearch("?hc=on");
    expect(resolveHcMode()).toBe(true);
  });

  test("url=off + storage=on => false (URL overrides)", () => {
    setSearch("?hc=off");
    setStoredHcMode(true);
    expect(resolveHcMode()).toBe(false);
  });

  test("no url + storage=on => true", () => {
    setStoredHcMode(true);
    expect(resolveHcMode()).toBe(true);
  });

  test("no url + no storage => false (default)", () => {
    expect(resolveHcMode()).toBe(false);
  });
});

test("HC_MODE_URL_PARAM is 'hc'", () => {
  expect(HC_MODE_URL_PARAM).toBe("hc");
});

test("HC_MODE_STORAGE_KEY is 'bchemxtract-hc'", () => {
  expect(HC_MODE_STORAGE_KEY).toBe("bchemxtract-hc");
});
