#!/usr/bin/env bash
# BChemXtractWeb — one-shot deploy.
#
# Usage:
#   ./deploy.sh                  # full deploy: secrets + JAR + docker compose up
#   ./deploy.sh --port N         # set public HTTP port (host) — default 3000
#   ./deploy.sh --change-port    # re-prompt for the public HTTP port
#   ./deploy.sh --base-path P    # serve the app below the origin root, e.g.
#                                # --base-path /bchemxtract when a reverse
#                                # proxy maps https://host/bchemxtract here.
#                                # Baked into the SPA at build time; use
#                                # --base-path / to reset to the root.
#   ./deploy.sh --public-url U   # non-interactive PRODUCTION posture: sets
#                                # DEBUG=false, CORS_ORIGINS to U's origin and
#                                # BASE_PATH to U's path. U must be https://.
#                                # e.g. --public-url https://host/bchemxtract
#   ./deploy.sh --localhost      # non-interactive LOCALHOST posture: sets
#                                # DEBUG=true + CORS_ORIGINS to the local port
#                                # (plain HTTP, /docs exposed, cookie not
#                                # Secure). The interactive default.
#   ./deploy.sh --pubchem on|off # enable/disable PubChem enrichment, then
#                                # recreate the backend (no image rebuild)
#   ./deploy.sh --audit-retention N
#                                # set AUDIT_LOG_RETENTION_DAYS (default 14).
#                                # Raising it above 14 contradicts § 3(3) of
#                                # /privacy — edit that page to match.
#   sudo ./deploy.sh --install-log-cron
#                                # install the root cron that prunes container
#                                # logs to 14 days (/privacy § 2(2))
#   ./deploy.sh --rotate-keys    # regenerate ADMIN_SECRET in existing .env
#                                # (POSTGRES_PASSWORD + SECRET_KEY untouched)
#   ./deploy.sh --rotate-app-db  # regenerate APP_DB_PASSWORD + ALTER ROLE
#                                # bchemxtract_app in the running DB
#   ./deploy.sh --rotate-postgres-password
#                                # regenerate POSTGRES_PASSWORD + ALTER ROLE
#                                # bchemxtract (bootstrap super) in the running
#                                # DB. Recovery path when .env drifted from
#                                # pgdata (migrate exits with "password
#                                # authentication failed for user bchemxtract").
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
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- args -------------------------------------------------------------------
ROTATE_KEYS=false
ROTATE_APP_DB=false
ROTATE_POSTGRES_PASSWORD=false
CHANGE_PORT=false
PORT_FLAG=""
BASE_PATH_FLAG=""
BASE_PATH_SET=false
PUBLIC_URL_FLAG=""
LOCALHOST_FLAG=false
PUBCHEM_TOGGLE=""
AUDIT_RETENTION=""
INSTALL_LOG_CRON=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-log-cron)         INSTALL_LOG_CRON=true; shift ;;
    --audit-retention)          [[ $# -ge 2 ]] || die "--audit-retention requires a value"; AUDIT_RETENTION="$2"; shift 2 ;;
    --audit-retention=*)        AUDIT_RETENTION="${1#*=}"; shift ;;
    --rotate-keys)              ROTATE_KEYS=true; shift ;;
    --rotate-app-db)            ROTATE_APP_DB=true; shift ;;
    --rotate-postgres-password) ROTATE_POSTGRES_PASSWORD=true; shift ;;
    --change-port)              CHANGE_PORT=true; shift ;;
    --port)                     [[ $# -ge 2 ]] || die "--port requires a value"; PORT_FLAG="$2"; shift 2 ;;
    --port=*)                   PORT_FLAG="${1#*=}"; shift ;;
    --base-path)                [[ $# -ge 2 ]] || die "--base-path requires a value"; BASE_PATH_FLAG="$2"; BASE_PATH_SET=true; shift 2 ;;
    --base-path=*)              BASE_PATH_FLAG="${1#*=}"; BASE_PATH_SET=true; shift ;;
    --public-url)               [[ $# -ge 2 ]] || die "--public-url requires a value"; PUBLIC_URL_FLAG="$2"; shift 2 ;;
    --public-url=*)             PUBLIC_URL_FLAG="${1#*=}"; shift ;;
    --localhost)                LOCALHOST_FLAG=true; shift ;;
    --pubchem)                  [[ $# -ge 2 ]] || die "--pubchem requires on|off"; PUBCHEM_TOGGLE="$2"; shift 2 ;;
    --pubchem=*)                PUBCHEM_TOGGLE="${1#*=}"; shift ;;
    -h|--help)                  usage ;;
    *)                          die "unknown flag: $1 (try --help)" ;;
  esac
done

