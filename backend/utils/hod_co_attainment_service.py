"""HOD CO/PO attainment — mark sheets scoped to course assignments in the department."""

from models import Course, CourseAssignment, MarkSheet, User
from sqlalchemy import or_


def _assignment_in_department(assignment, department_id):
    return (
        assignment
        and assignment.course
        and assignment.course.department_id == department_id
    )


def marksheets_for_assignment(assignment, submitted_only=False):
    """Mark sheets for one HOD course assignment (faculty + course + year + sem)."""
    if not assignment or not assignment.course:
        return []

    query = MarkSheet.query.filter_by(
        faculty_id=assignment.faculty_id,
        course_code=assignment.course.course_code,
        year=assignment.year,
        semester=assignment.semester,
    )
    if submitted_only:
        query = query.filter(MarkSheet.co_submitted.is_(True))
    else:
        query = query.filter(
            or_(MarkSheet.is_saved.is_(True), MarkSheet.co_submitted.is_(True))
        )

    return query.order_by(MarkSheet.updated_at.desc()).all()


def course_attainment_payload(assignment, department_id):
    if not _assignment_in_department(assignment, department_id):
        return None

    course = assignment.course
    faculty = assignment.faculty
    sheets = marksheets_for_assignment(assignment)

    return {
        "assignment_id": assignment.id,
        "course_code": course.course_code,
        "course_name": course.name,
        "regulation": course.regulation,
        "year": assignment.year,
        "semester": assignment.semester,
        "faculty_id": assignment.faculty_id,
        "faculty_name": faculty.full_name if faculty else "",
        "marksheets": [s.to_dict() for s in sheets],
        "marksheet_count": len(sheets),
    }


def year_attainment_payload(department_id, year, semester=None):
    """All course assignments in a year (optional semester) with their mark sheets."""
    query = (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(Course.department_id == department_id, CourseAssignment.year == int(year))
        .order_by(Course.course_code)
    )
    if semester is not None:
        query = query.filter(CourseAssignment.semester == int(semester))

    assignments = query.all()
    courses = []
    for assignment in assignments:
        payload = course_attainment_payload(assignment, department_id)
        if payload:
            courses.append(payload)

    sem_values = sorted({c["semester"] for c in courses if c.get("semester") is not None})

    return {
        "year": int(year),
        "semester": int(semester) if semester is not None else (sem_values[0] if len(sem_values) == 1 else None),
        "semesters_in_year": sem_values,
        "courses": courses,
        "course_count": len(courses),
    }


def get_assignment_for_hod(assignment_id, department_id):
    return (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(
            CourseAssignment.id == assignment_id,
            Course.department_id == department_id,
        )
        .first()
    )
