"""Repair mark sheet department links so submissions route to the correct HOD."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from extensions import db
from models import MarkSheet, User
from utils.department_service import sync_marksheet_department


def repair_marksheet_departments():
    """Set each mark sheet's department_id from its faculty member's department."""
    sheets = MarkSheet.query.all()
    fixed = 0
    for sheet in sheets:
        faculty = User.query.get(sheet.faculty_id)
        if not faculty or not faculty.department_id:
            continue
        if sheet.department_id != faculty.department_id:
            sync_marksheet_department(sheet, faculty)
            fixed += 1
    if fixed:
        db.session.commit()
    return fixed


def migrate():
    from app import create_app

    app = create_app()
    with app.app_context():
        count = repair_marksheet_departments()
        print(f"Department routing repair: {count} mark sheet(s) updated.")


if __name__ == "__main__":
    migrate()
