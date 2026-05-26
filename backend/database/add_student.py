"""
Add one student to the database (used for mark sheet auto-fill).

Usage:
  python database/add_student.py --register 2024CSE001 --name "R. Priya" ^
    --branch "Bachelor of Technology" --department "Computer Science Engineering" ^
    --year 1 --semester 1

Run from the backend folder with venv activated.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import Student
from utils.marksheet_constants import BRANCHES, DEPARTMENTS, SEMESTERS, YEARS


def main():
    parser = argparse.ArgumentParser(description="Add a student record")
    parser.add_argument("--register", required=True, help="Register number (unique)")
    parser.add_argument("--name", required=True, help="Full name")
    parser.add_argument("--branch", required=True, choices=BRANCHES)
    parser.add_argument("--department", required=True, choices=DEPARTMENTS)
    parser.add_argument("--year", type=int, required=True, choices=YEARS)
    parser.add_argument("--semester", type=int, required=True, choices=SEMESTERS)
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        db.create_all()
        existing = Student.query.filter_by(register_number=args.register).first()
        if existing:
            print(f"Student already exists: {existing.full_name} ({existing.register_number})")
            return

        student = Student(
            register_number=args.register.strip(),
            full_name=args.name.strip(),
            branch=args.branch,
            department=args.department,
            year=args.year,
            semester=args.semester,
        )
        db.session.add(student)
        db.session.commit()
        print("Student added:")
        print(f"  {student.register_number} — {student.full_name}")
        print(f"  {student.branch} / {student.department} / Year {student.year} / Sem {student.semester}")


if __name__ == "__main__":
    main()
