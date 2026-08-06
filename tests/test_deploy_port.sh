#!/usr/bin/env bash
# Tests for deploy.sh port-handling logic.
#
# Each test runs deploy.sh in a tmpdir with mocked docker/git on PATH so
# the script gets through preflight and writes .env without actually
# bringing up the stack. We assert on .env contents and exit codes only.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

setup_tmpdir() {
  TMPDIR="$(mktemp -d)"
  cp "$REPO_ROOT/deploy.sh"          "$TMPDIR/"
  cp "$REPO_ROOT/.env.example"       "$TMPDIR/"
  cp "$REPO_ROOT/docker-compose.yml" "$TMPDIR/"
  mkdir -p "$TMPDIR/backend/jars" "$TMPDIR/backend/scripts"
  # Pre-create the JAR so the build step is skipped (no Maven needed).
  touch "$TMPDIR/backend/jars/bchemxtract-1.0-jar-with-dependencies.jar"

  # Stub docker (needs to satisfy `docker --version`, `docker compose version`,
  # `docker compose build/up`).
  mkdir -p "$TMPDIR/bin"
  cat > "$TMPDIR/bin/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  --version) echo "Docker version 25.0.0, build stub" ; exit 0 ;;
  compose)
    case "${2:-}" in
      version) echo "Docker Compose version v2.20.0" ; exit 0 ;;
      build|up|down|logs|ps|config|restart) exit 0 ;;
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$TMPDIR/bin/docker"

  # Stub git's `submodule` subcommand — leave everything else passthrough.
  cat > "$TMPDIR/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  submodule) exit 0 ;;
  *) exec /usr/bin/git "$@" ;;
esac
STUB
  chmod +x "$TMPDIR/bin/git"

  export PATH="$TMPDIR/bin:$PATH"

  # Short-circuit BChemXtract version resolution so tests don't depend on
  # network access to github.com. resolve_bchemxtract_version honors this
  # env var with highest priority and skips the git ls-remote query.
  export BCHEMXTRACT_REF="v0.0.0-test"
}

teardown_tmpdir() {
  [[ -n "${TMPDIR:-}" ]] && rm -rf "$TMPDIR"
}

assert_env_has() {
  local key="$1" expected="$2"
  local actual
  actual="$(grep -E "^$key=" "$TMPDIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: expected %s=%s, got %s=%s\n' "$key" "$expected" "$key" "$actual" >&2
    return 1
  fi
}

run_test() {
  local name="$1"
  shift
  setup_tmpdir
  if ( cd "$TMPDIR" && "$@" ); then
    printf '  PASS %s\n' "$name"
    PASS=$((PASS + 1))
  else
    printf '  FAIL %s\n' "$name"
    FAIL=$((FAIL + 1))
  fi
  teardown_tmpdir
}

# --- test cases --------------------------------------------------------------

test_default_via_env_var() {
  HTTP_PORT=9000 ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 9000
  assert_env_has BACKEND_PORT 8000
}

test_port_flag_overrides_env_var() {
  HTTP_PORT=9000 ./deploy.sh --port 7777 </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 7777
}

test_invalid_port_flag_rejected() {
  if ./deploy.sh --port 99999 </dev/null >/dev/null 2>&1; then
    echo "FAIL: --port 99999 should have errored" >&2
    return 1
  fi
}

test_non_numeric_port_flag_rejected() {
  if ./deploy.sh --port abc </dev/null >/dev/null 2>&1; then
    echo "FAIL: --port abc should have errored" >&2
    return 1
  fi
}

test_idempotent_rerun_preserves_port() {
  HTTP_PORT=8765 ./deploy.sh </dev/null >/dev/null 2>&1
  ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 8765
}

test_port_flag_overwrites_existing() {
  HTTP_PORT=8765 ./deploy.sh </dev/null >/dev/null 2>&1
  ./deploy.sh --port 6543 </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 6543
}

test_migration_appends_http_port() {
  # Simulate an old-style .env without HTTP_PORT/BACKEND_PORT.
  cp .env.example .env
  # Strip the new HTTP_PORT/BACKEND_PORT lines we just added to .env.example
  # so this test exercises the legacy path.
  /usr/bin/sed -i.bak '/^HTTP_PORT=/d; /^BACKEND_PORT=/d' .env && rm -f .env.bak
  ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 3000
  assert_env_has BACKEND_PORT 8000
}

