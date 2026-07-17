#!/usr/bin/env bash
# Build the first-party cdx-render jar (faithful ChemDraw -> SVG renderer) for
# host-side dev runs, and drop it next to the bchemxtract fat jar. Mirrors the
# Dockerfile's cdx-render build step. Prereqs: Java 21+ JDK, Maven 3.8+.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JARS_DIR="$BACKEND_DIR/jars"
MODULE_DIR="$BACKEND_DIR/cdx-render"

FAT_JAR="$(ls "$JARS_DIR"/bchemxtract-*-jar-with-dependencies.jar 2>/dev/null | head -1)"
[[ -n "$FAT_JAR" ]] || { echo "Build the bchemxtract fat jar first (scripts/build_jar.sh)"; exit 1; }

# Install the runtime fat jar as a stable compile-time coordinate.
mvn -q install:install-file -Dfile="$FAT_JAR" \
  -DgroupId=org.beilstein -DartifactId=bchemxtract -Dversion=runtime -Dpackaging=jar

echo "Building cdx-render..."
( cd "$MODULE_DIR" && mvn -q clean package )

# Copy the jar to the jars directory, replacing any previous build.
rm -f "$JARS_DIR"/cdx-render-*.jar
cp "$MODULE_DIR"/target/cdx-render-*.jar "$JARS_DIR/"
echo "Build complete: $(ls "$JARS_DIR"/cdx-render-*.jar)"
