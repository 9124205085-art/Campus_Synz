"""Create department_class_profiles table for HOD class metadata."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import DepartmentClassProfile  # noqa: F401


def apply_department_class_profiles_schema():
    db.create_all()
    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_department_class_profiles_schema()
        print("Department class profiles migration completed.")


if __name__ == "__main__":
    migrate()
