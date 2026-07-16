"""extraction_files: storage, CASCADE cleanup, RLS isolation."""

import pytest
from sqlalchemy import select, text

from app.models.orm import ExtractionFile
from app.services.db import AsyncSessionLocal


async def _insert_extraction(session, session_id: str) -> int:
    await session.execute(
        text("SELECT set_config('app.session_id', :sid, true)"), {"sid": session_id}
    )
    eid = (
        await session.execute(
            text(
                "INSERT INTO extractions (session_id, filename, file_size, format, "
                "structure_count, extraction_time_ms, warnings) "
                "VALUES (:sid, 'f.cdx', 3, 'cdx', 0, 0, '[]'::jsonb) RETURNING id"
            ),
            {"sid": session_id},
        )
    ).scalar_one()
    return eid


@pytest.mark.asyncio
async def test_cascade_delete_removes_file(db_session):
    """Deleting the parent extraction removes its extraction_files row."""
    async with AsyncSessionLocal() as s:
        eid = await _insert_extraction(s, "sess-cascade-1")
        await s.execute(
            text(
                "INSERT INTO extraction_files (extraction_id, content, session_id) "
                "VALUES (:e, :c, :sid)"
            ),
            {"e": eid, "c": b"VjCD-bytes", "sid": "sess-cascade-1"},
        )
        await s.commit()
        await s.execute(text("DELETE FROM extractions WHERE id = :e"), {"e": eid})
        await s.commit()
        rows = (
            (
                await s.execute(
                    select(ExtractionFile).where(ExtractionFile.extraction_id == eid)
                )
            )
            .scalars()
            .all()
        )
    assert rows == [], "CASCADE must delete the extraction_files row"
