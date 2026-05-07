#!/usr/bin/env bash
# Build the BChemXtract fat JAR for host-side dev runs (e.g. uvicorn outside
# Docker). Mirrors backend/Dockerfile's resolution exactly, so the JAR built
# here matches what the docker image installs.
#
# Resolution priority (highest wins):
#   1. BCHEMXTRACT_REF env var          (operator override, same as Dockerfile ARG)
#   2. git ls-remote highest semver tag (same query the Dockerfile uses)
#
# Usage:
#   bash scripts/build_jar.sh                         # latest upstream tag
#   BCHEMXTRACT_REF=v1.1.0 bash scripts/build_jar.sh  # pin a specific tag
#
# Prerequisites: Java 21+ JDK, Maven 3.8+, network access to github.com.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JARS_DIR="$BACKEND_DIR/jars"
WORK_DIR="$BACKEND_DIR/.bchemxtract-build"

UPSTREAM="https://github.com/Beilstein-Institut/BChemXtract.git"

# Resolve the tag to build.
if [[ -n "${BCHEMXTRACT_REF:-}" ]]; then
    REF="$BCHEMXTRACT_REF"
    echo "Using BCHEMXTRACT_REF=$REF (operator override)"
else
    REF="$(git ls-remote --tags --refs --sort='-v:refname' "$UPSTREAM" 'refs/tags/v*' \
        | head -n1 | sed 's|.*refs/tags/||')"
    [[ -n "$REF" ]] || { echo "Could not resolve a BChemXtract release tag from $UPSTREAM" >&2; exit 1; }
    echo "Resolved latest upstream tag: $REF"
fi

# Shallow-clone the tag into a gitignored work dir. Re-clone on every run so a
# stale checkout never silently produces a stale JAR.
rm -rf "$WORK_DIR"
git clone --branch "$REF" --depth 1 "$UPSTREAM" "$WORK_DIR"

# Build the fat JAR. `-Dmaven.javadoc.skip=true` matters from v1.1 onwards —
# upstream attaches Javadoc by default and the bundled plugin treats
# missing-comment warnings as fatal under JDK 21. We only need the fat JAR,
# so skip Javadoc entirely.
echo "Building BChemXtract fat JAR ($REF)..."
( cd "$WORK_DIR" && mvn clean package -DskipTests -Dmaven.javadoc.skip=true -q )

# Copy the fat JAR to the jars directory, replacing any previous build.
mkdir -p "$JARS_DIR"
rm -f "$JARS_DIR"/bchemxtract-*-jar-with-dependencies.jar
cp "$WORK_DIR"/target/*-jar-with-dependencies.jar "$JARS_DIR/"

JAR_FILE=$(ls "$JARS_DIR"/bchemxtract-*-jar-with-dependencies.jar | head -1)

# Clean up the work dir so it doesn't sit around between runs.
rm -rf "$WORK_DIR"

echo
echo "Build complete!"
echo "JAR: $JAR_FILE"
