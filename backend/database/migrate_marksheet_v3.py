"""Add is_saved column to mark_sheets table."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text

from app import create_app
from extensions import db
from models import MarkSheet  # noqa: F401
from utils.db_migration import add_column_if_missing, boolean_default, column_exists, is_postgresql


def migrate():
    app = create_app()
    with app.app_context():
        if not column_exists("mark_sheets", "is_saved"):
            add_column_if_missing("mark_sheets", "is_saved", boolean_default(active=False))
            with db.engine.connect() as conn:
                saved_val = "TRUE" if is_postgresql() else "1"
                conn.execute(text(f"UPDATE mark_sheets SET is_saved = {saved_val}"))
                conn.commit()
            print("is_saved column added and existing mark sheets marked as saved.")
        else:
            print("is_saved column already exists.")


if __name__ == "__main__":
    migrate()
