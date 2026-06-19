"""Create hod_checklist_items table and add batch/section to mark_sheets."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import HodChecklistItem, MarkSheet  # noqa: F401
from utils.db_migration import add_column_if_missing


def apply_hod_checklist_schema():
    """Apply hod_checklist_items table and mark_sheets batch/section columns."""
    db.create_all()
    for col, typ in [
        ("batch", "VARCHAR(40) DEFAULT ''"),
        ("section", "VARCHAR(20) DEFAULT ''"),
    ]:
        add_column_if_missing("mark_sheets", col, typ)
    add_column_if_missing(
        "hod_checklist_items",
        "course_assignment_id",
        "INTEGER REFERENCES course_assignments(id)",
    )
    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_hod_checklist_schema()
        print("HOD checklist migration completed.")


if __name__ == "__main__":
    migrate()
