"""Seed sample students for mark sheet auto-fill."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import Student
from utils.marksheet_constants import BRANCHES, DEPARTMENTS


def seed_students():
    samples = []
    prefixes = {
        "Computer Science Engineering": "CSE",
        "Information Technology": "IT",
        "Artificial Intelligence and Data Science": "AIDS",
        "Electronics and Communication Engineering": "ECE",
        "Electrical and Electronics Engineering": "EEE",
        "Automobile Engineering": "AUTO",
        "Mechatronics": "MCT",
        "Mechanical": "MECH",
        "Aerospace": "AERO",
        "Aeronautical": "AERO",
    }

    for dept in DEPARTMENTS:
        prefix = prefixes.get(dept, "STU")
        for year in [1, 2, 3, 4]:
            for sem in [year * 2 - 1, year * 2]:
                branch = BRANCHES[year % 2]
                for i in range(1, 6):
                    reg = f"{2020 + year}{prefix}{i:03d}"
                    samples.append(
                        {
                            "register_number": reg,
                            "full_name": f"{dept.split()[0]} Y{year} Student {i}",
                            "branch": branch,
                            "department": dept,
                            "year": year,
                            "semester": sem,
                        }
                    )

    added = 0
    for data in samples:
        if Student.query.filter_by(register_number=data["register_number"]).first():
            continue
        db.session.add(Student(**data))
        added += 1

    db.session.commit()
    return added


def run():
    app = create_app()
    with app.app_context():
        db.create_all()
        n = seed_students()
        print(f"Seeded {n} student(s).")


if __name__ == "__main__":
    run()
