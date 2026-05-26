"""Add is_saved column to mark_sheets table."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import inspect, text

from app import create_app
from extensions import db
from models import MarkSheet  # noqa: F401


def _column_exists(table: str, column: str) -> bool:
    inspector = inspect(db.engine)
    if table not in inspector.get_table_names():
        return False
    return column in {col["name"] for col in inspector.get_columns(table)}


def migrate():
    app = create_app()
    with app.app_context():
        if not _column_exists("mark_sheets", "is_saved"):
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE mark_sheets ADD COLUMN is_saved BOOLEAN DEFAULT 0"))
                # Mark existing ones as saved so they are not hidden
                conn.execute(text("UPDATE mark_sheets SET is_saved = 1"))
                conn.commit()
            print("is_saved column added and existing mark sheets marked as saved.")
        else:
            print("is_saved column already exists.")


if __name__ == "__main__":
    migrate()
