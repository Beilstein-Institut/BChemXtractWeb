# Production Troubleshooting Runbook

Failure modes seen in production, how to diagnose them, and the fixes. Each
entry is written so you can tell **which** problem you have from the symptom
before changing anything — several of these look identical from the browser
("upload fails" / "structure won't render") but have completely different
causes and fixes.

Deployment context this runbook assumes: Docker Compose stack (nginx →
frontend/backend → Postgres/Redis + a Celery worker running the JVM), on a
**shared 8 GB host** that also runs an unrelated `deepl` stack. Single-file
uploads go through `POST /api/extract/jobs` (returns `202` immediately) and are
processed asynchronously by the Celery worker; the browser then polls
`GET /api/extract/jobs/{id}`.

Golden rule learned the hard way: **isolate the layer before you fix it.** The
same symptom can originate in the browser, a network device, nginx, the
backend, the worker JVM, or the database. Test each boundary in isolation
(server-side curl vs. browser, SSH tunnel vs. direct, fresh JVM vs. long-lived)
before touching code.

---

## 1. Upload fails / "Extraction server unreachable" or `ERR_TIMED_OUT` — but only for larger files

**Symptom.** Small files upload fine; larger ones (≳20 KB of request body) hang
~18 s then fail. Browser shows `net::ERR_TIMED_OUT` or "Extraction server
unreachable". nginx logs `408` for `POST /api/extract/jobs` and the backend
**never logs the request at all**.

**This is almost always the network path, not the app.** The tell: the request
body never fully arrives at nginx.

### Diagnose (isolate the boundary)

```bash
# A. Server-side upload through the full nginx→backend path (bypasses the
#    client network entirely). Run ON THE SERVER:
head -c 103000 /dev/urandom > /tmp/big.bin
curl -sw '%{http_code} %{time_total}s\n' -o /dev/null -m75 -X POST \
  -F "file=@/tmp/big.bin" http://127.0.0.1:3000/api/extract/jobs
#   Fast 4xx (e.g. 415)  -> app + nginx handle large bodies fine; problem is the
#                           network between client and server. Continue to B.
#   Hang / 408           -> problem is server-side (rare). See §2.

# B. Same large upload from the CLIENT machine over SSH (port 22, encrypted):
scp /tmp/big.bin user@SERVER:/tmp/     # completes fast -> the wire is fine
#   If scp is fast but the HTTP upload from the same machine stalls, a device on
#   the client→server path is mangling plaintext HTTP upload bodies.

# C. Confirm it's the plaintext-HTTP path by tunnelling HTTP over SSH:
#    (client) ssh -N -L 3001:127.0.0.1:3000 user@SERVER
#    (client) curl -sw '%{http_code} %{time_total}s\n' -o /dev/null -m75 -X POST \
#               -F "file=@somefile.cdx" http://127.0.0.1:3001/api/extract/jobs
#   Fast 202 over the tunnel  -> CONFIRMED: a network middlebox stalls direct
#                                plaintext uploads; encryption bypasses it.
```

If you have `tcpdump` (or run it in a throwaway container:
`docker run --rm --net=host nicolaka/netshoot tcpdump -ni <iface> 'host CLIENT_IP and port 3000'`),
a stalled upload shows the client's data packets **stop arriving after the first
burst** while the server's receive window stays open — proof the loss is
upstream of the server's NIC.

### Root cause (confirmed 2026-07-01)

A **VPN / network middlebox** on the client→server path. On the reporting
developer's VPN, the first ~19 KB of a plaintext HTTP upload got through and the
rest was dropped; disconnecting the VPN fixed it instantly. SSH (port 22),
`scp`, SSH-tunnelled HTTP, and all server-side uploads worked throughout — only
direct plaintext HTTP to `:3000` across the VPN stalled.

**Not** MTU (ping with DF at 1500 succeeded both ways), **not** the app
(server-side 103 KB upload returned in ~0.02 s), **not** memory, **not** Docker.

### Fix

- **Immediate:** disconnect the VPN, or get onto the server's own LAN.
- **Durable:** serve the app over **HTTPS**. An encrypted body can't be
  inspected or stalled by a transparent HTTP middlebox (the SSH-tunnel test
  proves the path itself is fine once encrypted). This is also the correct
  production posture — the stack currently runs plain HTTP with `DEBUG=true`.