if [[ "$ROTATE_KEYS" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-keys and --change-port are mutually exclusive"
fi
if [[ "$ROTATE_APP_DB" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-app-db and --change-port are mutually exclusive"
fi
if [[ "$ROTATE_POSTGRES_PASSWORD" == true && "$CHANGE_PORT" == true ]]; then
  die "--rotate-postgres-password and --change-port are mutually exclusive"
fi
n_rot=0
[[ "$ROTATE_KEYS"              == true ]] && n_rot=$((n_rot + 1))
[[ "$ROTATE_APP_DB"            == true ]] && n_rot=$((n_rot + 1))
[[ "$ROTATE_POSTGRES_PASSWORD" == true ]] && n_rot=$((n_rot + 1))
(( n_rot <= 1 )) || die "only one --rotate-* flag may be used at a time"
if [[ -n "$PORT_FLAG" && "$CHANGE_PORT" == true ]]; then
  die "--port and --change-port are mutually exclusive"
fi
if [[ "$BASE_PATH_SET" == true ]]; then
  # Normalise to either "" (origin root) or "/segment[/segment...]" — no
  # trailing slash. Vite and the nginx rewrite both want that exact shape.
  BASE_PATH_FLAG="/$(printf '%s' "$BASE_PATH_FLAG" | sed 's#^/*##; s#/*$##')"
  [[ "$BASE_PATH_FLAG" == "/" ]] && BASE_PATH_FLAG=""
  if [[ -n "$BASE_PATH_FLAG" && ! "$BASE_PATH_FLAG" =~ ^(/[A-Za-z0-9._~-]+)+$ ]]; then
    die "--base-path must look like /bchemxtract (got: $BASE_PATH_FLAG)"
  fi
  # A ".." segment is normalised away by the browser, so it would never appear
  # in a request path and the prefix could never match.
  if [[ "$BASE_PATH_FLAG" == */../* || "$BASE_PATH_FLAG" == */.. ]]; then
    die "--base-path may not contain a \"..\" segment (got: $BASE_PATH_FLAG)"
  fi
fi
if [[ -n "$PUBCHEM_TOGGLE" ]]; then
  case "$PUBCHEM_TOGGLE" in
    on|off) ;;
    *) die "--pubchem requires 'on' or 'off' (got: $PUBCHEM_TOGGLE)" ;;
  esac
  if [[ "$ROTATE_KEYS" == true || "$ROTATE_APP_DB" == true \
        || "$ROTATE_POSTGRES_PASSWORD" == true || "$CHANGE_PORT" == true \
        || -n "$PORT_FLAG" || -n "$AUDIT_RETENTION" || "$INSTALL_LOG_CRON" == true \
        || "$BASE_PATH_SET" == true ]]; then
    die "--pubchem cannot be combined with other action flags"
  fi
fi
if [[ -n "$AUDIT_RETENTION" ]]; then
  [[ "$AUDIT_RETENTION" =~ ^[1-9][0-9]*$ ]] \
    || die "--audit-retention requires a positive whole number of days (got: $AUDIT_RETENTION)"
  if [[ "$ROTATE_KEYS" == true || "$ROTATE_APP_DB" == true \
        || "$ROTATE_POSTGRES_PASSWORD" == true || "$CHANGE_PORT" == true \
        || -n "$PORT_FLAG" || "$INSTALL_LOG_CRON" == true \
        || "$BASE_PATH_SET" == true ]]; then
    die "--audit-retention cannot be combined with other action flags"
  fi
fi
if [[ "$INSTALL_LOG_CRON" == true ]]; then
  if [[ "$ROTATE_KEYS" == true || "$ROTATE_APP_DB" == true \
        || "$ROTATE_POSTGRES_PASSWORD" == true || "$CHANGE_PORT" == true \
        || -n "$PORT_FLAG" ]]; then
    die "--install-log-cron cannot be combined with other action flags"
  fi
fi

# --- container-log prune cron (quick standalone action) ---------------------
# Docker's json-file driver rotates by size only, so nothing enforces the
# "within 2 weeks" deletion that /privacy § 2(2) states for access-log data.
# This installs the root cron that does. Runs before preflight: it writes one
# file and needs no running stack.
if [[ "$INSTALL_LOG_CRON" == true ]]; then
  pruner="$SCRIPT_DIR/scripts/prune-container-logs.sh"
  [[ -x "$pruner" ]] || die "$pruner not found or not executable"
  [[ "$(id -u)" == "0" ]] || die "--install-log-cron writes /etc/cron.d — re-run with sudo"
  [[ -d /etc/cron.d ]] || die "/etc/cron.d not present — install the cron by hand (see $pruner --help)"
  cron_file=/etc/cron.d/bchemxtract-container-logs
  info "Writing $cron_file"
  cat >"$cron_file" <<EOF
# BChemXtractWeb — prune container logs to a 14-day window so that the
# deletion promised by /privacy § 2(2) actually happens. Managed by
# \`sudo ./deploy.sh --install-log-cron\`; safe to delete.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 4 * * * root $pruner
EOF
  chmod 0644 "$cron_file"
  ok "Installed: prunes container logs daily at 04:17 via $pruner"
  info 'Verifying the pruner against the running stack (dry run)'
  "$pruner" --dry-run || warn 'dry run failed — check the output above'
  exit 0
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
    # >&2 because this function's stdout is captured as the chosen port; without
    # it the warning text would be prepended to HTTP_PORT in .env.
    warn "invalid port: $port (must be 1-65535)" >&2
  done
}

# --- public-URL helpers -----------------------------------------------------
# A production posture is defined by ONE fact: the URL users type. Everything
# else (CORS_ORIGINS, DEBUG, BASE_PATH, the cookie's Secure flag) is derived
# from it, so the operator never has to keep three .env values consistent
# by hand.

validate_public_url() {
  # $1 = candidate URL. Emits the reason on stderr and returns 1 when unusable.
  local url="${1%/}"
  if [[ ! "$url" =~ ^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?(/[A-Za-z0-9._~-]+)*$ ]]; then
    warn "not a usable URL: $1"
    warn 'expected something like https://cheminfo.beilstein.org/bchemxtract'
    return 1
  fi
  if [[ "$url" == http://* ]]; then
    # Not pedantry: with DEBUG=false the backend sets the bcx_sid cookie
    # Secure, and a browser silently DISCARDS a Secure cookie over plain
    # HTTP — every request would arrive session-less. Either terminate TLS
    # or use the localhost posture.
    warn 'production requires https:// — over plain HTTP the browser drops the'
    warn 'Secure session cookie and nothing can hold a session.'
    return 1
  fi
  if [[ "$url" == *localhost* || "$url" == *127.0.0.1* ]]; then
    warn 'a localhost origin is the localhost posture — pick that instead.'
    return 1
  fi
  if [[ "$url" == */../* || "$url" == */.. ]]; then
    # Browsers normalise a ".." segment away before sending, so it can never
    # appear in a request path — a BASE_PATH built from one would match nothing.
    warn 'the path may not contain a ".." segment'
    return 1
  fi
  return 0
}

url_origin() {
  # scheme://host[:port] — the only shape CORS_ORIGINS accepts (never a path).
  local url="${1%/}" rest
  rest="${url#*://}"
  printf '%s://%s' "${url%%://*}" "${rest%%/*}"
}

url_path() {
  # "" or "/segment[/segment...]" — becomes BASE_PATH.
  local url="${1%/}" rest host
  rest="${url#*://}"
  host="${rest%%/*}"
  printf '%s' "${rest#"$host"}"
}

select_deployment_posture() {
  # Outputs the chosen public URL on stdout, "" for the localhost posture, or
  # "KEEP" when it must not touch .env. Prompt goes to stderr.
  # Args: $1 = current posture (localhost|production), $2 = suggested URL,
  #       $3 = host HTTP port.
  local current="$1" suggested="$2" port="$3" ans url

  # Non-TTY (CI, piped input) → never rewrite the operator's posture silently.
  if ! [[ -t 0 ]]; then
    printf 'KEEP'
    return 0
  fi

  local default_choice=1
  [[ "$current" == "production" ]] && default_choice=2

  {
    printf '\n%s==>%s Deployment posture\n\n' "$C_BLUE" "$C_RESET"
    printf '  1) localhost — plain HTTP on this machine only\n'
    printf '       DEBUG=true, CORS_ORIGINS=["http://localhost:%s"]\n' "$port"
    printf '       /docs + /openapi.json exposed, session cookie NOT Secure\n\n'
    printf '  2) production — reachable from a network, TLS terminated upstream\n'
    printf '       DEBUG=false, CORS_ORIGINS + BASE_PATH derived from your URL\n'
    printf '       /docs + /openapi.json disabled, session cookie Secure\n\n'
    printf '  Whichever you pick, deploy.sh writes .env for you.\n\n'
  } >&2

  printf '  Posture [%s]: ' "$default_choice" >&2
  if ! read -r ans; then
    printf 'KEEP'
    return 0
  fi
  [[ -z "$ans" ]] && ans="$default_choice"
  case "$ans" in
    1|localhost|local|dev) printf ''; return 0 ;;
    2|production|prod) ;;
    *) warn "unrecognised choice: $ans — keeping the current posture" >&2
       printf 'KEEP'; return 0 ;;
  esac

  {
    printf '\n  Public URL users will open, including any sub-path.\n'
    printf '  Example: https://cheminfo.beilstein.org/bchemxtract\n\n'
  } >&2
  while true; do
    if [[ -n "$suggested" ]]; then
      printf '  Public URL [%s]: ' "$suggested" >&2
    else
      printf '  Public URL: ' >&2
    fi
    if ! read -r url; then
      printf 'KEEP'
      return 0
    fi
    [[ -z "$url" ]] && url="$suggested"
    if [[ -z "$url" ]]; then
      warn 'a URL is required for the production posture' >&2
      continue
    fi
    # `warn` writes to stdout, and this function's stdout IS its return value —
    # so the validator's output must be redirected to stderr, not its stderr.
    if validate_public_url "$url" >&2; then
      printf '%s' "${url%/}"
      return 0
    fi
  done
}

