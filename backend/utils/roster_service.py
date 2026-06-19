"""Faculty class roster helpers."""

from extensions import db
from models import FacultyClassRoster
from utils.helpers import department_match_key


def get_roster(faculty_id, branch, department, year, semester):
    """Find roster by class keys; falls back to fuzzy department name matching."""
    exact = FacultyClassRoster.query.filter_by(
        faculty_id=faculty_id,
        branch=branch,
        department=department,
        year=year,
        semester=semester,
    ).first()
    if exact:
        return exact

    dept_key = department_match_key(department)
    candidates = FacultyClassRoster.query.filter_by(
        faculty_id=faculty_id,
        branch=branch,
        year=year,
        semester=semester,
    ).all()
    for roster in candidates:
        if department_match_key(roster.department) == dept_key:
            return roster

    if len(candidates) == 1:
        return candidates[0]

    return None


def roster_student_count(faculty_id) -> int:
    rosters = FacultyClassRoster.query.filter_by(faculty_id=faculty_id).all()
    return sum(len(r.students or []) for r in rosters)


def validate_roster_students(students: list) -> tuple[list[dict], str | None]:
    if not isinstance(students, list):
        return [], "Students must be a list."
    if not students:
        return [], "Add at least one student."
    if len(students) > 200:
        return [], "Maximum 200 students per class list."

    cleaned = []
    seen_regs = set()
    for idx, row in enumerate(students, start=1):
        if not isinstance(row, dict):
            return [], f"Invalid student row at position {idx}."
        name = (row.get("full_name") or row.get("student_name") or "").strip()
        reg = (row.get("register_number") or "").strip().upper()
        if not name:
            return [], f"Student name is required on row {idx}."
        if not reg:
            return [], f"Register number is required on row {idx}."
        if reg in seen_regs:
            return [], f"Duplicate register number: {reg}."
        seen_regs.add(reg)
        cleaned.append({"full_name": name, "register_number": reg})
    return cleaned, None


def save_roster(faculty_id, branch, department, year, semester, students: list):
    cleaned, err = validate_roster_students(students)
    if err:
        return None, err

    roster = get_roster(faculty_id, branch, department, year, semester)
    if roster:
        roster.students = cleaned
        if department and department_match_key(department) == department_match_key(
            roster.department
        ):
            roster.department = department
    else:
        roster = FacultyClassRoster(
            faculty_id=faculty_id,
            branch=branch,
            department=department,
            year=year,
            semester=semester,
            students=cleaned,
        )
        db.session.add(roster)
    return roster, None
