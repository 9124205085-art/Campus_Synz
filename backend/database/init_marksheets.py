"""Create mark_sheets table if missing."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import MarkSheet  # noqa: F401 — register model


def init():
    app = create_app()
    with app.app_context():
        db.create_all()
        print("mark_sheets table ready.")


if __name__ == "__main__":
    init()
