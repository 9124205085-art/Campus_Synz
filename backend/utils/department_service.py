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