- **Alternative:** have whoever operates the client→server gateway exempt this
  host from HTTP upload/body inspection.

> Note: production currently runs `DEBUG=true` with
> `CORS_ORIGINS=["http://localhost:3000"]` (dev posture). Moving to HTTPS also
> means flipping `DEBUG=false` and setting the real origin — see `.env.example`.

---

## 2. Host is swapping / everything slow / `ERR_TIMED_OUT` under load

**Symptom.** Intermittent timeouts, the backend becomes unresponsive under load,
extractions that normally take ~13 s balloon. Not tied to any one file.

### Diagnose

```bash
free -h                 # RAM nearly full + swap in use at baseline == over-committed
swapon --show
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
# Which container is the hog? Is a co-tenant (e.g. deepl-app) eating GBs?
for c in $(docker compose ps -q); do
  docker inspect -f '{{.Name}} restarts={{.RestartCount}} OOMKilled={{.State.OOMKilled}}' "$c"
done
```

`restarts=0` + `OOMKilled=false` while the box is swapping = **swap-thrash**, not
an OOM-kill. The kernel pages processes (including the latency-critical backend)
in and out, so the backend can't answer connections in time.

### Root cause

The 8 GB host was over-committed: the worker JVM at `-Xmx2g` sat at ~2.5 GB RSS,
the co-tenant `deepl` stack took ~2.5 GB, and **no container had a memory cap**,
so a heavy extraction tipped the whole host into swap. `-XX:+ExitOnOutOfMemoryError`
does **not** help here — it only catches *Java heap* OOM, and CDK's Java2D
rendering also leaks **native/off-heap** memory that `-Xmx` doesn't bound.

### Fix (shipped, commit `db46960`)

`docker-compose.yml` now gives the two JVM services a hard `mem_limit` **with
swap disabled** (`memswap_limit == mem_limit`) plus modest heaps:

| service | `-Xmx` | `mem_limit` (= `memswap_limit`) |
|---|---|---|
| celery-worker | `1g` (`WORKER_JVM_MAX_HEAP`) | `1750m` (`WORKER_MEM_LIMIT`) |
| backend | `640m` (`BACKEND_JVM_MAX_HEAP`) | `1250m` (`BACKEND_MEM_LIMIT`) |

With swap disabled per container, the latency-critical backend can never be
paged out mid-request, and the leaking worker is cleanly cgroup-OOM-killed and
recycled by `restart: unless-stopped` instead of dragging the host into swap.
The `mem_limit` is also the only real bound on CDK's native leak.

**Tuning on a bigger box:** raise the heap and the `mem_limit` *together*
(`mem_limit` must stay above heap + ~0.5 GB native headroom). Requires cgroup v2
swap control (default on modern Ubuntu); without it Docker warns and applies
`mem_limit` only.

**Residual risk:** if the co-tenant `deepl` stack grows toward its own 6 GB
limit, the box can swap again regardless of our tuning — that's a co-tenancy
decision (cap deepl, add RAM, or add swap headroom).

---

## 3. A large/complex molecule shows a blank card ("no depiction") while small ones render

