#!/usr/bin/env bash
# Pre-push AI review: runs a Claude code review and a Claude security review on
# the commits being pushed, in parallel. Blocks the push if either finds an
# Important / exploitable issue.
#
# Runs as a pre-commit hook at the pre-push stage (.pre-commit-config.yaml), so
# `pre-commit install` enables it next to the commit hooks. pre-commit passes the
# push range in PRE_COMMIT_FROM_REF / PRE_COMMIT_TO_REF (first pushed ref only).
# Skip one push:           SKIP_AI_REVIEW=1 git push   (or git push --no-verify)
set -u

[ "${SKIP_AI_REVIEW:-0}" = "1" ] && exit 0
skip() { echo "pre-push: $1, skipping AI review." >&2; exit 0; }

# Setup problems fail open (teammates without claude, an old CLI, no sign-in);
# any claude error once a review has started fails closed.
command -v claude >/dev/null 2>&1 || skip "'claude' CLI not found"
claude --help 2>/dev/null | grep -q -- '--restricted' ||
  skip "'claude' CLI too old (no --restricted), update it"
claude auth status >/dev/null 2>&1 || skip "'claude' is not signed in (claude auth status)"

TO=${PRE_COMMIT_TO_REF:-${PRE_COMMIT_LOCAL_BRANCH:-}}
FROM=${PRE_COMMIT_FROM_REF:-}
[ -n "$TO" ] || skip "no push range from pre-commit"
REF=${PRE_COMMIT_LOCAL_BRANCH:-$TO}
# Commits no remote branch has yet, and (when the remote branch exists) not
# already on it: skips merged-in upstream commits and the old tip after a rebase,
# and still bounds the range on `git push <url>` with no remote-tracking refs.
RANGE=("$TO" --not ${FROM:+"$FROM"} --remotes)

# Lockfiles and generated files (REVIEW.md skip list) stay out of the prompt.
PATHS=(. ':!*.lock' ':!*package-lock.json' ':!*CHANGELOG.md' ':!*.release-please-manifest.json'
  ':!graphify-out' ':!docs/superpowers' ':!.planning')
# ponytail: fixed caps; above them the push goes through unreviewed (review by hand).
MAX_COMMITS=50
MAX_BYTES=400000
BUDGET_USD=3 # per review

LIMIT=()
if command -v timeout >/dev/null 2>&1; then
  LIMIT=(timeout 900)
elif command -v gtimeout >/dev/null 2>&1; then # macOS with coreutils
  LIMIT=(gtimeout 900)
else
  echo "pre-push: no timeout/gtimeout found, a hung review will block the push (brew install coreutils)." >&2
fi

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

fail() { echo "pre-push: $1. Skip with SKIP_AI_REVIEW=1 git push." >&2; exit 1; }

n=$(git rev-list --count "${RANGE[@]}" -- "${PATHS[@]}") || fail "git rev-list failed"
[ "$n" -eq 0 ] && exit 0
[ "$n" -gt "$MAX_COMMITS" ] && skip "$n commits is over the $MAX_COMMITS-commit cap"

# --cc also prints merge commits: the hunks a merge changed versus every parent
# (conflict resolutions, edits made during the merge), not the merged-in work.
git log -p --cc --no-color --no-ext-diff --no-textconv "${RANGE[@]}" -- "${PATHS[@]}" \
  >"$OUT/patch" || fail "git log failed"
bytes=$(wc -c <"$OUT/patch" | tr -d ' ')
[ "$bytes" -gt "$MAX_BYTES" ] && skip "patch is $bytes bytes, over the $MAX_BYTES-byte cap"

# Diff text is untrusted (prompt injection). The hook runs git itself and pipes the
# patches in; --restricted ignores settings-file allow rules (e.g. Bash(git:*)),
# --strict-mcp-config drops MCP servers, --tools leaves only read-only file tools.
review() { # $1 = name, $2 = prompt
  ${LIMIT[@]+"${LIMIT[@]}"} claude -p "$2" --restricted --strict-mcp-config --tools "Read,Grep,Glob" \
    --max-budget-usd "$BUDGET_USD" <"$OUT/patch" >"$OUT/$1.txt" 2>"$OUT/$1.err"
}

# Pass only if no line says BLOCK and the last non-empty line is exactly
# VERDICT: PASS (tolerates **bold** or `code`), so a quoted "VERDICT: PASS" in
# the middle of the output cannot override a BLOCK.
passed() {
  grep -q 'VERDICT: BLOCK' "$1" && return 1
  [ "$(grep -v '^[[:space:]]*$' "$1" | tail -n 1 | tr -d '*`\r' |
    sed 's/^[[:space:]]*//; s/[[:space:]]*$//')" = "VERDICT: PASS" ]
}

echo "pre-push: AI review of $n new commit(s) on $REF, takes a few minutes..." >&2
what="the $n new commits on $REF of this repo, about to be pushed. Their patches (git log -p) are on stdin; read surrounding code when needed."

review code "Review $what
Read CLAUDE.md and REVIEW.md and follow REVIEW.md exactly.
Report only real bugs and REVIEW.md violations introduced by these commits.
End with exactly one line: VERDICT: BLOCK if there is any Important finding, else VERDICT: PASS." &
p1=$!
review security "Do a security review of $what Context: CLAUDE.md, REVIEW.md.
Report only high-confidence, exploitable issues introduced by these commits (injection, auth or RLS bypass,
data leak between sessions, unsafe SVG/XML/file handling, secrets, SSRF, path traversal). No theoretical issues.
Start with the count of findings, each with file:line and how it is exploited.
End with exactly one line: VERDICT: BLOCK if there is any finding, else VERDICT: PASS." &
p2=$!
wait $p1 $p2

status=0
for name in code security; do
  echo "===== $name review: $REF =====" >&2
  tr -d '\033' <"$OUT/$name.txt" >&2 # no terminal escape codes from model output
  if ! passed "$OUT/$name.txt"; then
    tr -d '\033' <"$OUT/$name.err" >&2
    status=1
  fi
done

[ "$status" -ne 0 ] && fail "AI review blocked the push (or did not finish)"
exit 0
