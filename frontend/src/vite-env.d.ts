/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * BChemXtract release tag the backend image was built from (e.g. "v1.1.1").
   * Resolved by deploy.sh and injected at frontend build time via the
   * frontend/Dockerfile ARG. Empty when built outside the docker-compose flow
   * (e.g. `npm run dev`); the SiteFooter degrades gracefully in that case.
   */
  readonly VITE_BCHEMXTRACT_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Frontend app version, stamped from package.json at build time via the
 * `define` block in vite.config.ts (used by the About page version tile).
 */
declare const __APP_VERSION__: string;
