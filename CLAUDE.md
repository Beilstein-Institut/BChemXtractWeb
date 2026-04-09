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
