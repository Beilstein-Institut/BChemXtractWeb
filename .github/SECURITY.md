# Security Policy

BChemXtractWeb is maintained by the Beilstein-Institut zur Förderung der
Chemischen Wissenschaften. We take reports about this project seriously and we
would rather hear about a problem too early than too late.

## Supported versions

| Version | Supported |
| :--- | :--- |
| Latest tagged release (`v1.x`) | ✅ Security fixes |
| `main` branch | ✅ Security fixes |
| Older tagged releases | ❌ Please upgrade |

We ship fixes forward on `main` and cut a new patch release; we do not
backport to superseded tags.

## Reporting a vulnerability

**Please do not open a public GitHub issue, discussion, or pull request for a
security problem.** A public report tells everyone about the weakness before a
fix exists, including operators running the app on their own infrastructure.

Instead, email **open-source@beilstein-institut.de** with `SECURITY` and
`BChemXtractWeb` in the subject line. If you would like to reach the
maintainer directly as well, add krajan@beilstein-institut.de.

A useful report contains:

- what the problem is, and what an attacker gains from it;
- the affected version or commit, plus the deployment mode (Docker Compose via
  `deploy.sh`, or a hand-rolled backend/frontend setup);
- steps to reproduce — a request, a sample CDX/CDXML file, or a short script is
  ideal;
- any log output or stack trace you captured.

Please do not include real credentials or production data in the report. If a
sample file is confidential, say so and we will arrange another channel.

## What happens next

| Step | Target |
| :--- | :--- |
| We acknowledge your email | within 5 working days |
| We confirm or dispute the finding | within 10 working days |
| We ship a fix for a confirmed high-severity issue | within 30 days of confirmation |

If a fix needs longer than that — for example because it depends on an upstream
release — we will tell you and keep you updated. We ask that you keep the
finding private until a fix is released, and we will credit you in the release
notes unless you prefer to stay anonymous. We do not operate a bug bounty and
cannot offer payment.

## Scope

**In scope** — anything in this repository:

- the FastAPI backend (`backend/`), including the JPype bridge to the Java
  layer, file upload and format handling, and the export pipeline;
- the first-party renderer module (`backend/cdx-render/`);
- the React frontend (`frontend/`);
- the session-cookie / PostgreSQL row-level-security / admin API key
  authorisation model;
- the deployment tooling (`deploy.sh`, `docker-compose.yml`,
  `backend/Dockerfile`) — in particular anything that leaks a secret or weakens
  the production posture by default.

**Out of scope:**

- Vulnerabilities in the upstream BChemXtract Java library itself. Those belong
  at https://github.com/Beilstein-Institut/BChemXtract — though if you are not
  sure which side a bug is on, send it to us and we will route it.
- Vulnerabilities in third-party dependencies with no BChemXtractWeb-specific
  impact. Report those upstream; tell us if this project needs a version bump.
- Findings that require an operator to have deliberately disabled a guard —
  for example running with `DEBUG=true` in production, publishing the admin
  `ADMIN_SECRET`, or exposing PostgreSQL directly to the internet.
- Denial of service through sheer request or file volume against a self-hosted
  instance. Rate limits and resource caps exist, but the operator owns capacity
  planning and the reverse proxy in front of the app.
- Reports generated purely by an automated scanner with no demonstrated impact.

## Notes for operators

If you run your own instance, two things matter most:

- **Keep `SECRET_KEY` and `ADMIN_SECRET` secret and out of version control.**
  `SECRET_KEY` is the PBKDF2 salt for API-key lookup hashes and the HMAC key
  for CSRF tokens. See the "Rotating secrets" section of the README before you
  change it.
- **Keep the deployment behind TLS.** The app serves plain HTTP; terminate TLS
  in a reverse proxy in front of it.
