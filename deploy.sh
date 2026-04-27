#!/usr/bin/env bash
# BChemXtractWeb — one-shot deploy.
#
# Usage:
#   ./deploy.sh                  # full deploy: secrets + JAR + docker compose up
#   ./deploy.sh --rotate-keys    # regenerate API_KEYS/BROWSER_API_KEY in existing .env
#   ./deploy.sh -h | --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- output helpers ---------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BLUE=$'\033[1;34m'; C_GREEN=$'\033[1;32m'
  C_YELLOW=$'\033[1;33m'; C_RED=$'\033[1;31m'
else
  C_RESET=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''
fi
info() { printf '%s==>%s %s\n' "$C_BLUE"   "$C_RESET" "$*"; }
ok()   { printf '%s ✓ %s %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%s ! %s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die()  { printf '%s ✗ %s %s\n' "$C_RED"    "$C_RESET" "$*" >&2; exit 1; }

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- args -------------------------------------------------------------------
ROTATE_KEYS=false
for arg in "$@"; do
  case "$arg" in
    --rotate-keys) ROTATE_KEYS=true ;;
    -h|--help)     usage ;;
    *)             die "unknown flag: $arg (try --help)" ;;
  esac
done

# --- preflight --------------------------------------------------------------
info 'Preflight checks'

[[ -f docker-compose.yml ]] || die "docker-compose.yml not found — run from repo root"
[[ -f .env.example       ]] || die ".env.example not found — wrong directory?"

if   command -v python3 >/dev/null; then PY=$(command -v python3)
elif command -v python  >/dev/null; then PY=$(command -v python)
else die "python not found — required for secret generation"; fi

command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 \
  || die "docker compose plugin not available — install Docker Compose v2"
command -v git >/dev/null || die "git not found"

ok "python: $PY"
ok "docker: $(docker --version | awk '{print $3}' | tr -d ',')"

# --- secret generator -------------------------------------------------------
gen_secret() { "$PY" -c 'import secrets; print(secrets.token_urlsafe(32))'; }

# --- submodule + JAR --------------------------------------------------------
info 'Initializing git submodules'
git submodule update --init --recursive
ok 'submodules ready'

if compgen -G "backend/jars/bchemxtract-*-jar-with-dependencies.jar" >/dev/null; then
  ok 'BChemXtract JAR already built — skipping (no JDK/Maven needed for this run)'
else
  # JDK 21+ and Maven are only required when the upstream JAR has to be built.
  command -v mvn >/dev/null || die "$(cat <<'MSG'
maven not found — needed to build the BChemXtract JAR. Install one of:
    Debian/Ubuntu:  sudo apt install -y maven default-jdk
    RHEL/Fedora:    sudo dnf install -y maven java-21-openjdk-devel
    macOS (brew):   brew install maven openjdk@21
MSG
)"
  command -v javac >/dev/null \
    || die "javac not found — Java 21+ JDK required (a JRE is not enough)"
  JAVA_MAJOR=$(java -version 2>&1 | awk -F'"' '/version/ {print $2}' | awk -F. '{print $1}')
  [[ "${JAVA_MAJOR:-0}" =~ ^[0-9]+$ && "${JAVA_MAJOR:-0}" -ge 21 ]] \
    || die "Java 21+ required (found: ${JAVA_MAJOR:-unknown}). The runtime container ships JDK 21; please match it on the host."
  ok "java: $JAVA_MAJOR · maven: $(mvn -v 2>/dev/null | awk '/Apache Maven/ {print $3; exit}')"
  info 'Building BChemXtract fat JAR (one-time, ~1–2 min)'
  ( cd backend && bash scripts/build_jar.sh )
  ok 'JAR built'
fi

# --- .env handling ----------------------------------------------------------
write_env() {
  # args: $1 = postgres password, $2 = api token (used for both API_KEYS[0] and BROWSER_API_KEY)
  POSTGRES_PASS="$1" API_KEY="$2" "$PY" - <<'PYEOF'
import os, re, pathlib
p = pathlib.Path('.env')
text = p.read_text()
text = re.sub(r'^POSTGRES_PASSWORD=.*$',
              f'POSTGRES_PASSWORD={os.environ["POSTGRES_PASS"]}', text, flags=re.M)
text = re.sub(r'^API_KEYS=.*$',
              f'API_KEYS=["{os.environ["API_KEY"]}"]',           text, flags=re.M)
text = re.sub(r'^BROWSER_API_KEY=.*$',
              f'BROWSER_API_KEY={os.environ["API_KEY"]}',        text, flags=re.M)
p.write_text(text)
PYEOF
}

rotate_env_keys() {
  # args: $1 = new api token. Leaves POSTGRES_PASSWORD untouched.
  API_KEY="$1" "$PY" - <<'PYEOF'
import os, re, pathlib
p = pathlib.Path('.env')
text = p.read_text()
text = re.sub(r'^API_KEYS=.*$',
              f'API_KEYS=["{os.environ["API_KEY"]}"]',     text, flags=re.M)
text = re.sub(r'^BROWSER_API_KEY=.*$',
              f'BROWSER_API_KEY={os.environ["API_KEY"]}',  text, flags=re.M)
p.write_text(text)
PYEOF
}

if [[ "$ROTATE_KEYS" == true ]]; then
  [[ -f .env ]] || die ".env does not exist — run without --rotate-keys first"
  info 'Rotating API_KEYS and BROWSER_API_KEY (POSTGRES_PASSWORD unchanged)'
  rotate_env_keys "$(gen_secret)"
  ok 'keys rotated — restart proxy + backend to apply: docker compose restart nginx backend'
elif [[ -f .env ]]; then
  warn '.env already exists — leaving it unchanged (use --rotate-keys to regenerate API keys)'
else
  info 'Generating .env with random secrets'
  cp .env.example .env
  write_env "$(gen_secret)" "$(gen_secret)"
  chmod 600 .env
  ok '.env created (chmod 600)'
fi

# --- compose up -------------------------------------------------------------
info 'Building images and starting containers'
docker compose up -d --build

echo
ok 'Stack is up'
cat <<EOF

  Frontend:  http://localhost
  API:       http://localhost/api
  Docs:      http://localhost/docs

  Tail logs:   docker compose logs -f
  Stop stack:  docker compose down

  Direct API access (bypassing the SPA) needs the bearer token from .env:
    grep '^BROWSER_API_KEY=' .env
EOF
