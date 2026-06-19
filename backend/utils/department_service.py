"""Department-linked data and course assignments for dashboards."""

from models import Course, CourseAssignment, Department, User


def get_department_detail(department_id):
    if not department_id:
        return None
    dept = Department.query.get(department_id)
    return dept.to_dict() if dept else None


def assignments_for_department(department_id):
    """All course assignments in a department with course + faculty details."""
    courses = Course.query.filter_by(department_id=department_id).all()
    course_ids = [c.id for c in courses]
    if not course_ids:
        return []

    assignments = (
        CourseAssignment.query.filter(CourseAssignment.course_id.in_(course_ids))
        .order_by(CourseAssignment.year, CourseAssignment.created_at.desc())
        .all()
    )
    result = []
    for a in assignments:
        item = a.to_dict()
        if a.course:
            item.update(
                {
                    "department": a.course.department,
                    "department_id": a.course.department_id,
                }
            )
        result.append(item)
    return result


def assignments_for_faculty(faculty_id):
    return [
        a.to_dict()
        for a in CourseAssignment.query.filter_by(faculty_id=faculty_id)
        .order_by(CourseAssignment.year.desc())
        .all()
    ]


def faculty_has_course_assignment(faculty_id, course_code, year, semester):
    """True if this faculty is assigned the course for the given academic term."""
    if not faculty_id or not course_code:
        return False
    match = (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(
            CourseAssignment.faculty_id == faculty_id,
            Course.course_code == course_code.strip().upper(),
            CourseAssignment.year == int(year),
            CourseAssignment.semester == int(semester),
        )
        .first()
    )
    return match is not None


def _assignment_matches_sheet(assignment, sheet) -> bool:
    course = assignment.course if assignment else None
    if not course or not sheet:
        return False
    return (
        (sheet.course_code or "").strip().upper() == (course.course_code or "").strip().upper()
        and int(sheet.year or 0) == int(assignment.year or 0)
        and int(sheet.semester or 0) == int(assignment.semester or 0)
    )


def faculty_course_assignments(faculty_id):
    return CourseAssignment.query.filter_by(faculty_id=faculty_id).all()


def marksheet_is_for_assigned_course(sheet, faculty_id) -> bool:
    """True when the sheet belongs to this faculty and matches an HOD assignment."""
    if not sheet or sheet.faculty_id != faculty_id:
        return False
    return any(
        _assignment_matches_sheet(assignment, sheet)
        for assignment in faculty_course_assignments(faculty_id)
    )


def filter_marksheets_to_assigned_courses(sheets, faculty_id):
    """Keep only mark sheets for courses HOD assigned to this faculty."""
    if not sheets:
        return []
    assignments = faculty_course_assignments(faculty_id)
    if not assignments:
        return []
    return [
        sheet
        for sheet in sheets
        if any(_assignment_matches_sheet(assignment, sheet) for assignment in assignments)
    ]


def courses_with_assignments(department_id):
    """Courses in dept enriched with assignment rows."""
    courses = (
        Course.query.filter_by(department_id=department_id)
        .order_by(Course.course_code)
        .all()
    )
    out = []
    for course in courses:
        item = course.to_dict()
        assigns = CourseAssignment.query.filter_by(course_id=course.id).all()
        item["assignments"] = [a.to_dict() for a in assigns]
        item["staff"] = [a.to_dict() for a in assigns]
        names = [a.faculty.full_name for a in assigns if a.faculty]
        item["staff_display"] = ", ".join(names) if names else "Not assigned"
        out.append(item)
    return out


def faculty_with_course_summaries(department_id, active_only=False):
    """Faculty in a department with assigned courses and course count."""
    query = User.query.filter_by(role="faculty", department_id=department_id)
    if active_only:
        query = query.filter_by(is_active=True)
    faculty_users = query.order_by(User.full_name).all()

    result = []
    for faculty in faculty_users:
        assigns = assignments_for_faculty(faculty.id)
        course_labels = [
            f"{a['course_code']} — {a['course_name']} (Year {a['year']})"
            for a in assigns
        ]
        item = faculty.to_dict()
        item["courses"] = assigns
        item["course_list"] = course_labels
        item["courses_display"] = ", ".join(course_labels) if course_labels else "—"
        item["course_count"] = len(assigns)
        result.append(item)
    return result


