#!/usr/bin/env bash
# Build the BChemXtract fat JAR from the git submodule.
#
# Usage:
#   bash scripts/build_jar.sh            # Build from pinned submodule tag
#   bash scripts/build_jar.sh --update   # Fetch latest upstream tag first
#
# Prerequisites: Java 17+ JDK, Maven 3.8+

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
SUBMODULE_DIR="$BACKEND_DIR/lib/bchemxtract"
JARS_DIR="$BACKEND_DIR/jars"

UPDATE=false
for arg in "$@"; do
    case "$arg" in
        --update)
            UPDATE=true
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: $0 [--update]"
            exit 1
            ;;
    esac
done

# Initialize submodule if not already present
if [ ! -f "$SUBMODULE_DIR/pom.xml" ]; then
    echo "Initializing BChemXtract git submodule..."
    cd "$REPO_ROOT"
    git submodule update --init --recursive backend/lib/bchemxtract
fi

# Optionally update to latest upstream tag
if [ "$UPDATE" = true ]; then
    echo "Fetching latest upstream tag..."
    cd "$SUBMODULE_DIR"
    git fetch --tags
    LATEST_TAG=$(git describe --tags --abbrev=0 "$(git rev-list --tags --max-count=1)")
    echo "Checking out tag: $LATEST_TAG"
    git checkout "$LATEST_TAG"
fi

# Build the fat JAR with Maven
echo "Building BChemXtract fat JAR..."
cd "$SUBMODULE_DIR"
mvn clean package -DskipTests -q

# Create jars directory if it doesn't exist
mkdir -p "$JARS_DIR"

# Copy the fat JAR to the jars directory
cp "$SUBMODULE_DIR"/target/*-jar-with-dependencies.jar "$JARS_DIR/"

JAR_FILE=$(ls "$JARS_DIR"/*-jar-with-dependencies.jar 2>/dev/null | head -1)
echo ""
echo "Build complete!"
echo "JAR copied to: $JAR_FILE"
