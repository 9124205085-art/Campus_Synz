"""Create department_year_settings table for HOD class division per year."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import DepartmentYearSetting  # noqa: F401


def apply_department_year_settings_schema():
    db.create_all()
    from utils.db_migration import add_column_if_missing

    add_column_if_missing("department_year_settings", "student_count", "INTEGER")
    db.session.commit()


def migrate():
    app = create_app()
    with app.app_context():
        apply_department_year_settings_schema()
        print("Department year settings migration completed.")


if __name__ == "__main__":
    migrate()