def faculty_ids_for_department(department_id):
    if not department_id:
        return []
    return [
        u.id
        for u in User.query.filter_by(role="faculty", department_id=department_id).all()
    ]


def sync_marksheet_department(sheet, faculty):
    """Link mark sheet to the faculty member's department (for HOD routing)."""
    if not faculty or not faculty.department_id:
        return False
    sheet.department_id = faculty.department_id
    if faculty.department_rel:
        sheet.department_label = faculty.department_rel.name
    return True


def attach_submission_routing(payload: dict, faculty, hod) -> dict:
    """Stamp department/HOD routing so submissions stay scoped to the creating HOD's dept."""
    if not isinstance(payload, dict):
        return payload
    return {
        **payload,
        "submitted_to_department_id": faculty.department_id if faculty else None,
        "submitted_by_faculty_id": faculty.id if faculty else None,
        "target_hod_id": hod.id if hod else None,
    }


def get_department_hod(department_id):
    """Active HOD for a department (the HOD who manages that department's faculty)."""
    if not department_id:
        return None
    return User.query.filter_by(
        role="hod",
        department_id=department_id,
        is_active=True,
    ).first()


def marksheets_submitted_to_department(department_id):
    """CO submissions visible only to the HOD of the faculty's own department."""
    from models import MarkSheet

    if not department_id:
        return []

    return (
        MarkSheet.query.join(User, MarkSheet.faculty_id == User.id)
        .filter(
            MarkSheet.co_submitted.is_(True),
            User.role == "faculty",
            User.department_id == department_id,
        )
        .order_by(MarkSheet.co_submitted_at.desc())
        .all()
    )


def hod_can_access_submission(hod, sheet):
    if not hod or not hod.department_id or not sheet or not sheet.co_submitted:
        return False
    faculty = User.query.get(sheet.faculty_id)
    if not faculty or faculty.role != "faculty":
        return False
    return faculty.department_id == hod.department_id


def get_department_dashboard_data(department_id, faculty_id=None):
    if not department_id:
        return {
            "department": None,
            "department_detail": None,
            "department_id": None,
            "staff": [],
            "courses": [],
            "assignments": [],
            "connected": False,
        }

    department = Department.query.get(department_id)
    if not department:
        return {
            "department": None,
            "department_detail": None,
            "department_id": department_id,
            "staff": [],
            "courses": [],
            "assignments": [],
            "connected": False,
        }

    faculty_users = (
        User.query.filter_by(role="faculty", department_id=department_id, is_active=True)
        .order_by(User.full_name)
        .all()
    )
    staff = [f.to_dict() for f in faculty_users]

    if faculty_id:
        assigned = assignments_for_faculty(faculty_id)
        course_list = []
        for a in assigned:
            course_list.append(
                {
                    "id": a["course_id"],
                    "assignment_id": a["id"],
                    "course_code": a["course_code"],
                    "name": a["course_name"],
                    "regulation": a["regulation"],
                    "year": a["year"],
                    "semester": a["semester"],
                    "department": department.name,
                    "department_id": department.id,
                    "faculty_name": a["faculty_name"],
                    "staff_display": a["faculty_name"],
                }
            )
    else:
        course_list = courses_with_assignments(department_id)

    faculty_summary = faculty_with_course_summaries(department_id)

    return {
        "department": department.name,
        "department_detail": department.to_dict(),
        "department_id": department.id,
        "staff": staff,
        "faculty_with_courses": faculty_summary,
        "courses": course_list,
        "assignments": assignments_for_department(department_id),
        "connected": True,
    }
