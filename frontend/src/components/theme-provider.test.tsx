import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { ThemeProvider } from "./theme-provider";

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setSearch("");
  document.documentElement.className = "";
});

describe("ThemeProvider class emission on <html>", () => {
  test("default: neither neo-ui nor hc classes are present", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(false);
    expect(document.documentElement.classList.contains("hc")).toBe(false);
  });

  test("?ui=neo puts neo-ui on <html>", () => {
    setSearch("?ui=neo");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(true);
  });

  test("?hc=on puts hc on <html>", () => {
    setSearch("?hc=on");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("hc")).toBe(true);
  });

  test("?ui=neo&hc=on puts both classes", () => {
    setSearch("?ui=neo&hc=on");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(true);
    expect(document.documentElement.classList.contains("hc")).toBe(true);
  });

  test("localStorage.bchemxtract-ui-mode=neo activates neo-ui", () => {
    localStorage.setItem("bchemxtract-ui-mode", "neo");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(true);
  });

  test("?ui=legacy forces neo-ui off even when stored", () => {
    localStorage.setItem("bchemxtract-ui-mode", "neo");
    setSearch("?ui=legacy");
    render(
      <ThemeProvider defaultTheme="light">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("neo-ui")).toBe(false);
  });

  test("existing .dark emission is preserved", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("dark + neo-ui compose", () => {
    setSearch("?ui=neo");
    render(
      <ThemeProvider defaultTheme="dark">
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("neo-ui")).toBe(true);
  });
});
