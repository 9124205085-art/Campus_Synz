"""Migrate legacy string departments to Department table with foreign keys."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import inspect, text

from app import create_app
from extensions import db
from models import Course, Department, User
from utils.helpers import get_or_create_department, merge_duplicate_departments


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

        _add_column_if_missing("users", "department_id", "INTEGER")
        _add_column_if_missing("courses", "department_id", "INTEGER")

        has_legacy_user_dept = _column_exists("users", "department")
        has_legacy_course_dept = _column_exists("courses", "department")

        if has_legacy_user_dept:
            rows = db.session.execute(text("SELECT id, department FROM users WHERE department IS NOT NULL"))
            for row in rows:
                user = User.query.get(row.id)
                if user and row.department and not user.department_id:
                    dept = get_or_create_department(row.department)
                    user.department_id = dept.id

        if has_legacy_course_dept:
            rows = db.session.execute(
                text("SELECT id, department FROM courses WHERE department IS NOT NULL")
            )
            for row in rows:
                course = Course.query.get(row.id)
                if course and row.department and not course.department_id:
                    dept = get_or_create_department(row.department)
                    course.department_id = dept.id

        # Seed default departments
        defaults = [
            "B.Tech Information Technology",
            "Computer Science",
            "Administration",
        ]
        for name in defaults:
            get_or_create_department(name)

        merged = merge_duplicate_departments()

        for course in Course.query.all():
            if course.department_id and course.department_rel:
                course.department_label = course.department_rel.name
            elif not course.department_label:
                course.department_label = "Unassigned"

        db.session.commit()
        print("Department migration completed.")
        if merged:
            print(f"  Merged {merged} duplicate department(s).")


if __name__ == "__main__":
    migrate()