test_non_tty_uses_default() {
  ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has HTTP_PORT 3000
  assert_env_has BACKEND_PORT 8000
}

test_mutually_exclusive_flags_rejected() {
  if ./deploy.sh --port 4000 --change-port </dev/null >/dev/null 2>&1; then
    echo "FAIL: --port + --change-port should be mutually exclusive" >&2
    return 1
  fi
}

test_bchemxtract_version_written_to_env() {
  # resolve_bchemxtract_version honors BCHEMXTRACT_REF (set in setup_tmpdir).
  # The resolved value must land in .env so docker compose can pass it as a
  # build-arg to both backend and frontend Dockerfiles.
  ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has BCHEMXTRACT_VERSION "v0.0.0-test"
}

test_bchemxtract_version_re_resolved_on_rerun() {
  # Unlike HTTP_PORT (a user preference, preserved across runs),
  # BCHEMXTRACT_VERSION is a build artifact — every run re-resolves it so
  # the footer always matches what the backend image was built from.
  ./deploy.sh </dev/null >/dev/null 2>&1
  BCHEMXTRACT_REF="v9.9.9-second" ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has BCHEMXTRACT_VERSION "v9.9.9-second"
}

test_base_path_flag_written_to_env() {
  ./deploy.sh --base-path /bchemxtract </dev/null >/dev/null 2>&1
  assert_env_has BASE_PATH /bchemxtract
}

test_base_path_normalised() {
  # Accept the sloppy forms an operator is likely to type; both Vite and the
  # nginx rewrite need exactly "/segment" with no trailing slash.
  ./deploy.sh --base-path bchemxtract/ </dev/null >/dev/null 2>&1
  assert_env_has BASE_PATH /bchemxtract
}

test_base_path_slash_resets_to_root() {
  ./deploy.sh --base-path /bchemxtract </dev/null >/dev/null 2>&1
  ./deploy.sh --base-path / </dev/null >/dev/null 2>&1
  # The line must be present and empty — not merely absent, which would also
  # read as "" but would leave a stale value in a hand-edited .env.
  if ! grep -qE '^BASE_PATH=$' .env; then
    echo "FAIL: --base-path / should leave BASE_PATH= (empty) in .env" >&2
    return 1
  fi
}

test_base_path_rerun_preserves_value() {
  # A user preference like HTTP_PORT: a plain re-deploy must not clear it.
  ./deploy.sh --base-path /bchemxtract </dev/null >/dev/null 2>&1
  ./deploy.sh </dev/null >/dev/null 2>&1
  assert_env_has BASE_PATH /bchemxtract
}

test_invalid_base_path_rejected() {
  if ./deploy.sh --base-path 'has space' </dev/null >/dev/null 2>&1; then
    echo "FAIL: --base-path 'has space' should have errored" >&2
    return 1
  fi
}

# --- runner ------------------------------------------------------------------

main() {
  echo "Running deploy.sh port-handling tests..."
  run_test "default port via HTTP_PORT env var"      test_default_via_env_var
  run_test "--port flag overrides HTTP_PORT env"     test_port_flag_overrides_env_var
  run_test "--port 99999 rejected (out of range)"    test_invalid_port_flag_rejected
  run_test "--port abc rejected (non-numeric)"       test_non_numeric_port_flag_rejected
  run_test "rerun preserves existing port"           test_idempotent_rerun_preserves_port
  run_test "--port overwrites existing .env value"   test_port_flag_overwrites_existing
  run_test "migration adds HTTP_PORT to old .env"    test_migration_appends_http_port
  run_test "non-tty stdin uses default 3000"         test_non_tty_uses_default
  run_test "--port + --change-port rejected"         test_mutually_exclusive_flags_rejected
  run_test "BChemXtract version written to .env"     test_bchemxtract_version_written_to_env
  run_test "BChemXtract version re-resolved on rerun" test_bchemxtract_version_re_resolved_on_rerun
  run_test "--base-path written to .env"             test_base_path_flag_written_to_env
  run_test "--base-path normalised to /segment"      test_base_path_normalised
  run_test "--base-path / resets to origin root"     test_base_path_slash_resets_to_root
  run_test "rerun preserves existing base path"      test_base_path_rerun_preserves_value
  run_test "--base-path with a space rejected"       test_invalid_base_path_rejected
  echo
  printf '%d passed, %d failed\n' "$PASS" "$FAIL"
  [[ "$FAIL" -eq 0 ]]
}

main "$@"
