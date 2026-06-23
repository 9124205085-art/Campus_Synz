"""Remove all test/operational data; keep admin login for fresh production setup."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import (
    Course,
    CourseAssignment,
    Department,
    DepartmentClassProfile,
    DepartmentYearSetting,
    FacultyClassRoster,
    HodChecklistItem,
    MarkSheet,
    Notification,
    Student,
    User,
)
from utils.helpers import get_or_create_department


def clean_for_deploy() -> dict:
    """Wipe transactional data and non-admin users; preserve admin account(s)."""
    counts_before = {
        "users": User.query.count(),
        "admins": User.query.filter_by(role="admin").count(),
        "mark_sheets": MarkSheet.query.count(),
        "students": Student.query.count(),
    }

    admins = User.query.filter_by(role="admin").all()
    if not admins:
        raise RuntimeError("No admin user found — aborting to avoid locking you out.")

    Notification.query.delete(synchronize_session=False)
    MarkSheet.query.delete(synchronize_session=False)
    HodChecklistItem.query.delete(synchronize_session=False)
    FacultyClassRoster.query.delete(synchronize_session=False)
    CourseAssignment.query.delete(synchronize_session=False)
    Course.query.delete(synchronize_session=False)
    Student.query.delete(synchronize_session=False)
    DepartmentYearSetting.query.delete(synchronize_session=False)
    DepartmentClassProfile.query.delete(synchronize_session=False)

    deleted_users = User.query.filter(User.role != "admin").delete(synchronize_session=False)

    for admin in admins:
        admin.department_id = None

    Department.query.delete(synchronize_session=False)

    admin_dept = get_or_create_department("Administration")
    for admin in admins:
        admin.department_id = admin_dept.id

    db.session.commit()

    return {
        "before": counts_before,
        "deleted_non_admin_users": deleted_users,
        "admins_kept": [a.email for a in admins],
        "after": {
            "users": User.query.count(),
            "departments": Department.query.count(),
            "courses": Course.query.count(),
            "students": Student.query.count(),
            "mark_sheets": MarkSheet.query.count(),
        },
    }


def run():
    app = create_app()
    with app.app_context():
        result = clean_for_deploy()
        print("Deploy cleanup complete.")
        print(f"  Admins kept: {', '.join(result['admins_kept'])}")
        print(f"  Non-admin users removed: {result['deleted_non_admin_users']}")
        print(f"  Before: {result['before']}")
        print(f"  After:  {result['after']}")


if __name__ == "__main__":
    run()
