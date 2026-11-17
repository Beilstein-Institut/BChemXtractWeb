# REVIEW.md

What a reviewer (human or Claude) must check in this repo. Read `CLAUDE.md` first.

## What failure looks like here

- **Wrong chemistry.** A SMILES, InChI, InChIKey, formula or reaction shown for the
  wrong structure, or a value invented when the Java side returned nothing. Empty is
  correct; a guessed value is a bug.
- **Data leak between sessions.** Any query that bypasses Postgres RLS, or a
  cleanup that deletes rows other sessions still use (chem pools have no RLS; use
  `sweep_orphan_chem_rows()`).
- **JVM misuse.** A second `jpype.startJVM()`, a `shutdownJVM()`, or a blocking JPype
  call on the async event loop (must go through `run_in_jvm_thread` or
  `run_in_jvm_thread_abandonable` in `app/services/jvm_bridge.py`, which attach the
  JVM thread and cap in-flight calls; a bare executor is not enough).
- **Unsafe SVG or upload.** Rendered SVG that skips `sanitize_svg`, or file input
  trusted before format detection (`VjCD` magic bytes vs CDXML).
- **Broken migration.** An Alembic migration without a working `downgrade()`.
- **Upstream edited.** Any change to BChemXtract Java source. Only
  `backend/cdx-render/` is first-party Java.
- **Secrets or AI attribution.** Committed credentials, `.env` values, or
  `Co-Authored-By: Claude` / "Generated with Claude Code" text.

## Rules for findings

- Tag each finding **Important**, **Nit** or **Pre-existing**.
- Every finding needs a `file:line` and one sentence on the concrete failure.
- Max 3 Nits. No style or formatting comments — ruff, eslint and prettier own that.
- Start the summary with the count, e.g. `2 Important, 1 Nit`. If there is
  nothing to fix, say `Nothing to fix.`

## Skip these paths

- `frontend/package-lock.json`, `backend/uv.lock`, any other lockfile
- `.release-please-manifest.json`, any generated `CHANGELOG.md`
- `graphify-out/`, `docs/superpowers/`, `.planning/`
