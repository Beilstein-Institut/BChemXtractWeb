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

    substances: Mapped[list["Substance"]] = relationship(
        secondary="extraction_substances",
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
    mdlv3000: Mapped[str] = mapped_column(Text, nullable=False, default="")
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