This one bit us twice with two *different* root causes. Symptom is identical:
one big structure (e.g. the 162-heavy-atom cage `C132H174B6N6O12Si6`) shows the
empty-flask placeholder; the other structures in the same file render fine.
Works on a fresh localhost DB. Check **3a first** (it also caused "upload takes
forever"), then **3b**.

### 3a. Leaked `xtractUnique` InChI daemon exhausts the JVM heap

**Symptom.** Upload "takes forever"; after repeated uploads the *largest*
molecule renders blank while small ones still render. Worker log shows
`xtractUnique timed out after 10s` on every upload of the file.

**Mechanism.** `SubstanceXtractor.xtractUnique` computes InChI for the whole
document internally and **hangs uninterruptibly** on molecules over the InChI
size cap (`_MAX_INCHI_HEAVY_ATOMS = 100`). It runs on a daemon with a 10 s
timeout, but JPype can't interrupt a native call — so the abandoned daemon keeps
running the InChI computation for *minutes*, holding heap. Repeated uploads
stack these daemons until the heap is exhausted; the largest molecule's render
(most transient memory) is the first to OOM and drop to an empty SVG, while
small molecules still fit. In prod, `-XX:+ExitOnOutOfMemoryError` then exits the
JVM mid-request → the worker recycles → "takes forever".

Reproduced deterministically: at `-Xmx1g`, uploads 1–4 climb heap 385→898 MB
(daemon threads 2→5), upload 5 OOMs and the cage goes blank. Appeared "when we
added real InChI" because InChI generation is what spawns the runaway daemon —
not a coincidence.

**Diagnose.**
```bash
docker compose logs --tail=200 celery-worker | grep -iE "xtractUnique timed out|OutOfMemory|Recovered InChI"
```
Repeated `xtractUnique timed out after 10s` + `OutOfMemory` during render = this.

**Fix (shipped, commit `16488f0`).** `_extract_with_fallback_sync` now **skips
the `xtractUnique` attempt when any fragment exceeds the InChI cap**
(`_has_inchi_oversized_molecule`: >100 heavy atoms, or >1500 SMILES chars when
the formula is missing). Such files always fell through to the fragment path
anyway, so output is unchanged — but the 10 s hang and the leaked daemon are
gone. Files with no oversized molecule are unaffected (`xtractUnique` still
runs, full metadata). Result: reported file went 13 s+ → ~3 s, flat heap and all
structures render across repeated uploads.

### 3b. Stale blank-SVG row cached in the database

**Symptom.** Extraction is now fast and rendering *succeeds*, but the big
molecule **still** shows blank — and it works on a fresh localhost DB. Re-uploading
doesn't help.

**Mechanism.** Substances dedup by `inchi_key` (a SHA-256 **surrogate** key when
InChI is absent) with `INSERT … ON CONFLICT (inchi_key) DO NOTHING`. If a
molecule was ever persisted with a blank SVG (e.g. during the 3a OOM period),
the row is kept and **every later re-upload renders a good SVG but discards it on
conflict**. The row serves a blank image forever. The view-time self-heal can't
rescue it because it renders from `mdlv3000`, which extraction always stores
empty.

**Diagnose.** Check the stored SVG length for the molecule (use your
`POSTGRES_USER`/`POSTGRES_DB`):
```bash
docker compose exec -T db psql -U bchemxtract -d bchemxtract -c \
"select left(molecular_formula,28) formula, length(svg) svg_len, length(svg_cdx) cdx_len, left(inchi_key,14) key
 from substances order by svg_len limit 5;"
```
A row with `svg_len = 0` (often an `S…`-prefixed surrogate key) that renders fine
elsewhere = this. Confirm large molecules *can* render by checking that other
big formulas have large `svg_len` values in the same table.

**Fix (shipped, commit `5ea291a`).** `save_extraction` now heals blank rows at
persist time with the freshly-rendered SVG it already holds, via
`update_substance_svgs` (whose `CASE WHEN col = '' THEN … ELSE col END` guard
only fills blanks and never clobbers a good render). After deploying, **one
re-upload of an affected file heals its row in place** — no manual DB surgery
needed. Only rows with `svg_len = 0` are affected.

---

## Quick reference: key knobs & limits

| Thing | Value | Where |
|---|---|---|
| Worker JVM heap / mem cap | `1g` / `1750m` | `docker-compose.yml` (`WORKER_JVM_MAX_HEAP`, `WORKER_MEM_LIMIT`) |
| Backend JVM heap / mem cap | `640m` / `1250m` | `docker-compose.yml` (`BACKEND_JVM_MAX_HEAP`, `BACKEND_MEM_LIMIT`) |
| InChI skip cap | 100 heavy atoms, or 1500 SMILES chars (no formula) | `backend/app/services/extractor.py` |
| `xtractUnique` timeout | 10 s | `backend/app/services/extractor.py` |
| SMILES / InChI storage | Postgres `TEXT` (unbounded) | `backend/app/models/orm.py` |
| InChIKey | fixed 27 chars | `backend/app/models/orm.py` |
| nginx `client_max_body_size` | 55m | `nginx/nginx.conf.template` |

## Deploying a fix

Python changes need the images rebuilt:
```bash
cd ~/BChemXtractWeb && git pull
docker compose up -d --build backend celery-worker
docker compose ps        # wait for healthy (~30–60 s)
```
Compose/env-only changes (e.g. memory caps) don't need `--build`:
```bash
docker compose up -d backend celery-worker
```
