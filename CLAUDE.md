# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BChemXtractWeb is a web application wrapping [BChemXtract](https://github.com/Beilstein-Institut/BChemXtract), a pure-Java extractor of ChemDraw structures and reactions. The app uses **JPype** to bridge Java from Python, **FastAPI** for the API layer, and **React** for the frontend.

BChemXtract parses ChemDraw files (binary CDX and XML CDXML formats), extracts chemical structures and reactions, and enriches them with computed descriptors (InChI, InChI keys, SMILES, RInChI, molecular formulas). Structure extraction is mature; reaction extraction is experimental.

## Architecture

```
┌─────────────────┐     HTTP/JSON     ┌──────────────────┐    JPype/JNI    ┌────────────────────┐
│   React Frontend │ ◄──────────────► │  FastAPI Backend  │ ◄────────────► │  BChemXtract (Java) │
│   (TypeScript)   │                  │  (Python)         │                │  + CDK 2.12         │
└─────────────────┘                   └──────────────────┘                └────────────────────┘
```

### Three-Layer Stack

1. **Frontend** (`frontend/`) — React + TypeScript SPA. Handles file upload, displays extracted structures/reactions with chemical metadata (SMILES, InChI, molecular formula), renders structure images.

2. **Backend** (`backend/`) — FastAPI application. Receives CDX/CDXML file uploads, calls BChemXtract Java classes via JPype, returns structured JSON responses with extracted chemical data.

3. **Java layer** — BChemXtract JAR (built with Maven from upstream). The backend loads this JAR at startup via JPype's JVM initialization. No modifications to upstream Java code.

### JPype Integration Pattern

The backend starts a single JVM per process using `jpype.startJVM()` with the BChemXtract fat JAR on the classpath. Key Java classes accessed from Python:

- **`CDXReader.readDocument(InputStream)`** / **`CDXMLReader.readDocument(InputStream)`** — Parse CDX/CDXML bytes into a `CDDocument` object model
- **`SubstanceXtractor.xtractUnique(CDDocument, BCXSubstanceInfo)`** — Extract deduplicated substances with InChI, SMILES, molecular formula
- **`ReactionXtractor.xtract(CDDocument)`** — Extract reactions with RInChI and reaction SMILES (experimental)
- **`FragmentConverter`**, **`AtomConverter`**, **`BondConverter`**, **`ReactionConverter`** — CDX-to-CDK conversion

Key model classes returned from extraction:
- **`BCXSubstance`** — inchi, inchiKey, smiles, extendedSmiles, molecularFormula, abbreviations, mdlv3000
- **`BCXReaction`** — rinchi, rinchiKey, reactionSmiles, reactants/products/agents (each a `BCXReactionComponent`)
- **`BCXSubstanceInfo`** — statistics: noFragments, noInchis, noSubstances

All classes live under `org.beilstein.chemxtract.*`. The CDX object model has ~38 classes (`CDDocument`, `CDPage`, `CDFragment`, `CDAtom`, `CDBond`, `CDReactionScheme`, etc.) in the `cdx` package.

## Build & Run Commands

### Prerequisites
- Java 17+ (JDK, not just JRE — needed for JPype)
- Python 3.11+
- Node.js 18+
- Maven 3.8+ (to build the upstream JAR)

### Java Layer (BChemXtract JAR)
BChemXtract is included as a git submodule at `backend/lib/bchemxtract/`, pinned to a release tag (v1.0).

```bash
# First-time setup: init submodule and build JAR
cd backend && bash scripts/build_jar.sh

# Update to latest upstream tag (optional)
cd backend && bash scripts/build_jar.sh --update
```

The script initializes the submodule, runs `mvn clean package -DskipTests`, and copies the fat JAR to `backend/jars/`. This is a prerequisite for all backend work.

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt       # or: pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Key Python dependencies: `fastapi`, `uvicorn`, `jpype1`, `python-multipart`

### Frontend
```bash
cd frontend
npm install
npm run dev          # Vite dev server, typically port 5173
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest
```

### Running Tests
```bash
# Backend tests
cd backend && pytest                   # all tests
cd backend && pytest tests/test_extract.py::test_substance_extraction -v  # single test

# Frontend tests
cd frontend && npm run test            # all tests
cd frontend && npx vitest run src/components/FileUpload.test.tsx  # single test
```

## Key Technical Constraints

