#!/usr/bin/env bash
# Prune this stack's container logs to a 14-day window.
#
# WHY: /privacy § 2(2) states that access-log data is deleted "within 2
# weeks". nginx and Uvicorn write their access lines (client IP, path, user
# agent) to stdout, which Docker's json-file driver stores on the host. That
# driver rotates by SIZE only (docker-compose.yml x-logging: 3 x 10 MB) and
# has no time-based retention at all, so on a low-traffic deployment a line
# can sit there for months. This script is what makes the sentence true.
#
# Install as a root cron job (needs root: the json logs are 0600 root-owned):
#
#   sudo ./deploy.sh --install-log-cron       # writes /etc/cron.d/...
#
# or by hand in /etc/cron.d/bchemxtract-container-logs:
#
#   17 4 * * * root /path/to/repo/scripts/prune-container-logs.sh
#
# Usage:
#   ./prune-container-logs.sh              # prune
#   ./prune-container-logs.sh --dry-run    # report what it would do
#   ./prune-container-logs.sh --self-check # verify the age logic, touch nothing
#
# RETENTION_DAYS env var overrides the 14-day window. Do not raise it above
# 14 without editing § 2(2) of frontend/src/pages/PrivacyPage.tsx.

set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-14}"
DRY_RUN=false
SELF_CHECK=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --self-check) SELF_CHECK=true ;;
    -h|--help)    sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            printf 'unknown flag: %s (try --help)\n' "$arg" >&2; exit 1 ;;
  esac
done

if command -v python3 >/dev/null; then PY=python3
elif command -v python >/dev/null; then PY=python
else printf 'python not found — needed for the cutoff date\n' >&2; exit 1; fi

# Cutoff as a plain YYYY-MM-DD. Day granularity is enough for a 14-day
# window, and comparing ISO dates as strings is exact — no date maths, and
# no GNU-vs-BSD `date -d` portability trap.
CUTOFF="$("$PY" -c 'import sys,datetime as d; print(d.date.today() - d.timedelta(days=int(sys.argv[1])))' "$RETENTION_DAYS")"

log_line_date() {
  # $1 = file, $2 = head|tail. Prints the YYYY-MM-DD of that line's Docker
  # timestamp, or nothing if there is none.
  #
  # Grepping for the unescaped `"time":"` key is safe against a log message
  # that happens to contain the same text: message bodies are JSON-escaped,
  # so an embedded one reads \"time\":\" and cannot match. `tail -n 1` picks
  # the real trailing field if a line somehow carries more than one.
  local line
  line="$("$2" -n 1 -- "$1" 2>/dev/null)" || return 0
  printf '%s' "$line" \
    | grep -o '"time":"[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' \
    | tail -n 1 | cut -c9- || true
}

act() {
  # $1 = verb (rm|truncate), $2 = path
  if [[ "$DRY_RUN" == true ]]; then
    printf 'would %s: %s\n' "$1" "$2"
    return 0
  fi
  case "$1" in
    rm)       rm -f -- "$2" ;;
    truncate) truncate -s 0 -- "$2" ;;
  esac
  printf '%s: %s\n' "$1" "$2"
}

prune_log_set() {
  # $1 = the active json log path. Handles it and its rotated siblings
  # ($1.1, $1.2, ...).
  local active="$1" rot d

  # Rotated files are closed, so they go once their NEWEST line has aged
  # out. An unparseable one is a rotated log we cannot date — drop it.
  for rot in "$active".*; do
    [[ -f "$rot" ]] || continue
    d="$(log_line_date "$rot" tail)"
    if [[ -z "$d" || "$d" < "$CUTOFF" ]]; then
      act rm "$rot"
    fi
  done

  # ponytail: the live file is truncated wholesale once its OLDEST line ages
  # out, so retention sawtooths between 0 and 14 days rather than sliding.
  # That is the price of not fighting a file Docker holds open — rewriting it
  # in place would interleave with Docker's appends. If per-day granularity
  # of recent history ever matters, ship logs off-host (journald/Loki) and
  # let that side own retention.
  [[ -f "$active" ]] || return 0
  d="$(log_line_date "$active" head)"
  if [[ -n "$d" && "$d" < "$CUTOFF" ]]; then
    act truncate "$active"
  fi
}

self_check() {
  # Exercises the date extraction and both prune decisions on fake logs, so
  # a broken predicate fails here instead of silently over- or under-deleting
  # real logs. Needs no docker and no root.
  local stale fresh
  # Not `local` — the EXIT trap runs after this function returns.
  tmp="$(mktemp -d)"
  trap 'rm -rf -- "$tmp"' EXIT
  stale="$("$PY" -c 'import datetime as d; print(d.date.today() - d.timedelta(days=90))')"
  fresh="$("$PY" -c 'import datetime as d; print(d.date.today())')"

  local f="$tmp/abc-json.log"
  printf '{"log":"hit\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$stale" >"$f"
  printf '{"log":"hit\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$fresh" >>"$f"
  [[ "$(log_line_date "$f" head)" == "$stale" ]] || { printf 'FAIL: head date\n' >&2; exit 1; }
  [[ "$(log_line_date "$f" tail)" == "$fresh" ]] || { printf 'FAIL: tail date\n' >&2; exit 1; }

  # A message containing an escaped "time" key must not be mistaken for one.
  local g="$tmp/def-json.log"
  printf '{"log":"{\\"time\\":\\"1999-01-01T00:00:00Z\\"}\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$fresh" >"$g"
  [[ "$(log_line_date "$g" head)" == "$fresh" ]] || { printf 'FAIL: escaped key confused the parser\n' >&2; exit 1; }

  # Rotated stale sibling goes; rotated fresh one stays; live file with a
  # stale oldest line is truncated.
  printf '{"log":"old\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$stale" >"$f.1"
  printf '{"log":"new\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$fresh" >"$f.2"
  DRY_RUN=false prune_log_set "$f" >/dev/null
  [[ ! -f "$f.1" ]] || { printf 'FAIL: stale rotated file survived\n' >&2; exit 1; }
  [[ -f "$f.2" ]]   || { printf 'FAIL: fresh rotated file was deleted\n' >&2; exit 1; }
  [[ ! -s "$f" ]]   || { printf 'FAIL: live file with a stale oldest line was not truncated\n' >&2; exit 1; }

  # A live file that is entirely fresh must be left alone.
  local h="$tmp/ghi-json.log"
  printf '{"log":"new\\n","stream":"stdout","time":"%sT01:02:03.000000000Z"}\n' "$fresh" >"$h"
  DRY_RUN=false prune_log_set "$h" >/dev/null
  [[ -s "$h" ]] || { printf 'FAIL: fresh live file was truncated\n' >&2; exit 1; }

  printf 'self-check OK (cutoff %s)\n' "$CUTOFF"
}

if [[ "$SELF_CHECK" == true ]]; then
  self_check
  exit 0
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v docker >/dev/null || { printf 'docker not found\n' >&2; exit 1; }

containers="$(docker compose ps -aq 2>/dev/null || true)"
if [[ -z "$containers" ]]; then
  printf 'no containers for this compose project — nothing to prune\n'
  exit 0
fi

for cid in $containers; do
  logpath="$(docker inspect --format '{{.LogPath}}' "$cid" 2>/dev/null || true)"
  # Empty for non-json-file drivers; unreadable if we are not root.
  [[ -n "$logpath" && -f "$logpath" ]] || continue
  if [[ ! -w "$logpath" ]]; then
    printf 'cannot write %s — run as root\n' "$logpath" >&2
    exit 1
  fi
  prune_log_set "$logpath"
done
