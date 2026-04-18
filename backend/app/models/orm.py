"""SQLAlchemy 2.0 ORM models for extraction persistence (Phase 5).

Three-table normalized schema per D-01:
  - extractions: one row per POST /api/extract call
  - substances: one row per unique molecule (deduplicated by inchi_key per D-02)
  - extraction_substances: M-to-N join table linking extractions to substances
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models. Alembic reads Base.metadata."""
    pass


class Extraction(Base):
    """One extraction event — a single POST /api/extract call result.

    Attributes per D-01: id, filename, file_size, format, structure_count,
    extraction_time_ms, warnings (JSONB list), created_at.
    """

    __tablename__ = "extractions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False)
    structure_count: Mapped[int] = mapped_column(Integer, nullable=False)
    extraction_time_ms: Mapped[float] = mapped_column(Float, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    batch_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )

    # Plan 10 D-16: reaction_count populated by save_reactions; 0 until user
    # re-extracts reactions for this file.
    reaction_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
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
    """A unique chemical substance, deduplicated by inchi_key (D-02).

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
    svg_cdx: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    mdlv3000: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # D-04/D-05: CDK canonical SMILES for SRCH-03 exact-match queries.
    # Nullable so rows with unparsable SMILES stay literal SQL NULL (never
    # empty string) — see RESEARCH §Pattern 6 and threat model T-09-02-07.
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

    CASCADE on both FKs: deleting an Extraction cascades join rows (D-07/D-10).
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


class Reaction(Base):
    """A unique chemical reaction, deduplicated by long_rinchi_key.

    Plan 10 D-18 amended: upstream BChemXtract never populates rinchi_key
    (ReactionXtractor.java:132 does not call setRinchiKey). We use
    long_rinchi_key as the UNIQUE dedup column. Rows with empty
    long_rinchi_key get a synthetic NO_RINCHI_{sha1(reaction_smiles)}
    placeholder in the persistence layer.

    INSERT ON CONFLICT (long_rinchi_key) DO NOTHING — first-seen wins
    (mirrors Phase 5 D-02 for substances).
    """

    __tablename__ = "reactions"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    # D-18 amended: the real dedup key.
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
    # D-17: components live as JSONB on the reaction row (not a separate table)
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

    Plan 10 D-21: CASCADE on both FKs so deleting an Extraction removes its
    reaction join rows. Orphan Reaction cleanup runs inline in persistence.
    """

    __tablename__ = "extraction_reactions"
    __table_args__ = (
        UniqueConstraint(
            "extraction_id", "reaction_id", name="uq_extraction_reaction"
        ),
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
