#!/usr/bin/env bash
# BChemXtractWeb — one-shot deploy.
#
# Usage:
#   ./deploy.sh                  # full deploy: secrets + JAR + docker compose up
#   ./deploy.sh --port N         # set public HTTP port (host) — default 3000
#   ./deploy.sh --change-port    # re-prompt for the public HTTP port
#   ./deploy.sh --rotate-keys    # regenerate ADMIN_SECRET in existing .env
#                                # (POSTGRES_PASSWORD + SECRET_KEY untouched)
#   ./deploy.sh --rotate-app-db  # regenerate APP_DB_PASSWORD + ALTER ROLE
#                                # bchemxtract_app in the running DB
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
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- args -------------------------------------------------------------------
ROTATE_KEYS=false
ROTATE_APP_DB=false
CHANGE_PORT=false
PORT_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate-keys)   ROTATE_KEYS=true; shift ;;
    --rotate-app-db) ROTATE_APP_DB=true; shift ;;
    --change-port)   CHANGE_PORT=true; shift ;;
    --port)          [[ $# -ge 2 ]] || die "--port requires a value"; PORT_FLAG="$2"; shift 2 ;;
    --port=*)        PORT_FLAG="${1#*=}"; shift ;;
    -h|--help)       usage ;;
    *)               die "unknown flag: $1 (try --help)" ;;
  esac
done

