"""Create notifications table for faculty in-app alerts."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import Notification  # noqa: F401


def apply_notifications_schema():
    db.create_all()
    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_notifications_schema()
        print("Notifications migration completed.")


if __name__ == "__main__":
    migrate()
