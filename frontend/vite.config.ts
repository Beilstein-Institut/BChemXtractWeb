/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import path from "path";

// readFileSync instead of a JSON import — tsconfig.node.json doesn't enable
// resolveJsonModule, and a runtime read keeps the config tsconfig untouched.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};

// Deployment sub-path. Production sits behind an Apache reverse proxy that
// serves the app from a sub-path, not the origin root, so every asset, API,
// and router URL has to carry that prefix — a root-absolute /assets/*.js
// escapes the proxied prefix and 404s. Vite requires leading and trailing
// slashes. Empty / unset means "origin root", which is what dev and tests use.
const basePath = (process.env.VITE_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "");
const base = basePath ? `/${basePath}/` : "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  define: {
    // App version stamped from package.json at build time (About version tile).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    exclude: ["e2e/**", "node_modules/**"],
  },
});