- **JVM is process-global**: `jpype.startJVM()` can only be called once per Python process. The JAR path must be set before startup. JVM shutdown (`jpype.shutdownJVM()`) is effectively irreversible — design for one long-lived JVM.
- **Thread safety**: JPype calls into the JVM must attach the calling thread. In FastAPI with async workers, wrap blocking JPype calls in `run_in_executor` or use synchronous endpoint handlers.
- **JAVA_HOME**: JPype needs to find the JDK. Set `JAVA_HOME` environment variable or let JPype auto-detect.
- **CDK dependency**: BChemXtract bundles CDK 2.12 in its fat JAR. Do not add CDK separately to the classpath to avoid version conflicts.
- **File formats**: The API must detect whether input is binary CDX or XML CDXML and route to the correct reader (`CDXReader` vs `CDXMLReader`). Binary CDX files start with `VjCD` magic bytes.
- **Upstream is read-only**: Do not fork or modify BChemXtract Java source. All customization happens in the Python/TypeScript layers.

## Project Conventions

- Backend follows FastAPI project structure: `app/main.py` (app factory), `app/routers/` (endpoints), `app/services/` (JPype bridge logic), `app/models/` (Pydantic schemas)
- Frontend uses Vite + React + TypeScript
- API responses use JSON; extracted structure images are returned as base64-encoded PNGs or served via separate image endpoints
- Environment configuration via `.env` files (JAVA_HOME, JAR path, CORS origins)
- `backend/lib/bchemxtract/` is a git submodule (upstream repo, pinned to release tag)
- `backend/jars/` holds the built fat JAR (gitignored due to size)
- `backend/scripts/build_jar.sh` automates submodule init + Maven build + JAR copy

<!-- GSD:project-start source:PROJECT.md -->
## Project

**BChemXtractWeb**

A web application that makes the BChemXtract Java library accessible through a browser-based interface and REST API. Users upload ChemDraw files (CDX/CDXML), and the app extracts chemical structures and reactions, displaying them in an interactive 2D viewer with full metadata (SMILES, InChI, molecular formula). Supports both single-file and bulk processing workflows.

**Core Value:** Any user — technical or not — can extract, browse, search, and export chemical structures from ChemDraw files without installing Java or using a command line.

### Constraints

