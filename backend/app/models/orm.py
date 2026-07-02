"""SQLAlchemy 2.0 ORM models for extraction persistence.

Three-table normalized schema:
  - extractions: one row per POST /api/extract call
  - substances: one row per unique molecule (deduplicated by inchi_key)
  - extraction_substances: M-to-N join table linking extractions to substances
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models. Alembic reads Base.metadata."""

    pass


class Extraction(Base):
    """One extraction event — a single POST /api/extract call result.

    Attributes: id, filename, file_size, format, structure_count,
    extraction_time_ms, warnings (JSONB list), created_at.
    """

    __tablename__ = "extractions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False)
    structure_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # Distinct ChemDraw abbreviations expanded across the file (aggregate; the
    # per-substance maps are not persisted because substances dedup by InChIKey).
    abbreviation_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    extraction_time_ms: Mapped[float] = mapped_column(Float, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # reaction_count populated by save_reactions; 0 until user
    # re-extracts reactions for this file.
    reaction_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Per-row ownership for Postgres RLS. Nullable for legacy rows (wiped
    # by the ownership migration before RLS is forced).
    # session_id: 36-char UUID string. api_key_hash: 32-byte PBKDF2 digest.
    session_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    api_key_hash: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, index=True
    )

    substances: Mapped[list["Substance"]] = relationship(
        secondary="extraction_substances",
        back_populates="extractions",
        lazy="selectin",
    )
    reactions: Mapped[list["Reaction"]] = relationship(
        secondary="extraction_reactions",
        back_populates="extractions",
        lazy="selectin",
    )


class Substance(Base):
    """A unique chemical substance, deduplicated by inchi_key.

    INSERT ON CONFLICT (inchi_key) DO NOTHING — first-seen metadata wins.
    """

    __tablename__ = "substances"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    inchi_key: Mapped[str] = mapped_column(String(27), unique=True, nullable=False)
    inchi: Mapped[str] = mapped_column(Text, nullable=False, default="")
    smiles: Mapped[str] = mapped_column(Text, nullable=False, default="")
    extended_smiles: Mapped[str] = mapped_column(Text, nullable=False, default="")
    molecular_formula: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    svg: Mapped[str] = mapped_column(Text, nullable=False, default="")
    svg_cdx: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    mdlv3000: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # CDK canonical SMILES for exact-match search queries.
    # Nullable so rows with unparsable SMILES stay literal SQL NULL (never
    # empty string), preserving the "row is unparsable" vs "canonicalized to
    # empty" distinction.
    canonical_smiles: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    extractions: Mapped[list["Extraction"]] = relationship(
        secondary="extraction_substances",
        back_populates="substances",
        lazy="selectin",
    )


class ExtractionSubstance(Base):
    """M-to-N join table linking extractions to substances.

    CASCADE on both FKs: deleting an Extraction cascades join rows.
    """

    __tablename__ = "extraction_substances"
    __table_args__ = (
        UniqueConstraint(
            "extraction_id", "substance_id", name="uq_extraction_substance"
        ),
    )

    extraction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extractions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    substance_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("substances.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Per-row ownership for Postgres RLS. Nullable for legacy rows (wiped
    # by the ownership migration before RLS is forced).
    # session_id: 36-char UUID string. api_key_hash: 32-byte PBKDF2 digest.
    session_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    api_key_hash: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, index=True
    )


class Reaction(Base):
    """A unique chemical reaction, deduplicated by long_rinchi_key.

    Upstream BChemXtract never populates rinchi_key
    (ReactionXtractor.java:132 does not call setRinchiKey). We use
    long_rinchi_key as the UNIQUE dedup column. Rows with empty
    long_rinchi_key get a synthetic NO_RINCHI_{sha1(reaction_smiles)}
    placeholder in the persistence layer.

    INSERT ON CONFLICT (long_rinchi_key) DO NOTHING — first-seen wins
    (mirrors the substance dedup strategy).
    """

    __tablename__ = "reactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # The real dedup key.
    long_rinchi_key: Mapped[str] = mapped_column(
        String(256), unique=True, nullable=False
    )
    # Forward-compat: upstream may populate in the future; always "" in v1.
    rinchi_key: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    rinchi: Mapped[str] = mapped_column(Text, nullable=False, default="")
    short_rinchi_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    web_rinchi_key: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reaction_smiles: Mapped[str] = mapped_column(Text, nullable=False, default="")
    aux_info: Mapped[str] = mapped_column(Text, nullable=False, default="")
    svg: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # components live as JSONB on the reaction row (not a separate table)
    components: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    extractions: Mapped[list["Extraction"]] = relationship(
        secondary="extraction_reactions",
        back_populates="reactions",
        lazy="selectin",
    )


class ExtractionReaction(Base):
    """M-to-N join table linking extractions to reactions.

    CASCADE on both FKs so deleting an Extraction removes its
    reaction join rows. Orphan Reaction cleanup runs inline in persistence.
    """

    __tablename__ = "extraction_reactions"
    __table_args__ = (
        UniqueConstraint("extraction_id", "reaction_id", name="uq_extraction_reaction"),
    )

    extraction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extractions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    reaction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("reactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Per-row ownership for Postgres RLS. Nullable for legacy rows (wiped
    # by the ownership migration before RLS is forced).
    # session_id: 36-char UUID string. api_key_hash: 32-byte PBKDF2 digest.
    session_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    api_key_hash: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, index=True
    )


class ApiKey(Base):
    """Admin-issued API key.

    `key_hash` is the deterministic PBKDF2-HMAC-SHA256 (600k iter, 32-byte)
    digest of the plaintext key — the plaintext itself is shown to the
    admin ONCE on creation and never persisted. UNIQUE index on key_hash
    enforces O(log n) lookup at request time.

    Expiry semantics: `expires_at IS NULL` means no expiry
    (admin-explicit only). `revoked_at IS NOT NULL` short-circuits the
    validity check regardless of expiry.
    """

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    key_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    request_count: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuditLog(Base):
    """Append-only auth/data-lifecycle audit trail.

    `session_id_hash` stores sha256(session_id) — never raw UUID — so the
    audit log itself is not a credential leak. `api_key_hash` is the
    request's lookup hash (same byte shape as ApiKey.key_hash) when the
    caller authenticated with X-API-Key; null otherwise.

    12-month retention enforced by a Celery beat task. Indexed on
    `(event, at DESC)` for routine queries and `(at)` for the prune
    sweep.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id_hash: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    api_key_hash: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    ip_inet: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    meta: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )


class PubChemCompound(Base):
    """Durable cache of PubChem reference data, keyed by full InChIKey.

    Public reference data only — maps InChIKey -> PubChem facts. It records
    NOTHING about who requested a lookup, so it carries no per-session
    ownership columns and no RLS. ``status`` is the match outcome:
      - ``exact``    — full InChIKey matched a PubChem record
      - ``scaffold`` — only the connectivity (same_connectivity) matched
      - ``absent``   — neither matched
    Detail-tier columns (title, synonyms, description) stay NULL until a
    user opens the structure detail and the tier-2 fetch fills them.
    """

    __tablename__ = "pubchem_compounds"

    inchi_key: Mapped[str] = mapped_column(String(27), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    cid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    iupac_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    molecular_formula: Mapped[str | None] = mapped_column(String(255), nullable=True)
    molecular_weight: Mapped[float | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    canonical_smiles: Mapped[str | None] = mapped_column(Text, nullable=True)
    isomeric_smiles: Mapped[str | None] = mapped_column(Text, nullable=True)
    xlogp: Mapped[float | None] = mapped_column(Float, nullable=True)
    synonyms: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    connectivity_cid_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    detail_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