select_pubchem_enabled() {
  # Outputs "true"/"false" on stdout; prompt + privacy note go to stderr.
  # Args: $1 = current value ("true"/"false") used as the default.
  local current="$1" ans hint
  if [[ "$current" == "true" ]]; then hint="Y/n"; else hint="y/N"; fi

  # Non-TTY (CI, piped input) → keep the current value, no prompt.
  if ! [[ -t 0 ]]; then
    printf '%s' "$current"
    return 0
  fi

  {
    printf '\n%s==>%s PubChem enrichment (optional)\n\n' "$C_BLUE" "$C_RESET"
    printf '  Resolve extracted structures against the public NIH PubChem\n'
    printf '  service (compound names, a known/scaffold badge, and a link),\n'
    printf '  joined on InChIKey. Each user still opts in individually in Settings.\n\n'
    printf '  %sPRIVACY%s: enabling sends the InChIKeys (and, for scaffold\n' "$C_YELLOW" "$C_RESET"
    printf '  matching, connectivity SMILES) of extracted structures to PubChem.\n'
    printf '  Leave OFF for unpublished or proprietary structures.\n\n'
  } >&2

  printf '  Enable PubChem enrichment? [%s]: ' "$hint" >&2
  if ! read -r ans; then
    printf '%s' "$current"
    return 0
  fi
  case "$ans" in
    [Yy]|[Yy][Ee][Ss]) printf 'true' ;;
    [Nn]|[Nn][Oo])     printf 'false' ;;
    *)                 printf '%s' "$current" ;;
  esac
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

