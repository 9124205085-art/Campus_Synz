"""Add RBAC fields: department metadata, user profile, course assignments."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import inspect, text

from app import create_app
from extensions import db
from models import CourseAssignment  # noqa: F401 — register table


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
            _add_column_if_missing("departments", col, typ)

        for col, typ in [
            ("employee_id", "VARCHAR(30)"),
            ("mobile", "VARCHAR(15)"),
            ("designation", "VARCHAR(30)"),
            ("is_active", "BOOLEAN DEFAULT 1"),
        ]:
            _add_column_if_missing("users", col, typ)

        db.session.commit()
        print("RBAC v1 migration completed.")


if __name__ == "__main__":
    migrate()
