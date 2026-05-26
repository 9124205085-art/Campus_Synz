"""Department-linked data for HOD and faculty dashboards."""

from models import Course, Department, User


def get_department_dashboard_data(department_id):
    """
    Return staff and courses for a department.
    All HOD, faculty, and courses share the same department_id link.
    """
    if not department_id:
        return {
            "department": None,
            "department_id": None,
            "staff": [],
            "courses": [],
            "connected": False,
        }

    department = Department.query.get(department_id)
    if not department:
        return {
            "department": None,
            "department_id": department_id,
            "staff": [],
            "courses": [],
            "connected": False,
        }

    faculty = (
        User.query.filter_by(role="faculty", department_id=department_id)
        .order_by(User.full_name)
        .all()
    )
    courses = (
        Course.query.filter_by(department_id=department_id)
        .order_by(Course.course_code)
        .all()
    )

    staff = [{"id": f.id, "full_name": f.full_name, "email": f.email} for f in faculty]
    staff_names = [s["full_name"] for s in staff]

    course_list = []
    for course in courses:
        item = course.to_dict()
        item["staff"] = staff
        item["staff_names"] = staff_names
        item["staff_display"] = (
            ", ".join(staff_names) if staff_names else "No faculty in this department yet"
        )
        course_list.append(item)

    return {
        "department": department.name,
        "department_id": department.id,
        "staff": staff,
        "courses": course_list,
        "connected": True,
    }
