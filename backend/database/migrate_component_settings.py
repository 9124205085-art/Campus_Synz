"""Add component_settings JSON column to mark_sheets."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from models import MarkSheet  # noqa: F401
from utils.db_migration import add_column_if_missing, column_exists, json_text_default


def migrate():
    app = create_app()
    with app.app_context():
        if column_exists("mark_sheets", "component_settings"):
            print("component_settings column already exists.")
            return
        add_column_if_missing("mark_sheets", "component_settings", json_text_default())
        print("component_settings column added.")


if __name__ == "__main__":
    migrate()
