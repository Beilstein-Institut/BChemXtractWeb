#!/usr/bin/env python3
"""Interactive-prompt tests for deploy.sh.

The prompt helpers in deploy.sh return their answer on **stdout** (the caller
captures them with `$(...)`) while `warn`/`printf` progress text also goes to
stdout unless explicitly redirected. That makes one specific bug easy to write
and impossible to catch without a terminal: a warning emitted on the retry path
gets captured as the answer, so a rejected input silently lands in .env as
`HTTP_PORT=" ! invalid port..."` or a CORS origin made of warning prose.

`tests/test_deploy_port.sh` only drives the non-interactive flag paths (it pipes
/dev/null to stdin, which takes the `! [[ -t 0 ]]` early return). These tests
allocate a real pty so the interactive branches actually run, and assert the
captured return value contains *only* the answer.

Run: python3 tests/test_deploy_prompts.py
"""

from __future__ import annotations

import os
import pty
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEPLOY_SH = REPO_ROOT / "deploy.sh"

# Colour vars and `warn` are defined by deploy.sh's preamble, which we don't
# source (it would run the whole deploy). Recreate `warn` exactly as deploy.sh
# defines it — writing to stdout — because that is precisely what the
# redirection under test has to contain.
PREAMBLE = """
C_RESET=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''
info() { printf '==> %s\\n' "$*"; }
ok()   { printf ' ok %s\\n' "$*"; }
warn() { printf ' ! %s\\n' "$*"; }
die()  { printf ' x %s\\n' "$*" >&2; exit 1; }
validate_port_range() { [[ "$1" =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 )); }
warn_port_quirks() { :; }
"""


def extract(*func_names: str) -> str:
    """Pull named shell function definitions out of deploy.sh."""
    text = DEPLOY_SH.read_text()
    out = []
    for name in func_names:
        m = re.search(
            rf"^{re.escape(name)}\(\) \{{\n(.*?)^\}}\n",
            text,
            flags=re.S | re.M,
        )
        assert m, f"{name}() not found in deploy.sh — did it get renamed?"
        out.append(m.group(0))
    return "".join(out)


def run_prompt(script_body: str, answers: list[str], env: dict[str, str]) -> str:
    """Run script_body under a pty, feeding answers at each prompt.

    Returns everything the pty saw (prompts, warnings, and the RESULT line the
    harness prints).
    """
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as fh:
        fh.write(script_body)
        path = fh.name
    try:
        pid, fd = pty.fork()
        if pid == 0:  # child
            os.environ.update(env)
            os.execvp("bash", ["bash", path])
        seen = bytearray()
        pending = list(answers)
        try:
            while True:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                seen.extend(chunk)
                text = seen.decode(errors="replace")
                if pending and text.rstrip().endswith(":"):
                    os.write(fd, (pending.pop(0) + "\n").encode())
        except OSError:
            pass  # pty closes with EIO when the child exits
        os.waitpid(pid, 0)
        # A pty echoes CRLF line endings; normalise so line-anchored regexes
        # aren't defeated by a trailing \r.
        return seen.decode(errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    finally:
        os.unlink(path)


def result_of(output: str) -> str:
    # re.S deliberately: a leaked multi-line warning must be *reported* as the
    # captured value (a clean FAIL showing the prose), not crash the regex.
    m = re.search(r"RESULT=\[(.*)\]", output, flags=re.S)
    assert m, f"harness printed no RESULT line; got:\n{output}"
    return m.group(1)


POSTURE_HARNESS = (
    PREAMBLE
    + extract("validate_public_url", "url_origin", "url_path", "select_deployment_posture")
    + '\nr="$(select_deployment_posture "$P_CUR" "$P_SUGGEST" 3000)"\n'
    + 'printf "\\nRESULT=[%s]\\n" "$r"\n'
)

PORT_HARNESS = (
    PREAMBLE
    + extract("select_http_port")
    + '\nr="$(select_http_port 3000)"\n'
    + 'printf "\\nRESULT=[%s]\\n" "$r"\n'
)

FAILURES: list[str] = []


def check(name: str, got: object, want: object) -> None:
    if got == want:
        print(f"  PASS {name}")
    else:
        print(f"  FAIL {name}\n        want: {want!r}\n        got:  {got!r}")
        FAILURES.append(name)


def main() -> int:
    print("Running deploy.sh interactive-prompt tests...")
    localhost = {"P_CUR": "localhost", "P_SUGGEST": ""}

    check(
        "posture 1 selects localhost (empty answer)",
        result_of(run_prompt(POSTURE_HARNESS, ["1"], localhost)),
        "",
    )
    check(
        "posture 2 then a URL returns the URL",
        result_of(
            run_prompt(
                POSTURE_HARNESS,
                ["2", "https://cheminfo.beilstein.org/bchemxtract"],
                localhost,
            )
        ),
        "https://cheminfo.beilstein.org/bchemxtract",
    )
    check(
        "trailing slash stripped from the URL",
        result_of(run_prompt(POSTURE_HARNESS, ["2", "https://host/app/"], localhost)),
        "https://host/app",
    )

    # The regression this file exists for: a rejected URL re-prompts, and the
    # warning must NOT end up in the captured answer.
    rejected = run_prompt(
        POSTURE_HARNESS,
        ["2", "http://insecure.host", "https://good.host/app"],
        localhost,
    )
    check("rejected URL re-prompts and returns only the good URL",
          result_of(rejected), "https://good.host/app")
    check("the rejection reason was still shown to the operator",
          "requires https://" in rejected, True)

    check(
        "an existing production posture is the default (Enter, Enter)",
        result_of(
            run_prompt(
                POSTURE_HARNESS,
                ["", ""],
                {
                    "P_CUR": "production",
                    "P_SUGGEST": "https://cheminfo.beilstein.org/bchemxtract",
                },
            )
        ),
        "https://cheminfo.beilstein.org/bchemxtract",
    )
    check(
        "an unrecognised choice keeps the current posture",
        result_of(run_prompt(POSTURE_HARNESS, ["banana"], localhost)),
        "KEEP",
    )

    # Same stdout-hygiene contract on the pre-existing port prompt.
    port_out = run_prompt(PORT_HARNESS, ["99999", "9001"], {})
    check("rejected port re-prompts and returns only the good port",
          result_of(port_out), "9001")
    check("Enter takes the suggested port",
          result_of(run_prompt(PORT_HARNESS, [""], {})), "3000")

    print()
    print(f"{len(FAILURES)} failed" if FAILURES else "all passed")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    if not DEPLOY_SH.exists():
        sys.exit(f"deploy.sh not found at {DEPLOY_SH}")
    subprocess.run(["bash", "-n", str(DEPLOY_SH)], check=True)
    sys.exit(main())
