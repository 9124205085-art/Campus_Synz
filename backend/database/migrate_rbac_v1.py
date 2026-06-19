"""Add RBAC fields: department metadata, user profile, course assignments."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import CourseAssignment  # noqa: F401 — register table
from utils.db_migration import add_column_if_missing, boolean_default


def migrate():
    app = create_app()
    with app.app_context():
        db.create_all()

        for col, typ in [
            ("code", "VARCHAR(20)"),
            ("degree", "VARCHAR(20)"),
            ("duration", "INTEGER"),
            ("status", "VARCHAR(20) DEFAULT 'active'"),
        ]:
            add_column_if_missing("departments", col, typ)

        for col, typ in [
            ("employee_id", "VARCHAR(30)"),
            ("mobile", "VARCHAR(15)"),
            ("designation", "VARCHAR(30)"),
            ("is_active", boolean_default(active=True)),
        ]:
            add_column_if_missing("users", col, typ)

        db.session.commit()
        print("RBAC v1 migration completed.")


if __name__ == "__main__":
    migrate()
