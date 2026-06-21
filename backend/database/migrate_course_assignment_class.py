"""Add class_number to course_assignments for HOD class-wise faculty assignment."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db


def apply_course_assignment_class_schema():
    from utils.db_migration import add_column_if_missing

    add_column_if_missing("course_assignments", "class_number", "INTEGER DEFAULT 1")
    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_course_assignment_class_schema()
        print("Course assignment class_number migration completed.")


if __name__ == "__main__":
    migrate()
