"""Faculty class roster helpers."""

from extensions import db
from models import FacultyClassRoster
from utils.department_service import (
    department_students_for_faculty_year,
    faculty_assigned_class_numbers,
    faculty_assigned_years,
    faculty_has_year_assignment,
    faculty_hod_roster_entries,
)
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


def _unique_student_count(entries: list) -> int:
    seen = set()
    total = 0
    for entry in entries or []:
        reg = str(entry.get("register_number") or "").strip().upper()
        if not reg or reg in seen:
            continue
        seen.add(reg)
        total += 1
    return total


def roster_student_count(faculty_id) -> int:
    seen = set()
    total = 0

    for roster in FacultyClassRoster.query.filter_by(faculty_id=faculty_id).all():
        for entry in roster.students or []:
            reg = str(entry.get("register_number") or "").strip().upper()
            if not reg or reg in seen:
                continue
            seen.add(reg)
            total += 1

    for year in faculty_assigned_years(faculty_id):
        for entry in department_students_for_faculty_year(faculty_id, year):
            reg = str(entry.get("register_number") or "").strip().upper()
            if not reg or reg in seen:
                continue
            seen.add(reg)
            total += 1

    return total


def roster_summary_payload(faculty_id) -> dict:
    rosters = FacultyClassRoster.query.filter_by(faculty_id=faculty_id).all()
    saved = [r.to_dict() for r in rosters]
    hod_entries = faculty_hod_roster_entries(faculty_id)

    all_entries = saved + hod_entries
    seen_regs = set()
    total = 0
    for entry in all_entries:
        for student in entry.get("students") or []:
            reg = str(student.get("register_number") or "").strip().upper()
            if not reg or reg in seen_regs:
                continue
            seen_regs.add(reg)
            total += 1

    return {
        "total_students": total,
        "roster_count": len(all_entries),
        "rosters": all_entries,
    }


def roster_student_entries(faculty_id, branch, department, year, semester) -> list:
    payload = roster_students_for_faculty(faculty_id, branch, department, year, semester)
    return payload.get("students") or []


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


def roster_students_for_faculty(faculty_id, branch, department, year, semester):
    """Students for faculty roster view — HOD department list when assigned, else saved roster."""
    # HOD department lists are managed per year and class, not per semester.
    hod_students = department_students_for_faculty_year(faculty_id, year)
    if hod_students and faculty_has_year_assignment(faculty_id, year):
        assigned_classes = faculty_assigned_class_numbers(faculty_id, year)
        class_number = assigned_classes[0] if len(assigned_classes) == 1 else None
        return {
            "roster": None,
            "students": hod_students,
            "count": len(hod_students),
            "source": "hod_department",
            "read_only": True,
            "class_number": class_number,
            "class_label": f"Class {class_number}" if class_number else None,
            "assigned_classes": assigned_classes,
        }

    roster = get_roster(faculty_id, branch, department, year, semester)
    students = roster.students if roster else []
    return {
        "roster": roster.to_dict() if roster else None,
        "students": students,
        "count": len(students),
        "source": "faculty_roster" if roster else None,
        "read_only": False,
    }
