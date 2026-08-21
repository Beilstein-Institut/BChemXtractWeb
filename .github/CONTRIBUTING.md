# Contributing to BChemXtractWeb

Thanks for taking an interest. Bug reports, small fixes, and larger features are
all welcome. This guide covers the parts that are specific to this project — the
rest is ordinary GitHub work.

By participating you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
Found a security problem? Do **not** open an issue — follow the
[Security Policy](./SECURITY.md) instead.

## Before you write code

- **Open an issue first for anything non-trivial.** A bug fix or a typo can go
  straight to a pull request. For a new feature, a new endpoint, or a schema
  change, describe the idea in an issue so we can agree on the shape before you
  spend time on it.
- **Say which part you are touching.** The stack has three layers and they have
  different rules (see below).
- **Note that the upstream Java library is out of bounds.** BChemXtract itself
  lives at https://github.com/Beilstein-Institut/BChemXtract and is consumed
  here as a pre-built fat JAR. Changes to the extractor belong in that
  repository. The one exception is `backend/cdx-render/`, which is first-party
  Java in this repo.

## Reporting a bug

Include:

- the version or commit you are running, and how you deployed it
  (`deploy.sh` / Docker Compose, or a direct `uvicorn` + `npm run dev` setup);
- what you expected and what happened instead;
- a sample CDX or CDXML file if the bug is file-specific — that is almost always
  the fastest route to a fix. If the file is confidential, say so and describe
  its structure instead.

## Development setup

The README is the single source of truth for setup, so we do not duplicate it
here. Read these two sections:

- **Running the dev stack without Docker** — backend (Python 3.11 + Java 21 JDK
  + Maven), frontend (Node 18+), and the local PostgreSQL 16 the backend needs.
- **Running the test suites** — the backend, frontend, and `deploy.sh` suites.

Two things catch newcomers out:

1. **You need a JDK, not just a JRE.** JPype starts a real JVM through JNI. Set
   `JAVA_HOME` if JPype cannot find it.
2. **You need the JAR before the backend will start.** Run
   `bash backend/scripts/build_jar.sh` (fat JAR, needs Maven and network access)
   and `bash backend/scripts/build_cdx_render.sh` (the first-party renderer).
   Docker builds do this inside the image; a host-side dev setup does not.

The backend test suite runs against a real PostgreSQL and a real JVM — there are
no mocks for either. That is deliberate: mocked JPype tests passed while the real
bridge was broken.

## Branches and pull requests

- Base your work on **`main`** and target `main` with the pull request. CI runs
  on pull requests to `main`; a pull request against any other branch gets no
  checks. `development` and personal `dev-*` branches are maintainer branches —
  please leave them alone.
- One logical change per pull request. A 40-file pull request that fixes a bug
  *and* renames things *and* adds a feature will be sent back for splitting.
- Keep the description short and say **why**, not just what. Link the issue it
  closes.
- Add a test for anything non-trivial. A bug fix should come with a test that
  fails before the fix.
- Update the README or the relevant docs in the same pull request if you change
  behaviour a user can see.
- Do not commit generated or local-only files: JARs, `.env`, `node_modules`,
  build output, `.planning/`, or `docs/superpowers/`. Check `git status` before
  you commit.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) — the
release automation reads them to work out the next version number and to build
the changelog.

```
feat(export): add RXN output for reactions
fix(render): cap total pixels decoded from embedded pictures
docs: explain the sub-path deployment flag
ci(release): bump the npm lockfile version alongside package.json
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`,
`perf`. A breaking change gets a `!` after the type (`feat!:`) and a
`BREAKING CHANGE:` paragraph in the body. Only `feat` and `fix` produce a
release entry.

Please do not add AI-assistant attribution trailers or generated-by footers to
commits or pull request descriptions.

## Checks that must pass

Run these locally before you push. They are exactly what CI runs, so a green
local run means a green pull request:

```bash
# Backend
cd backend && ruff check . && ruff format --check . && pytest

# Frontend
cd frontend && npm run lint && npx tsc --noEmit && \
  npx prettier --check "src/**/*.{ts,tsx,css}" "e2e/**/*.ts" index.html && \
  npx vitest run
```

Installing the pre-commit hooks handles the formatting half automatically:

```bash
pip install pre-commit && pre-commit install
```

A separate secret-scanning job (gitleaks) also runs on every pull request. If it
flags something, rotate the credential — do not just amend the commit, because
the value is already in the pushed history.

## Style

- **Python** — Ruff for both linting and formatting, 88-column lines,
  `snake_case` modules, Google-style docstrings on public functions in
  `app/services/` and `app/models/`. Type hints on anything public.
- **TypeScript** — ESLint plus Prettier. `PascalCase.tsx` for components,
  `camelCase.ts` for hooks and utilities, tests co-located as
  `Thing.test.tsx`.
- **Frontend components** — the UI is built on Base UI, not Radix, so state
  lives in `data-checked` / `data-active` / `data-pressed` attributes rather
  than `data-state="…"`.
- **Match the file you are editing.** Local convention beats any rule in this
  document.

## Licence

Contributions are accepted under the [MIT License](../LICENSE), the same licence
as the project. There is no separate CLA to sign.