# --- PubChem feature toggle (quick standalone action) -----------------------
# `./deploy.sh --pubchem on|off` flips PUBCHEM_ENABLED in .env and recreates
# the backend so it takes effect. Does NOT rebuild images or build the JAR —
# run a full `./deploy.sh` to ship code changes.
if [[ -n "$PUBCHEM_TOGGLE" ]]; then
  [[ -f .env ]] || die ".env not found — run ./deploy.sh first"
  if [[ "$PUBCHEM_TOGGLE" == on ]]; then pubchem_val=true; else pubchem_val=false; fi
  info "Setting PUBCHEM_ENABLED=$pubchem_val in .env"
  update_env_var PUBCHEM_ENABLED "$pubchem_val"
  if [[ "$pubchem_val" == true && -z "$(read_env_var PUBCHEM_CONTACT_EMAIL)" ]]; then
    warn 'PUBCHEM_CONTACT_EMAIL is unset — NCBI recommends a contact email when'
    warn 'enabling PubChem. Set PUBCHEM_CONTACT_EMAIL in .env and re-run if desired.'
  fi
  info 'Recreating backend to apply the new setting'
  docker compose up -d backend \
    || die 'docker compose up -d backend failed — is the stack deployed? (run ./deploy.sh)'
  [[ "$pubchem_val" == true ]] && ok 'PubChem enrichment enabled.' || ok 'PubChem enrichment disabled.'
  exit 0
fi

# --- audit_log retention (quick standalone action) --------------------------
# `./deploy.sh --audit-retention N` sets AUDIT_LOG_RETENTION_DAYS in .env and
# recreates the Celery pair that runs the daily prune. audit_log rows carry a
# raw client IP, so the window is a privacy statement, not just housekeeping.
if [[ -n "$AUDIT_RETENTION" ]]; then
  [[ -f .env ]] || die ".env not found — run ./deploy.sh first"
  info "Setting AUDIT_LOG_RETENTION_DAYS=$AUDIT_RETENTION in .env"
  update_env_var AUDIT_LOG_RETENTION_DAYS "$AUDIT_RETENTION"
  if (( AUDIT_RETENTION > 14 )); then
    warn "§ 3(3) of /privacy states audit entries are deleted after two weeks."
    warn "Keeping $AUDIT_RETENTION days means that sentence is now wrong — edit"
    warn 'frontend/src/pages/PrivacyPage.tsx and redeploy the frontend.'
  fi
  info 'Recreating celery-worker + celery-beat to apply the new window'
  docker compose up -d backend celery-worker celery-beat \
    || die 'docker compose up failed — is the stack deployed? (run ./deploy.sh)'
  ok "audit_log retention: $AUDIT_RETENTION days"
  exit 0