if [[ "$ROTATE_KEYS" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-keys and --change-port are mutually exclusive"
fi
if [[ "$ROTATE_APP_DB" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-app-db and --change-port are mutually exclusive"
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

update_env_var() {
  # Idempotently set $1=$2 in .env. Adds the line if absent, replaces if present.
  # Generic .env upserter — used for HTTP_PORT, BACKEND_PORT, BCHEMXTRACT_VERSION.
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

read_env_var() {
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

# --- BChemXtract version resolution ----------------------------------------
# Mirrors backend/Dockerfile and backend/scripts/build_jar.sh exactly so the
# footer always shows what the backend image is actually built from.
# Priority:
#   1. BCHEMXTRACT_REF env var          (operator override, same name as Dockerfile ARG)
#   2. `git ls-remote` highest semver   (same query the Dockerfile uses)
resolve_bchemxtract_version() {
  local resolved=""
  if [[ -n "${BCHEMXTRACT_REF:-}" ]]; then
    resolved="$BCHEMXTRACT_REF"
  else
    resolved="$(git ls-remote --tags --refs --sort='-v:refname' \
        https://github.com/Beilstein-Institut/BChemXtract.git 'refs/tags/v*' 2>/dev/null \
      | head -n1 | sed 's|.*refs/tags/||')"
  fi
  [[ -n "$resolved" ]] || die "could not resolve BChemXtract version — network unreachable and BCHEMXTRACT_REF not set"
  printf '%s' "$resolved"
}

# --- BChemXtract JAR (host-side, optional) ---------------------------------
# The backend Docker image clones BChemXtract directly from GitHub at build
# time, so a host-side JAR is only needed for non-docker dev workflows
# (e.g. running uvicorn against a local Postgres). build_jar.sh clones the
# same upstream tag the Dockerfile would and produces the fat JAR locally.
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
# All single-key writes route through update_env_var (defined above). It is
# upsert-style: replaces the line if the key exists, appends it otherwise.
# Both call sites here (write_env on a fresh `cp .env.example .env`, and the
# rotate_* paths against an existing .env) already have the keys present,
# so the upsert is effectively a replace.

write_env() {
  # args: $1 = postgres password    (bootstrap superuser; DDL + role mgmt)
  #       $2 = secret_key           (PBKDF2 salt + CSRF HMAC; D-10/D-19)
  #       $3 = admin_secret         (gate for /api/admin/api-keys; D-11)
  #       $4 = app_db_password      (runtime bchemxtract_app role; RLS-enforcing)
  update_env_var POSTGRES_PASSWORD "$1"
  update_env_var SECRET_KEY         "$2"
  update_env_var ADMIN_SECRET       "$3"
  update_env_var APP_DB_PASSWORD    "$4"
}

rotate_env_keys() {
  # args: $1 = new admin secret.
  # Leaves POSTGRES_PASSWORD AND SECRET_KEY untouched — rotating SECRET_KEY
  # would invalidate every API key's stored lookup hash AND every outstanding
  # CSRF token, which requires a coordinated re-issue flow that is out of
  # scope for `deploy.sh`. To rotate SECRET_KEY: edit .env manually, then
  # mint new API keys via POST /api/admin/api-keys and restart the stack.
  update_env_var ADMIN_SECRET "$1"
}

rotate_app_db_password() {
  # args: $1 = new app db password.
  # Issues ALTER ROLE against the running db container (superuser-authed),
  # then updates .env. Operator must restart backend / celery services to
  # pick up the new DATABASE_URL — message is printed by the caller.
  local new_password="$1"
  local pg_user pg_db
  pg_user="$(read_env_var POSTGRES_USER)"
  pg_db="$(read_env_var POSTGRES_DB)"
  pg_user="${pg_user:-bchemxtract}"
  pg_db="${pg_db:-bchemxtract}"
  # Escape single quotes for the SQL literal (defensive — gen_secret never
  # produces them, but a hand-edited value could).
  local pg_pwd_escaped
  pg_pwd_escaped="${new_password//\'/\'\'}"
  docker compose exec -T db psql -U "$pg_user" -d "$pg_db" \
    -c "ALTER ROLE bchemxtract_app WITH PASSWORD '${pg_pwd_escaped}';" >/dev/null \
    || die 'ALTER ROLE failed — is the db container running? (docker compose up -d db)'
  update_env_var APP_DB_PASSWORD "$new_password"
}

migrate_legacy_env() {
  # Pre-Phase-11 .env files carry API_KEYS + BROWSER_API_KEY (gone after
  # 11-05 cutover). Strip those lines on upgrade so docker-compose doesn't
  # surface them as "extra inputs" warnings (Settings rejects them since
  # Plan 11-05). Idempotent: no-op if the lines are already gone.
  "$PY" - <<'PYEOF'
import re, pathlib
p = pathlib.Path('.env')
if not p.exists():
    raise SystemExit(0)
text = p.read_text()
orig = text
# Strip the env-var lines themselves AND the surrounding comment paragraphs
# that documented them. Match (and remove) any comment block immediately
# preceding the removed assignment.
text = re.sub(
    r'(?m)^# +-+ API_KEYS [^\n]*\n(?:#[^\n]*\n)*API_KEYS=[^\n]*\n',
    '', text,
)
text = re.sub(
    r'(?m)^# +-+ BROWSER_API_KEY [^\n]*\n(?:#[^\n]*\n)*BROWSER_API_KEY=[^\n]*\n',
    '', text,
)
# Fallback: strip bare lines if the comment headers weren't matched.
text = re.sub(r'(?m)^API_KEYS=.*$\n?',        '', text)
text = re.sub(r'(?m)^BROWSER_API_KEY=.*$\n?', '', text)
# Collapse runs of >=3 blank lines down to 2 for tidiness.
text = re.sub(r'\n{3,}', '\n\n', text)
if text != orig:
    p.write_text(text)
    print('migrated')
PYEOF
}

BOOTSTRAPPED_ENV=false
if [[ "$ROTATE_KEYS" == true ]]; then
  [[ -f .env ]] || die ".env does not exist — run without --rotate-keys first"
  info 'Rotating ADMIN_SECRET (POSTGRES_PASSWORD + SECRET_KEY + APP_DB_PASSWORD unchanged)'
  rotate_env_keys "$(gen_secret)"
  ok 'admin secret rotated — restart backend to apply: docker compose restart backend'
elif [[ "$ROTATE_APP_DB" == true ]]; then
  [[ -f .env ]] || die ".env does not exist — run without --rotate-app-db first"
  info 'Rotating APP_DB_PASSWORD + ALTER ROLE bchemxtract_app'
  rotate_app_db_password "$(gen_secret)"
  ok 'app db password rotated — restart runtime services to apply new DATABASE_URL:'
  ok '    docker compose restart backend celery-worker celery-beat'
elif [[ -f .env ]]; then
  # Existing-.env path. Migrate the file in place: strip pre-Phase-11
  # API_KEYS / BROWSER_API_KEY lines if present, and append APP_DB_PASSWORD
  # if it is missing (operators who deploy across the Phase 11 cutover hit
  # this path; without the auto-mint they would get a docker-compose
  # interpolation error).
  migrated="$(migrate_legacy_env || true)"
  [[ -n "$migrated" ]] && warn 'Stripped legacy API_KEYS / BROWSER_API_KEY entries from .env'
  if [[ -z "$(read_env_var APP_DB_PASSWORD)" ]]; then
    warn 'APP_DB_PASSWORD missing from .env — minting one for the bchemxtract_app role'
    update_env_var APP_DB_PASSWORD "$(gen_secret)"
    warn 'If the db container is already running with the OLD bootstrap user,'
    warn 'the next compose up will run the migration which CREATE / ALTER ROLEs'
    warn 'bchemxtract_app with this new password — and the runtime services will'
    warn 'connect with it. Existing migrate / compose state is unaffected.'
  else
    warn '.env already exists — leaving it unchanged (use --rotate-keys / --rotate-app-db to regenerate secrets)'
  fi
else
  info 'Generating .env with random secrets'
  cp .env.example .env
  # Four independent secrets — POSTGRES_PASSWORD (bootstrap super; migrations),
  # SECRET_KEY (PBKDF2/CSRF), ADMIN_SECRET (X-Admin-Secret), APP_DB_PASSWORD
  # (runtime bchemxtract_app role; RLS-enforcing).
  write_env "$(gen_secret)" "$(gen_secret)" "$(gen_secret)" "$(gen_secret)"
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
  current="$(read_env_var HTTP_PORT)"
  [[ -n "$current" ]] || current="$DEFAULT_HTTP_PORT"
  HTTP_PORT_VALUE="$(select_http_port "$current")"
  PORT_SOURCE="prompt (--change-port)"
elif [[ "$BOOTSTRAPPED_ENV" == true ]]; then
  # First-time deploy: .env was just created. Prompt for the public port.
  # select_http_port falls back to DEFAULT_HTTP_PORT silently when stdin is not a TTY.
  HTTP_PORT_VALUE="$(select_http_port "$DEFAULT_HTTP_PORT")"
  PORT_SOURCE="prompt (first-run)"
else
  existing="$(read_env_var HTTP_PORT)"
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

update_env_var HTTP_PORT "$HTTP_PORT_VALUE"
if [[ -z "$(read_env_var BACKEND_PORT)" ]]; then
  update_env_var BACKEND_PORT "$DEFAULT_BACKEND_PORT"
fi
ok "HTTP_PORT=$HTTP_PORT_VALUE ($PORT_SOURCE), BACKEND_PORT=$(read_env_var BACKEND_PORT)"

# --- BChemXtract version --------------------------------------------------
# Always re-resolved on each deploy (unlike HTTP_PORT, which is a user
# preference). Both the backend Dockerfile and the frontend Vite build
# read this via build-args from docker-compose.yml so the footer shows
# the same version the backend image was actually built with.
info 'Resolving BChemXtract version'
BCHEMXTRACT_VERSION="$(resolve_bchemxtract_version)"
update_env_var BCHEMXTRACT_VERSION "$BCHEMXTRACT_VERSION"
ok "BChemXtract version: $BCHEMXTRACT_VERSION"

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

  BChemXtract: $BCHEMXTRACT_VERSION
  Frontend:    http://localhost:$HTTP_PORT_VALUE
  API:         http://localhost:$HTTP_PORT_VALUE/api
  Docs:        http://localhost:$HTTP_PORT_VALUE/docs

  Tail logs:   docker compose logs -f
  Stop stack:  docker compose down

  Direct API access (loopback only — bypasses nginx):
    http://127.0.0.1:$(read_env_var BACKEND_PORT)
    Browser SPA flows use the bcx_sid cookie; programmatic callers
    use an admin-minted X-API-Key (see POST /api/admin/api-keys).
EOF
