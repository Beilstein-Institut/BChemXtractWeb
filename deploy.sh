#!/usr/bin/env bash
# BChemXtractWeb — one-shot deploy.
#
# Usage:
#   ./deploy.sh                  # full deploy: secrets + JAR + docker compose up
#   ./deploy.sh --port N         # set public HTTP port (host) — default 3000
#   ./deploy.sh --change-port    # re-prompt for the public HTTP port
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
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- args -------------------------------------------------------------------
ROTATE_KEYS=false
CHANGE_PORT=false
PORT_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate-keys) ROTATE_KEYS=true; shift ;;
    --change-port) CHANGE_PORT=true; shift ;;
    --port)        [[ $# -ge 2 ]] || die "--port requires a value"; PORT_FLAG="$2"; shift 2 ;;
    --port=*)      PORT_FLAG="${1#*=}"; shift ;;
    -h|--help)     usage ;;
    *)             die "unknown flag: $1 (try --help)" ;;
  esac
done

if [[ "$ROTATE_KEYS" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-keys and --change-port are mutually exclusive"
fi
if [[ -n "$PORT_FLAG" && "$CHANGE_PORT" == true ]]; then
  die "--port and --change-port are mutually exclusive"
fi

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

# --- port handling ----------------------------------------------------------
DEFAULT_HTTP_PORT=3000
DEFAULT_BACKEND_PORT=8000

validate_port_range() {
  # Returns 0 if $1 is an integer in [1, 65535], else 1. No output.
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 ))
}

warn_port_quirks() {
  # Prints warnings for privileged ports and stack-internal collisions.
  # Always succeeds — these are advisories, not gates.
  local port="$1"
  if (( port < 1024 )); then
    warn "port $port is privileged; Docker may need root or CAP_NET_BIND_SERVICE"
  fi
  case "$port" in
    5432|6379|8000|5173)
      warn "port $port is used internally by another service in this stack"
      ;;
  esac
}

select_http_port() {
  # Outputs chosen port on stdout; prompt + warnings go to stderr.
  # Args: $1 = default port to suggest.
  local default="$1"
  local port

  # Non-TTY (CI, piped input) → silent default.
  if ! [[ -t 0 ]]; then
    printf '%s' "$default"
    return 0
  fi

  {
    printf '\n%s==>%s Selecting public HTTP port\n\n' "$C_BLUE" "$C_RESET"
    printf '  The container will publish nginx on the host. Default is %s.\n' "$default"
    printf '  Avoid 80 (Apache/nginx host conflict) and 443 (HTTPS, requires TLS).\n'
    printf '  Stack ports used internally:\n'
    printf '    5432 postgres, 6379 redis, 8000 backend, 5173 vite dev\n\n'
  } >&2

  while true; do
    printf '  Port [%s]: ' "$default" >&2
    if ! read -r port; then
      # EOF on stdin → use default.
      printf '%s' "$default"
      return 0
    fi
    [[ -z "$port" ]] && port="$default"
    if validate_port_range "$port"; then
      warn_port_quirks "$port" >&2
      printf '%s' "$port"
      return 0
    fi
    warn "invalid port: $port (must be 1-65535)"
  done
}

update_env_port() {
  # Idempotently set $1=$2 in .env. Adds the line if absent, replaces if present.
  KEY="$1" VAL="$2" "$PY" - <<'PYEOF'
import os, re, pathlib
p = pathlib.Path('.env')
text = p.read_text()
key = os.environ['KEY']
val = os.environ['VAL']
pattern = rf'^{re.escape(key)}=.*$'
if re.search(pattern, text, flags=re.M):
    text = re.sub(pattern, f'{key}={val}', text, flags=re.M)
else:
    if not text.endswith('\n'):
        text += '\n'
    text += f'{key}={val}\n'
p.write_text(text)
PYEOF
}

read_env_port() {
  # Output the value of $1 from .env, or empty string if absent / .env missing.
  KEY="$1" "$PY" - <<'PYEOF'
import os, re, pathlib
p = pathlib.Path('.env')
if not p.exists():
    print('')
    raise SystemExit
key = os.environ['KEY']
m = re.search(rf'^{re.escape(key)}=(.*)$', p.read_text(), flags=re.M)
print(m.group(1) if m else '')
PYEOF
}

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

BOOTSTRAPPED_ENV=false
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
  BOOTSTRAPPED_ENV=true
fi

