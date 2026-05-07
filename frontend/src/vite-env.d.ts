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
