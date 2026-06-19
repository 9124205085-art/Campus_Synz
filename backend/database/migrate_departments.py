"""Migrate legacy string departments to Department table with foreign keys."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text

from app import create_app
from extensions import db
from models import Course, Department, User
from utils.db_migration import add_column_if_missing
from utils.helpers import get_or_create_department, merge_duplicate_departments


def migrate():
    app = create_app()
    with app.app_context():
        db.create_all()

        add_column_if_missing("users", "department_id", "INTEGER")
        add_column_if_missing("courses", "department_id", "INTEGER")

        from utils.db_migration import column_exists

        has_legacy_user_dept = column_exists("users", "department")
        has_legacy_course_dept = column_exists("courses", "department")

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