fi

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
  #       $2 = secret_key           (PBKDF2 salt + CSRF HMAC)
  #       $3 = admin_secret         (gate for /api/admin/api-keys)
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

rotate_postgres_password() {
  # args: $1 = new bootstrap superuser password.
  # `docker compose exec` runs psql inside the db container against the local
  # Unix socket, which uses `trust` auth for the postgres role per the alpine
  # image's default pg_hba.conf — so we do NOT need the current password to
  # perform the ALTER ROLE, which is what makes this a viable recovery path
  # after .env drifted from the persisted pgdata volume.
  #
  # The bootstrap superuser is only consumed by `migrate` (one-shot alembic);
  # nothing in the runtime path uses POSTGRES_PASSWORD directly. The
  # `compose up -d` later in this script recreates the migrate container with
  # the new env and re-runs `alembic upgrade head` (idempotent).
  local new_password="$1"
  local pg_user pg_db
  pg_user="$(read_env_var POSTGRES_USER)"
  pg_db="$(read_env_var POSTGRES_DB)"
  pg_user="${pg_user:-bchemxtract}"
  pg_db="${pg_db:-bchemxtract}"
  local pg_pwd_escaped
  pg_pwd_escaped="${new_password//\'/\'\'}"
  docker compose exec -T db psql -U "$pg_user" -d "$pg_db" \
    -c "ALTER ROLE \"${pg_user}\" WITH PASSWORD '${pg_pwd_escaped}';" >/dev/null \
    || die 'ALTER ROLE failed — is the db container running? (docker compose up -d db)'
  update_env_var POSTGRES_PASSWORD "$new_password"
}

preflight_db_password_drift() {
  # Catch the failure mode where POSTGRES_PASSWORD or APP_DB_PASSWORD in .env
  # diverges from the password actually stored in the pgdata volume. Postgres
  # only honors POSTGRES_PASSWORD on first init; subsequent boots ignore it,
  # so a rotated .env will silently desync until `migrate` crashes with
  # `password authentication failed for user "bchemxtract"`. This probe
  # exercises the same TCP/scram-sha-256 path migrate uses — connecting via
  # the `db` service name resolves to the bridge IP (172.x.0.y) which falls
  # through the `127.0.0.1 trust` and `local trust` rules in the alpine
  # image's default pg_hba.conf to the catch-all `host all all all
  # scram-sha-256`. Loopback or unix-socket probes would silently mask drift.
  #
  # No-op on a fresh deploy (no pgdata volume yet — nothing to drift from).
  docker volume inspect bchemxtractweb_pgdata >/dev/null 2>&1 || return 0

  info 'Verifying .env credentials match the pgdata volume'

  # db must be running to exec into it. If the operator ran `compose down`
  # but kept the volume, start db (and only db) so we can probe — this is
  # what `compose up` would do anyway a few lines later.
  if [[ -z "$(docker compose ps -q db 2>/dev/null)" ]]; then
    info '  db not running — starting it for the probe'
    docker compose up -d db >/dev/null
  fi
  local tries=0 health=""
  while (( tries < 30 )); do
    local cid; cid="$(docker compose ps -q db 2>/dev/null)"
    [[ -n "$cid" ]] && health="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo '')"
    [[ "$health" == "healthy" ]] && break
    sleep 1; tries=$((tries + 1))
  done
  [[ "$health" == "healthy" ]] || die 'db container did not become healthy within 30s — check `docker compose logs db`'

  local pg_user pg_pwd pg_db
  pg_user="$(read_env_var POSTGRES_USER)"; pg_user="${pg_user:-bchemxtract}"
  pg_pwd="$(read_env_var POSTGRES_PASSWORD)"
  pg_db="$(read_env_var POSTGRES_DB)";     pg_db="${pg_db:-bchemxtract}"
  [[ -n "$pg_pwd" ]] || die 'POSTGRES_PASSWORD missing from .env — required'

  if ! docker compose exec -T -e PGPASSWORD="$pg_pwd" db \
       psql -h db -U "$pg_user" -d "$pg_db" -c 'SELECT 1' >/dev/null 2>&1; then
    warn '.env POSTGRES_PASSWORD does not match the password stored in the pgdata volume.'
    warn 'Postgres only honors POSTGRES_PASSWORD on first init, so a hand-edited or'
    warn 'restored .env will silently desync from the persisted role.'
    warn ''
    warn 'Recovery options:'
    warn '  Keep data:        ./deploy.sh --rotate-postgres-password'
    warn '                    (mints a fresh secret, ALTERs the role, updates .env)'
    warn '  Disposable data:  docker compose down -v && ./deploy.sh'
    warn '                    (wipes pgdata; postgres re-inits with the .env value)'
    die 'aborting before compose up — bootstrap superuser credential drift detected'
  fi

  # Probe the runtime app role too — APP_DB_PASSWORD drift would let migrate
  # succeed but crash backend / celery on first connect. The role is created
  # by the 2026_05_16 migration, so it may not exist on a first-ever deploy
  # whose migrate hasn't run yet; in that case there's nothing to drift from.
  local role_exists
  role_exists="$(docker compose exec -T -e PGPASSWORD="$pg_pwd" db \
    psql -h db -U "$pg_user" -d "$pg_db" -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='bchemxtract_app';" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$role_exists" == "1" ]]; then
    local app_pwd
    app_pwd="$(read_env_var APP_DB_PASSWORD)"
    [[ -n "$app_pwd" ]] || die 'APP_DB_PASSWORD missing from .env — required'
    if ! docker compose exec -T -e PGPASSWORD="$app_pwd" db \
         psql -h db -U bchemxtract_app -d "$pg_db" -c 'SELECT 1' >/dev/null 2>&1; then
      warn '.env APP_DB_PASSWORD does not match the bchemxtract_app role in the pgdata volume.'
      warn 'migrate would succeed (uses POSTGRES_PASSWORD) but backend / celery-worker /'
      warn 'celery-beat would crash on first DB connect.'
      warn ''
      warn 'Recovery:  ./deploy.sh --rotate-app-db'
      die 'aborting before compose up — runtime app-role credential drift detected'
    fi
  fi

  ok '.env credentials verified against pgdata'
}

