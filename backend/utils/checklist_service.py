"""HOD component submission checklist — courses from assignments, components assigned by HOD."""

from models import Course, CourseAssignment, HodChecklistItem, User
from utils.department_service import (
    get_department_year_class_counts,
    marksheets_submitted_to_department,
)
from utils.submission_utils import (
    build_submission_records,
    component_matches,
    norm_key,
)


def department_assignments(department_id: int) -> list[CourseAssignment]:
    return (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(Course.department_id == department_id)
        .order_by(CourseAssignment.year, CourseAssignment.semester, Course.course_code)
        .all()
    )


def collect_component_submissions(department_id: int) -> list[dict]:
    """All submitted components for a department (summary + per-marksheet submits)."""
    sheets = marksheets_submitted_to_department(department_id)

    faculty_ids = {s.faculty_id for s in sheets}
    faculty_map = (
        {u.id: u.full_name for u in User.query.filter(User.id.in_(faculty_ids)).all()}
        if faculty_ids
        else {}
    )

    return build_submission_records(sheets, faculty_map)


def _course_code_matches(item_code: str, sub_code: str) -> bool:
    return norm_key(item_code) == norm_key(sub_code)


def submission_matches_item(item: HodChecklistItem, sub: dict, faculty_id: int | None = None) -> bool:
    if faculty_id is not None and sub.get("faculty_id") != faculty_id:
        return False

    if not _course_code_matches(item.course_code, sub.get("course_code") or ""):
        return False

    item_year = item.year
    sub_year = sub.get("year")
    if item_year is not None and sub_year is not None and int(item_year) != int(sub_year):
        return False

    item_sem = item.semester
    sub_sem = sub.get("semester")
    if item_sem is not None and sub_sem is not None and int(item_sem) != int(sub_sem):
        return False

    for comp in sub.get("components") or []:
        if component_matches(item.component_id, item.component_label, comp):
            return True

    return False


def item_with_status(item: HodChecklistItem, submissions: list[dict], faculty_id: int | None = None) -> dict:
    row = item.to_dict()
    match = None
    for sub in submissions:
        if submission_matches_item(item, sub, faculty_id):
            match = sub
            break

    row["completed"] = match is not None
    row["submitted_by"] = match.get("faculty_name") if match else None
    row["submitted_at"] = match.get("submitted_at") if match else None
    return row


def build_checklist_tree(department_id: int) -> dict:
    assignments = department_assignments(department_id)
    items = (
        HodChecklistItem.query.filter_by(department_id=department_id)
        .order_by(HodChecklistItem.component_label)
        .all()
    )
    submissions = collect_component_submissions(department_id)

    by_assignment: dict[int, list[HodChecklistItem]] = {}
    for item in items:
        if item.course_assignment_id:
            by_assignment.setdefault(item.course_assignment_id, []).append(item)

    years: dict[int, list] = {}
    total_components = 0
    completed = 0

    for assignment in assignments:
        course = assignment.course
        if not course:
            continue

        faculty_id = assignment.faculty_id
        faculty_name = assignment.faculty.full_name if assignment.faculty else ""
        comp_items = by_assignment.get(assignment.id, [])

        components = []
        for item in comp_items:
            row = item_with_status(item, submissions, faculty_id)
            total_components += 1
            if row["completed"]:
                completed += 1
            components.append(row)

        course_row = {
            "assignment_id": assignment.id,
            "course_code": course.course_code,
            "course_name": course.name,
            "regulation": course.regulation,
            "year": assignment.year,
            "semester": assignment.semester,
            "class_number": assignment.class_number or 1,
            "class_label": f"Class {assignment.class_number or 1}",
            "faculty_id": faculty_id,
            "faculty_name": faculty_name,
            "components": components,
            "component_count": len(components),
            "completed_count": sum(1 for c in components if c["completed"]),
        }

        y = assignment.year
        years.setdefault(y, []).append(course_row)

    year_list = []
    for y in sorted(years.keys()):
        year_list.append({"year": y, "courses": years[y]})

    class_counts = get_department_year_class_counts(department_id)

    return {
        "years": year_list,
        "year_settings": [
            {"year": y, "class_count": class_counts.get(y, 1)} for y in (1, 2, 3, 4)
        ],
        "summary": {
            "total_courses": len(assignments),
            "total": total_components,
            "completed": completed,
            "pending": total_components - completed,
        },
        "submissions_count": len(submissions),
    }


def delete_checklist_for_assignment(assignment_id: int) -> None:
    HodChecklistItem.query.filter_by(course_assignment_id=assignment_id).delete()