# --- HTTP port selection -----------------------------------------------------
# Priority (highest wins):
#   1. --port flag             (CLI override, hard validation)
#   2. HTTP_PORT env var       (env override, hard validation)
#   3. --change-port           (re-prompt, defaulting to current .env value)
#   4. BOOTSTRAPPED_ENV=true   (first run → prompt; non-TTY → default)
#   5. existing HTTP_PORT in .env  (preserve)
#   6. legacy .env (no HTTP_PORT)  (silent migration to default + notice)
HTTP_PORT_VALUE=""
PORT_SOURCE=""

if [[ -n "$PORT_FLAG" ]]; then
  validate_port_range "$PORT_FLAG" || die "invalid --port value: $PORT_FLAG (must be 1-65535)"
  warn_port_quirks "$PORT_FLAG"
  HTTP_PORT_VALUE="$PORT_FLAG"
  PORT_SOURCE="--port flag"
elif [[ -n "${HTTP_PORT:-}" ]]; then
  validate_port_range "$HTTP_PORT" || die "invalid HTTP_PORT env value: $HTTP_PORT (must be 1-65535)"
  warn_port_quirks "$HTTP_PORT"
  HTTP_PORT_VALUE="$HTTP_PORT"
  PORT_SOURCE="HTTP_PORT env var"
elif [[ "$CHANGE_PORT" == true ]]; then
  current="$(read_env_port HTTP_PORT)"
  [[ -n "$current" ]] || current="$DEFAULT_HTTP_PORT"
  HTTP_PORT_VALUE="$(select_http_port "$current")"
  PORT_SOURCE="prompt (--change-port)"
elif [[ "$BOOTSTRAPPED_ENV" == true ]]; then
  # First-time deploy: .env was just created. Prompt for the public port.
  # select_http_port falls back to DEFAULT_HTTP_PORT silently when stdin is not a TTY.
  HTTP_PORT_VALUE="$(select_http_port "$DEFAULT_HTTP_PORT")"
  PORT_SOURCE="prompt (first-run)"
else
  existing="$(read_env_port HTTP_PORT)"
  if [[ -n "$existing" ]]; then
    validate_port_range "$existing" || die "invalid HTTP_PORT in .env: $existing (must be 1-65535)"
    HTTP_PORT_VALUE="$existing"
    PORT_SOURCE="existing .env"
  else
    # Legacy .env predating this feature → silent migration to default + notice.
    HTTP_PORT_VALUE="$DEFAULT_HTTP_PORT"
    PORT_SOURCE="migrated default"
    warn "Migrating .env to add HTTP_PORT ($HTTP_PORT_VALUE) and BACKEND_PORT ($DEFAULT_BACKEND_PORT)."
    warn "The stack will now serve at http://localhost:$HTTP_PORT_VALUE (was :80) and the"
    warn "backend will only be reachable at 127.0.0.1:$DEFAULT_BACKEND_PORT (was 0.0.0.0:8000)."
    warn "Use --change-port to pick a different public port, or set HTTP_PORT=N."
  fi
fi

update_env_port HTTP_PORT "$HTTP_PORT_VALUE"
if [[ -z "$(read_env_port BACKEND_PORT)" ]]; then
  update_env_port BACKEND_PORT "$DEFAULT_BACKEND_PORT"
fi
ok "HTTP_PORT=$HTTP_PORT_VALUE ($PORT_SOURCE), BACKEND_PORT=$(read_env_port BACKEND_PORT)"

# --- compose up -------------------------------------------------------------
# `build --pull` forces docker to refresh base images (python, maven, nginx,
# postgres, redis) from the registry on every deploy so we don't keep using a
# stale local layer. The BChemXtract JAR step inside backend/Dockerfile is
# also network-bound and will resolve upstream's latest release tag.
info 'Refreshing base images and rebuilding'
docker compose build --pull
info 'Starting containers'
docker compose up -d

echo
ok 'Stack is up'
cat <<EOF

  Frontend:  http://localhost:$HTTP_PORT_VALUE
  API:       http://localhost:$HTTP_PORT_VALUE/api
  Docs:      http://localhost:$HTTP_PORT_VALUE/docs

  Tail logs:   docker compose logs -f
  Stop stack:  docker compose down

  Direct API access (loopback only — bypasses nginx):
    http://127.0.0.1:$(read_env_port BACKEND_PORT)
    needs the bearer token from .env: grep '^API_KEYS=' .env
EOF
