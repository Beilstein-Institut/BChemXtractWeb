"""PubChem PUG REST client + in-process rate limiter.

Pure I/O — no DB, no FastAPI. The backend runs as a single uvicorn process
(JVM-per-process constraint), so a per-process token bucket bounds the whole
backend's PubChem request rate. Swap for a Redis-backed limiter only if the
backend is ever scaled to multiple processes.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class TokenBucket:
    """Async token bucket. Capacity == rate (one second of burst)."""

    def __init__(
        self,
        rate_per_sec: float,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._rate = rate_per_sec
        self._capacity = rate_per_sec
        self._tokens = rate_per_sec
        self._now = now
        self._sleep = sleep
        self._updated = now()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Block until one token is available, then consume it."""
        async with self._lock:
            self._refill()
            if self._tokens < 1.0:
                deficit = 1.0 - self._tokens
                wait = deficit / self._rate
                await self._sleep(wait)
                self._refill()
            self._tokens -= 1.0

    def _refill(self) -> None:
        t = self._now()
        elapsed = t - self._updated
        if elapsed > 0:
            self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
            self._updated = t


PUBCHEM_COMPOUND_PAGE = "https://pubchem.ncbi.nlm.nih.gov/compound"
PUBCHEM_MAX_RETRIES = 2
_MAX_BACKOFF_SECS = 5.0
_CORE_PROPERTIES = (
    "MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,IUPACName,XLogP"
)

# Module-level limiter + concurrency guard, sized from settings.
_limiter = TokenBucket(settings.pubchem_rate_per_sec)
_semaphore = asyncio.Semaphore(settings.pubchem_max_concurrency)
_shared_client: httpx.AsyncClient | None = None


class PubChemError(Exception):
    """Raised when PubChem is unreachable, times out, or stays 503."""


def _backoff_delay(resp: httpx.Response, attempt: int) -> float:
    """Seconds to wait before retrying a 5xx/503.

    Honors a numeric ``Retry-After`` header (capped so a hostile/huge value
    can't hang the request), else falls back to exponential backoff. An
    HTTP-date ``Retry-After`` is uncommon for throttling and falls through
    to the exponential path.
    """
    retry_after = resp.headers.get("Retry-After")
    if retry_after:
        try:
            return min(float(retry_after), _MAX_BACKOFF_SECS)
        except ValueError:
            pass
    return 0.5 * (2**attempt)


def _user_agent() -> str:
    base = "BChemXtractWeb/0.1 (+https://github.com/Beilstein-Institut)"
    if settings.pubchem_contact_email:
        return f"{base}; mailto:{settings.pubchem_contact_email}"
    return base


def _get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(
            base_url=settings.pubchem_base_url,
            timeout=settings.pubchem_timeout_secs,
            headers={"User-Agent": _user_agent()},
        )
    return _shared_client


async def _request(
    method: str,
    path: str,
    client: httpx.AsyncClient,
    *,
    params: dict | None = None,
    data: dict | None = None,
) -> httpx.Response | None:
    """Rate-limited request with 503 backoff.

    Returns the Response, or None when PubChem reports 404 (not found).
    Raises PubChemError on timeout, connection failure, or persistent
    503/5xx.
    """
    for attempt in range(PUBCHEM_MAX_RETRIES + 1):
        await _limiter.acquire()
        try:
            async with _semaphore:
                resp = await client.request(method, path, params=params, data=data)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise PubChemError(f"PubChem request failed: {exc}") from exc
        if resp.status_code == 404:
            return None
        if resp.status_code >= 500:
            if attempt < PUBCHEM_MAX_RETRIES:
                await asyncio.sleep(_backoff_delay(resp, attempt))
                continue
            raise PubChemError(f"PubChem {resp.status_code} after retries")
        resp.raise_for_status()
        return resp
    raise PubChemError("PubChem request exhausted retries")


def _cids_from(resp: httpx.Response | None) -> list[int]:
    if resp is None:
        return []
    cids = resp.json().get("IdentifierList", {}).get("CID", [])
    return sorted(int(c) for c in cids)


async def resolve_exact_cids(
    inchi_key: str, client: httpx.AsyncClient | None = None
) -> list[int]:
    """Full-InChIKey -> sorted CIDs (empty when PubChem has no record)."""
    c = client or _get_shared_client()
    resp = await _request("GET", f"/compound/inchikey/{inchi_key}/cids/JSON", c)
    return _cids_from(resp)


async def resolve_connectivity_cids(
    smiles: str, client: httpx.AsyncClient | None = None
) -> list[int]:
    """same_connectivity (scaffold) match via the synchronous fastidentity
    endpoint. Empty when SMILES is blank or no connectivity match exists."""
    if not smiles.strip():
        return []
    c = client or _get_shared_client()
    resp = await _request(
        "POST",
        "/compound/fastidentity/smiles/cids/JSON",
        c,
        params={"identity_type": "same_connectivity"},
        data={"smiles": smiles},
    )
    return _cids_from(resp)


async def fetch_core_properties(
    cid: int, client: httpx.AsyncClient | None = None
) -> dict:
    """Tier-1 property fetch for one CID. Missing fields map to None."""
    c = client or _get_shared_client()
    resp = await _request(
        "GET", f"/compound/cid/{cid}/property/{_CORE_PROPERTIES}/JSON", c
    )
    if resp is None:
        return {}
    props = resp.json().get("PropertyTable", {}).get("Properties", [{}])[0]

    def _num(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "molecular_formula": props.get("MolecularFormula"),
        "molecular_weight": _num(props.get("MolecularWeight")),
        "canonical_smiles": props.get("CanonicalSMILES"),
        "isomeric_smiles": props.get("IsomericSMILES"),
        "iupac_name": props.get("IUPACName"),
        "xlogp": _num(props.get("XLogP")),
    }


async def fetch_synonyms(
    cid: int, client: httpx.AsyncClient | None = None
) -> list[str]:
    """Capped synonym list (most-common first, as PubChem returns them)."""
    c = client or _get_shared_client()
    resp = await _request("GET", f"/compound/cid/{cid}/synonyms/JSON", c)
    if resp is None:
        return []
    info = resp.json().get("InformationList", {}).get("Information", [{}])[0]
    return [str(s) for s in info.get("Synonym", [])][: settings.pubchem_synonyms_cap]


async def fetch_description(cid: int, client: httpx.AsyncClient | None = None) -> dict:
    """Title + first text description + its source. Empty dict when absent."""
    c = client or _get_shared_client()
    resp = await _request("GET", f"/compound/cid/{cid}/description/JSON", c)
    if resp is None:
        return {}
    entries = resp.json().get("InformationList", {}).get("Information", [])
    title = next((e["Title"] for e in entries if e.get("Title")), None)
    desc = next((e for e in entries if e.get("Description")), {})
    return {
        "title": title,
        "description": desc.get("Description"),
        "description_source": desc.get("DescriptionSourceName"),
    }
