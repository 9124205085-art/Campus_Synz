"""
Legacy one-off migration — use migrate_marksheet_v2.py instead.
Works with SQLite and PostgreSQL via SQLAlchemy.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from database.migrate_marksheet_v2 import apply_marksheet_schema_updates


def migrate():
    app = create_app()
    with app.app_context():
        apply_marksheet_schema_updates()
        print("CO columns migration completed (via marksheet v2 schema).")


if __name__ == "__main__":
    migrate()
