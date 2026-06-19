"""Add mark sheet v2 columns and students table."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import MarkSheet, Student  # noqa: F401
from utils.db_migration import (
    add_column_if_missing,
    boolean_default,
    datetime_type,
    json_text_default,
)


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
        ("component_weightages", json_text_default()),
        ("co_submitted", boolean_default(active=False)),
        ("co_submitted_at", datetime_type()),
        ("co_submission_data", "TEXT"),
        ("co_po_mapping", json_text_default()),
        ("assessment_labels", json_text_default()),
    ]:
        add_column_if_missing("mark_sheets", col, typ)

    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_marksheet_schema_updates()
        print("Mark sheet v2 migration completed.")


if __name__ == "__main__":
    migrate()