migrate_legacy_env() {
  # Legacy .env files carry API_KEYS + BROWSER_API_KEY (no longer used).
  # Strip those lines on upgrade so docker-compose doesn't surface them as
  # "extra inputs" warnings (Settings now rejects them). Idempotent: no-op
  # if the lines are already gone.
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
elif [[ "$ROTATE_POSTGRES_PASSWORD" == true ]]; then
  [[ -f .env ]] || die ".env does not exist — run without --rotate-postgres-password first"
  info 'Rotating POSTGRES_PASSWORD + ALTER ROLE bchemxtract (bootstrap superuser)'
  rotate_postgres_password "$(gen_secret)"
  ok 'bootstrap superuser password rotated — the compose up below will pick it up'
elif [[ -f .env ]]; then
  # Existing-.env path. Migrate the file in place: strip legacy
  # API_KEYS / BROWSER_API_KEY lines if present, and append APP_DB_PASSWORD
  # if it is missing (operators upgrading from an older deploy hit this
  # path; without the auto-mint they would get a docker-compose
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

# --- deployment posture (localhost vs production) ----------------------------
# DEBUG, CORS_ORIGINS and BASE_PATH have to agree or the stack either refuses
# to start (the backend's `_validate_prod_cors` guard) or breaks subtly (a
# Secure cookie over plain HTTP is discarded by the browser; a wrong CORS
# origin blocks the SPA). Rather than telling the operator to hand-edit three
# values, derive all of them from one answer: where will users open this?
#
# --public-url / --localhost make it non-interactive; a TTY prompts; a non-TTY
# run without either flag leaves the existing posture untouched.
POSTURE_URL="KEEP"
if [[ -n "$PUBLIC_URL_FLAG" ]]; then
  validate_public_url "$PUBLIC_URL_FLAG" || die "--public-url rejected: $PUBLIC_URL_FLAG"
  POSTURE_URL="${PUBLIC_URL_FLAG%/}"
elif [[ "$LOCALHOST_FLAG" == true ]]; then
  POSTURE_URL=""
elif [[ "$ROTATE_KEYS" == false && "$ROTATE_APP_DB" == false \
        && "$ROTATE_POSTGRES_PASSWORD" == false && "$CHANGE_PORT" == false ]]; then
  CURRENT_CORS="$(read_env_var CORS_ORIGINS)"
  if [[ "$(read_env_var DEBUG)" == "false" ]]; then
    CURRENT_POSTURE=production
  else
    CURRENT_POSTURE=localhost
  fi
  # Suggest the URL the current .env already describes, so a re-deploy is
  # Enter-Enter and changes nothing.
  SUGGESTED_URL=""
  # Positive character class on purpose: the surrounding quotes and brackets of
  # the JSON-ish CORS_ORIGINS value are simply not in it, so the match stops at
  # them without this pattern needing a quote character of its own.
  if [[ "$CURRENT_CORS" =~ (https?://[A-Za-z0-9._~:/-]+) ]]; then
    SUGGESTED_URL="${BASH_REMATCH[1]}$(read_env_var BASE_PATH)"
    [[ "$SUGGESTED_URL" == *localhost* || "$SUGGESTED_URL" == *127.0.0.1* ]] && SUGGESTED_URL=""
  fi
  POSTURE_URL="$(select_deployment_posture "$CURRENT_POSTURE" "$SUGGESTED_URL" "$HTTP_PORT_VALUE")"
fi

# A just-bootstrapped .env with no answer (non-TTY first run) IS the localhost
# posture — .env.example ships DEBUG=true. Take that branch so CORS_ORIGINS
# gets aligned to the chosen port instead of the template's hardcoded 3000.
if [[ "$POSTURE_URL" == "KEEP" && "$BOOTSTRAPPED_ENV" == true ]]; then
  POSTURE_URL=""
fi

if [[ "$POSTURE_URL" == "KEEP" ]]; then
  # Posture untouched — still refuse to bring up a combination the backend
  # will reject on import, so the failure surfaces here and not in a
  # crash-looping container.
  CORS_VAL="$(read_env_var CORS_ORIGINS)"
  if [[ "$(read_env_var DEBUG)" == "false" && "$CORS_VAL" == *localhost* ]]; then
    warn 'CORS / DEBUG mismatch in .env:'
    warn "  DEBUG=false  + CORS_ORIGINS=$CORS_VAL"
    warn 'The backend _validate_prod_cors guard will refuse to start. Fix with:'
    warn '  ./deploy.sh --localhost                       # plain-HTTP dev'
    warn '  ./deploy.sh --public-url https://your.origin  # real HTTPS deploy'
    die 'aborting before compose up'
  fi
elif [[ -z "$POSTURE_URL" ]]; then
  update_env_var DEBUG true
  update_env_var CORS_ORIGINS "[\"http://localhost:${HTTP_PORT_VALUE}\"]"
  ok "Posture: localhost (DEBUG=true, CORS_ORIGINS=[\"http://localhost:${HTTP_PORT_VALUE}\"])"
else
  # DEBUG=false additionally enforces >=32-char secrets. deploy.sh mints those
  # itself, but a hand-edited .env can be short — catch it before the backend
  # does, since there the symptom is a crash-looping container.
  for secret_key_name in SECRET_KEY ADMIN_SECRET; do
    secret_val="$(read_env_var "$secret_key_name")"
    if (( ${#secret_val} < 32 )); then
      warn "$secret_key_name is ${#secret_val} chars; DEBUG=false requires >= 32."
      warn 'Regenerate ADMIN_SECRET with: ./deploy.sh --rotate-keys'
      die "aborting: $secret_key_name too short for a production posture"
    fi
  done
  POSTURE_ORIGIN="$(url_origin "$POSTURE_URL")"
  POSTURE_PATH="$(url_path "$POSTURE_URL")"
  update_env_var DEBUG false
  update_env_var CORS_ORIGINS "[\"$POSTURE_ORIGIN\"]"
  # An explicit --base-path wins; the block further down writes it after this.
  [[ "$BASE_PATH_SET" == false ]] && update_env_var BASE_PATH "$POSTURE_PATH"
  ok "Posture: production ($POSTURE_URL)"
  ok "  DEBUG=false, CORS_ORIGINS=[\"$POSTURE_ORIGIN\"]"
  if [[ -n "$POSTURE_PATH" ]]; then
    ok "  BASE_PATH=$POSTURE_PATH"
    if ! grep -q "rewrite \^${POSTURE_PATH}\$" nginx/nginx.conf.template 2>/dev/null; then
      warn "nginx/nginx.conf.template does not strip $POSTURE_PATH — update its"
      warn 'two rewrite rules, or have the upstream proxy strip the prefix.'
    fi
  fi
  warn 'Reminder: TLS must be terminated upstream (nginx here serves plain HTTP).'
fi

# --- PubChem enrichment (interactive on normal deploys) ---------------------
# Prompts to enable/disable PubChem enrichment, defaulting to the current .env
# value so a re-deploy preserves the operator's choice unless they change it.
# Skipped for targeted rotate / change-port runs; the --pubchem quick action
# exits earlier and never reaches here. Non-TTY runs keep the current value.
if [[ "$ROTATE_KEYS" == false && "$ROTATE_APP_DB" == false \
      && "$ROTATE_POSTGRES_PASSWORD" == false && "$CHANGE_PORT" == false ]]; then
  current_pubchem="$(read_env_var PUBCHEM_ENABLED)"
  [[ "$current_pubchem" == "true" ]] || current_pubchem="false"
  PUBCHEM_VALUE="$(select_pubchem_enabled "$current_pubchem")"
  update_env_var PUBCHEM_ENABLED "$PUBCHEM_VALUE"
  ok "PUBCHEM_ENABLED=$PUBCHEM_VALUE"
fi

# --- deployment base path ---------------------------------------------------
# Only written when --base-path was passed, so a plain re-deploy preserves
# whatever the operator set previously (same treatment as HTTP_PORT). The
# frontend image bakes this into every asset / API / route URL at build time,
# so a change only takes effect via the `compose build` below.
if [[ "$BASE_PATH_SET" == true ]]; then
  update_env_var BASE_PATH "$BASE_PATH_FLAG"
  if [[ -n "$BASE_PATH_FLAG" ]]; then
    ok "BASE_PATH=$BASE_PATH_FLAG"
    warn "nginx/nginx.conf.template strips a hardcoded /bchemxtract prefix —"
    warn "update its two rewrite rules if BASE_PATH is anything else."
  else
    ok 'BASE_PATH= (served from the origin root)'
  fi
fi
BASE_PATH_VALUE="$(read_env_var BASE_PATH)"

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
# Fail fast on .env-vs-pgdata password drift before the full `compose up`
# would otherwise crash `migrate` with `password authentication failed`.
# No-op on a fresh deploy (no pgdata volume yet).
preflight_db_password_drift
info 'Starting containers'
docker compose up -d

echo
ok 'Stack is up'
# In a production posture the loopback URL is not what users open, so lead with
# the public one and label the local address as the origin behind the proxy.
if [[ "$(read_env_var DEBUG)" == "false" ]]; then
  PUBLIC_ORIGIN="$(read_env_var CORS_ORIGINS)"
  [[ "$PUBLIC_ORIGIN" =~ (https?://[A-Za-z0-9._~:/-]+) ]] && PUBLIC_ORIGIN="${BASH_REMATCH[1]}"
  cat <<EOF

  BChemXtract: $BCHEMXTRACT_VERSION
  Public URL:  $PUBLIC_ORIGIN$BASE_PATH_VALUE/
  Behind it:   http://localhost:$HTTP_PORT_VALUE$BASE_PATH_VALUE/  (proxy to this)
  Docs:        disabled (DEBUG=false)
EOF
else
  cat <<EOF

  BChemXtract: $BCHEMXTRACT_VERSION
  Frontend:    http://localhost:$HTTP_PORT_VALUE$BASE_PATH_VALUE/
  API:         http://localhost:$HTTP_PORT_VALUE$BASE_PATH_VALUE/api
  Docs:        http://localhost:$HTTP_PORT_VALUE/docs
EOF
fi
cat <<EOF

  Tail logs:   docker compose logs -f
  Stop stack:  docker compose down

  Direct API access (loopback only — bypasses nginx):
    http://127.0.0.1:$(read_env_var BACKEND_PORT)
    Browser SPA flows use the bcx_sid cookie; programmatic callers
    use an admin-minted X-API-Key (see POST /api/admin/api-keys).
EOF

# --- container-log retention reminder ---------------------------------------
# Without this cron the container logs (nginx/Uvicorn access lines, client IP
# included) are only size-capped, never time-expired — which contradicts the
# "within 2 weeks" deletion stated in § 2(2) of /privacy.
if [[ ! -f /etc/cron.d/bchemxtract-container-logs ]]; then
  echo
  warn 'Container logs are not being time-expired. /privacy § 2(2) promises'
  warn 'access-log deletion within 2 weeks; Docker only caps them by size.'
  warn 'Install the prune cron once per host:  sudo ./deploy.sh --install-log-cron'
fi

# --- DEBUG posture warning --------------------------------------------------
# In DEBUG mode the stack serves plain HTTP, so the bcx_sid session cookie is
# issued WITHOUT the Secure flag and /docs + /openapi.json are exposed. That is
# correct for localhost dev but unsafe if the port is reachable from an
# untrusted network. Warn loudly so an operator who port-forwards this does not
# silently ship a non-Secure session cookie.
if [[ "$(read_env_var DEBUG)" != "false" ]]; then
  echo
  warn '────────────────────────────────────────────────────────────────'
  warn 'DEBUG=true: plain HTTP — the bcx_sid session cookie is NOT Secure'
  warn 'and /docs + /openapi.json are exposed. Safe for localhost only.'
  warn 'Before exposing this to any network or the internet:'
  warn '  1. Terminate TLS in front of nginx (HTTPS).'
  warn '  2. Re-run with the public URL — it writes .env for you:'
  warn '       ./deploy.sh --public-url https://your.real.origin'
  warn '     (or answer "2" at the posture prompt on an interactive run)'
  warn '────────────────────────────────────────────────────────────────'
fi