- **Tech stack**: Python (FastAPI + JPype) backend, React + TypeScript frontend, PostgreSQL database
- **JVM singleton**: JPype starts one JVM per process — irreversible, must handle thread safety with async FastAPI
- **CDK bundled**: BChemXtract fat JAR includes CDK 2.12 — no separate CDK on classpath
- **Upstream read-only**: No modifications to BChemXtract Java source — all customization in Python/TypeScript
- **Java 17+**: Required by BChemXtract and JPype
- **File format detection**: Must detect CDX (magic bytes `VjCD`) vs CDXML (XML) before routing to correct reader
- **Deployment**: Docker containers (Docker Compose)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- Python 3.11+ — Backend API layer (`backend/`), JPype bridge to Java
- TypeScript — Frontend SPA (`frontend/`)
- Java 17+ — BChemXtract library (upstream, read-only; bundled as a fat JAR)
- HTML/CSS — Frontend markup and styling
## Runtime
- Python 3.11+ (backend)
- Node.js 18+ (frontend tooling and dev server)
- Java 17+ JDK — required for JPype/JNI; JRE alone is insufficient
- Python: `pip` with `requirements.txt` or `pip install -e ".[dev]"`
- Node: `npm` with `package.json`
- Java: Maven 3.8+ (used once to build the upstream BChemXtract fat JAR from source)
- Lockfiles: planned (none committed yet)
## Frameworks
- FastAPI — Python web framework for the backend API layer; located at `backend/app/`
- React — Frontend SPA framework; located at `frontend/`
- Vite — Frontend build tool and dev server (port 5173)
- Uvicorn — ASGI server for FastAPI (port 8000)
- pytest — Backend Python test runner; tests under `backend/tests/`
- Vitest — Frontend test runner; tests co-located under `frontend/src/`
## Key Dependencies
- `jpype1` — Python package that starts a JVM and bridges Python↔Java via JNI; enables calling BChemXtract Java classes directly from Python
- `fastapi` — Core backend framework
- `uvicorn` — ASGI server for FastAPI
- `python-multipart` — Required by FastAPI for file upload (`multipart/form-data`) support
- BChemXtract fat JAR — upstream library built with Maven, placed at `backend/jars/bchemxtract-*-jar-with-dependencies.jar`; gitignored due to size
- CDK 2.12 — Chemistry Development Kit; bundled inside the BChemXtract fat JAR; must NOT be added separately to avoid classpath version conflicts
- React + TypeScript (via Vite scaffold)
- ESLint — linting (`npm run lint`)
## Configuration
- `.env` files (gitignored by Python template `.gitignore`)
- Key environment variables planned:
- `backend/` — Python project config via `requirements.txt` and/or `pyproject.toml` (planned)
- `frontend/` — Vite config at `frontend/vite.config.ts` (planned)
- `frontend/tsconfig.json` — TypeScript compiler config (planned)
## Platform Requirements
- Java 17+ JDK (not JRE) must be installed and `JAVA_HOME` set or auto-detectable by JPype
- Python 3.11+ virtualenv recommended (`backend/.venv`)
- Node.js 18+ for frontend tooling
- ASGI-compatible host for Uvicorn/FastAPI
- JVM must be present on the server (same Java 17+ JDK requirement applies)
- Static frontend build served separately or via FastAPI static files
## Key Architectural Constraints
- **JVM is process-global:** `jpype.startJVM()` is called once at backend startup; the JAR path must be configured before the process starts; `jpype.shutdownJVM()` is effectively irreversible
- **Thread safety:** JPype calls block; in async FastAPI endpoints, wrap JPype invocations in `asyncio.run_in_executor` or use synchronous endpoint handlers
- **File format detection:** Binary CDX files begin with `VjCD` magic bytes; the backend must detect CDX vs. CDXML and route to `CDXReader` vs. `CDXMLReader` respectively
- **Upstream is read-only:** BChemXtract Java source is never forked or modified; all customization lives in `backend/` (Python) and `frontend/` (TypeScript)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Project Structure [PLANNED]
- `backend/app/main.py` — FastAPI app factory and lifespan (JVM startup)
- `backend/app/routers/` — HTTP endpoint modules (one file per resource group)
- `backend/app/services/` — JPype bridge logic; all Java interop lives here
- `backend/app/models/` — Pydantic request/response schemas
- `backend/jars/` — BChemXtract fat JAR (gitignored due to size)
- `backend/tests/` — pytest test suite
- `frontend/src/` — React + TypeScript source
- `frontend/src/components/` — UI components
- Standard Vite scaffold (`index.html`, `vite.config.ts`, etc.)
## Naming Patterns
- Modules: `snake_case.py` (e.g., `extract.py`, `jvm_bridge.py`)
- Router files: named by resource — `backend/app/routers/extract.py`
- Service files: named by responsibility — `backend/app/services/extractor.py`
- Model files: named by domain — `backend/app/models/chemistry.py`
- Functions and variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private helpers: prefix with `_` (e.g., `_detect_format`)
- Components: `PascalCase.tsx` (e.g., `FileUpload.tsx`, `StructureCard.tsx`)
- Utilities/hooks: `camelCase.ts` (e.g., `useExtract.ts`, `apiClient.ts`)
- Test files: co-located as `ComponentName.test.tsx`
- React components: `PascalCase`
- Functions, variables: `camelCase`
- Types and interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
## Code Style
- Tool: Ruff (confirmed by `.ruff_cache/` entry in `.gitignore`)
- Expected config: `backend/pyproject.toml` or `backend/ruff.toml`
- Line length: 88 (Black-compatible default for Ruff)
- Tool: Ruff (linting + formatting in one tool)
- Type checking: mypy or Pyright (`.mypy_cache/` present in `.gitignore` — mypy is expected)
- Tool: ESLint (referenced in CLAUDE.md: `npm run lint`)
- Expected config: `frontend/.eslintrc.*` or `frontend/eslint.config.*`
- Formatter: Prettier (typical Vite+React scaffold companion)
## Import Organization
## Error Handling
- Catch `jpype.JException` for Java-side exceptions and convert to HTTP errors
- Wrap all JPype service calls in try/except and raise `fastapi.HTTPException` with
- Log the original Java stack trace before re-raising
- Binary CDX files start with magic bytes `VjCD` (4 bytes)
- Detect format before routing to `CDXReader` vs `CDXMLReader`
- Return HTTP 415 (Unsupported Media Type) for unrecognized formats
- `jpype.startJVM()` is called once at app startup (FastAPI lifespan event)
- Never call `jpype.shutdownJVM()` during a request; it is effectively irreversible
- If JVM fails to start, the app must exit — do not swallow this error
- Display user-facing error messages for failed uploads and extraction errors
- Distinguish between network errors and API validation errors in UI feedback
## Async vs Sync Handlers
## Pydantic Models (Backend)
## FastAPI Router Pattern
## Environment Configuration [PLANNED]
- Configuration via `.env` files (gitignored)
- Key variables: `JAVA_HOME`, `JAR_PATH`, `CORS_ORIGINS`
- Loaded with `python-dotenv` or Pydantic `BaseSettings`
- Never hardcode paths to the BChemXtract JAR — always use env/config
## Comments
- Explain JPype interop patterns and Java class usage (non-obvious to Python developers)
- Document the CDX magic bytes detection logic
- Note the single-JVM constraint wherever JVM lifecycle is touched
- Public functions and classes in `app/services/` and `app/models/` get docstrings
- Use Google-style docstrings for Python
- TypeScript public component props get JSDoc comments
## API Response Format
- All responses are JSON
- Structure images returned as base64-encoded PNG strings within JSON, or via
- HTTP status codes follow REST conventions:
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- React SPA frontend communicates with FastAPI backend over HTTP/JSON
- FastAPI backend bridges into a Java library (BChemXtract) via JPype/JNI
- Java layer is read-only upstream code — all customization lives in Python/TypeScript layers
- Single long-lived JVM per backend process (JPype constraint)
- No database layer — stateless file-processing pipeline
```
```
## Layers
- Purpose: File upload UI, display of extracted chemical structures/reactions with metadata
- Location: `frontend/`
- Contains: React components (TypeScript), Vite config, test files
- Depends on: FastAPI backend via HTTP
- Used by: End users via browser
- Purpose: Receive CDX/CDXML uploads, orchestrate extraction, return structured JSON
- Location: `backend/app/`
- Contains: FastAPI app factory, routers, services, Pydantic models
- Depends on: JPype bridge to Java layer, `backend/jars/` for the fat JAR
- Used by: Frontend
- Purpose: Wrap Java class calls behind Python functions; manage JVM lifecycle
- Location: `backend/app/services/`
- Contains: JVM initialization logic, file format detection, calls to CDXReader/CDXMLReader, SubstanceXtractor, ReactionXtractor
- Depends on: `jpype1`, BChemXtract fat JAR at `backend/jars/`
- Used by: Routers in `backend/app/routers/`
- Purpose: Parse CDX/CDXML files and extract chemical entities with computed descriptors
- Source: `backend/lib/bchemxtract/` — git submodule pinned to upstream release tag (v1.0)
- Built artifact: `backend/jars/bchemxtract-*-jar-with-dependencies.jar` (gitignored; built from submodule via `backend/scripts/build_jar.sh`)
- Contains: BChemXtract classes + bundled CDK 2.12
- Depends on: Nothing in this repo
- Used by: JPype bridge service
- `backend/lib/bchemxtract/` is a git submodule of `https://github.com/Beilstein-Institut/BChemXtract`, pinned to a specific release tag (default: v1.0)
- `backend/scripts/build_jar.sh` initializes the submodule if needed, runs `mvn clean package -DskipTests`, and copies the fat JAR to `backend/jars/`
- Optional `--update` flag on the build script fetches the latest upstream tag before building
- Default behavior always builds from the pinned tag for reproducibility
- This must be the first task in any implementation phase — the JAR is a prerequisite for all JPype work
## Data Flow
- Stateless: no persistent storage. Each extraction request is independent.
- Frontend manages transient UI state (upload progress, results display) locally in React component state or a lightweight state solution.
## Key Abstractions
- Purpose: Route files to the correct Java reader based on magic bytes
- Files: `backend/app/services/` [PLANNED]
- Pattern: Read first 4 bytes; if `VjCD` use `CDXReader`, otherwise use `CDXMLReader`
- Purpose: Ensure `jpype.startJVM()` is called exactly once with the correct JAR path
- Files: `backend/app/services/` or `backend/app/main.py` startup event [PLANNED]
- Pattern: FastAPI lifespan event or module-level initialization guard
- Purpose: Typed Python representations of Java model objects (`BCXSubstance`, `BCXReaction`, etc.) for serialization to JSON
- Files: `backend/app/models/` [PLANNED]
- Pattern: Pydantic `BaseModel` subclasses mirroring Java model fields
- `BCXSubstance`: `inchi`, `inchiKey`, `smiles`, `extendedSmiles`, `molecularFormula`, `abbreviations`, `mdlv3000`
- `BCXReaction`: `rinchi`, `rinchiKey`, `reactionSmiles`, `reactants`, `products`, `agents`
- `BCXSubstanceInfo`: `noFragments`, `noInchis`, `noSubstances`
- All under package `org.beilstein.chemxtract.*`
## Entry Points
- Location: `backend/app/main.py`
- Triggers: `uvicorn app.main:app --reload --port 8000`
- Responsibilities: Create FastAPI app instance, register routers, configure CORS, initialize JVM via lifespan event
- Location: `frontend/` (Vite)
- Triggers: `npm run dev` (port 5173)
- Responsibilities: Serve React SPA, proxy API requests to backend during development
- Location: `frontend/dist/` (generated)
- Triggers: `npm run build`
- Responsibilities: Static assets served by a web server or CDN
## Error Handling
- Java parse failures (malformed CDX/CDXML) caught in service layer and raised as HTTP 422 Unprocessable Entity
- Missing JAR at startup treated as fatal — server should fail to start with a clear message
- CORS misconfiguration surfaced via environment variable validation at startup
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
