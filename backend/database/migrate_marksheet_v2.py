"""Add mark sheet v2 columns and students table."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import inspect, text

from app import create_app
from extensions import db
from models import MarkSheet, Student  # noqa: F401


def _column_exists(table: str, column: str) -> bool:
    inspector = inspect(db.engine)
    if table not in inspector.get_table_names():
        return False
    return column in {col["name"] for col in inspector.get_columns(table)}


def _add_column_if_missing(table: str, column: str, col_type: str) -> None:
    if not _column_exists(table, column):
        with db.engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()


def apply_marksheet_schema_updates():
    """Apply mark_sheets column updates (requires active Flask app context)."""
    db.create_all()

    for col, typ in [
        ("branch", "VARCHAR(80)"),
        ("year", "INTEGER"),
        ("semester", "INTEGER"),
        ("assessment_components", "TEXT"),
        ("question_marks", "TEXT"),
        ("course_assignment_id", "INTEGER"),
        ("passing_threshold", "REAL DEFAULT 60.0"),
        ("component_weightages", "TEXT DEFAULT '{}'"),
        ("co_submitted", "BOOLEAN DEFAULT 0"),
        ("co_submitted_at", "DATETIME"),
        ("co_submission_data", "TEXT"),
    ]:
        _add_column_if_missing("mark_sheets", col, typ)

    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_marksheet_schema_updates()
        print("Mark sheet v2 migration completed.")


if __name__ == "__main__":
    migrate()
