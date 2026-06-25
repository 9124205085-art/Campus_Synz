from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models import Course, CourseAssignment, HodChecklistItem, MarkSheet, User
from utils.checklist_service import (
    build_checklist_tree,
    delete_checklist_for_assignment,
)
from utils.decorators import role_required
from utils.department_service import (
    _hod_stats_from_dept_data,
    get_department_dashboard_data,
    hod_can_access_submission,
    marksheets_submitted_to_department,
)
from utils.marksheet_constants import validate_year_semester
from utils.submission_utils import (
    build_submission_records,
    components_from_submission,
    flatten_submission_rows,
    is_component_summary,
    norm_key,
    parse_submission_data,
    resolve_component_label,
)
from utils.user_service import check_employee_id_unique, parse_staff_payload

hod_bp = Blueprint("hod", __name__)


def _current_hod():
    user_id = int(get_jwt_identity())
    user = User.query.filter_by(id=user_id, role="hod").first()
    return user


@hod_bp.route("/dashboard", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_dashboard():
    user = _current_hod()
    if not user:
        return jsonify({"message": "HOD not found."}), 404

    dept_data = get_department_dashboard_data(user.department_id)
    return jsonify(
        {
            "message": f"Welcome, {user.full_name}",
            "user": user.to_dict(),
            "department": dept_data["department"],
            "department_detail": dept_data["department_detail"],
            "department_connected": dept_data["connected"],
            "stats": _hod_stats_from_dept_data(dept_data),
            "staff": dept_data["staff"],
            "faculty_with_courses": dept_data.get("faculty_with_courses", []),
            "courses": dept_data["courses"],
            "assignments": dept_data["assignments"],
            "year_settings": dept_data.get("year_settings", []),
        }
    ), 200


@hod_bp.route("/faculty", methods=["GET"])
@jwt_required()
@role_required("hod")
def list_department_faculty():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"faculty": []}), 200
    from utils.department_service import faculty_with_course_summaries

    return jsonify(
        {"faculty": faculty_with_course_summaries(user.department_id)}
    ), 200


@hod_bp.route("/faculty", methods=["POST"])
@jwt_required()
@role_required("hod")
def add_department_faculty():
    """HOD adds a faculty member to their own department."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Your account is not linked to a department."}), 400

    data = request.get_json(silent=True) or {}
    payload, errors = parse_staff_payload(
        {**data, "designation": "faculty"},
        "faculty",
        require_password=True,
    )
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    if User.query.filter_by(email=payload["email"]).first():
        return jsonify({"message": "Email is already registered."}), 409
    if not check_employee_id_unique(payload["employee_id"]):
        return jsonify({"message": "Employee ID is already in use."}), 409

    faculty = User(
        employee_id=payload["employee_id"],
        username=payload["employee_id"].lower(),
        email=payload["email"],
        mobile=payload["mobile"],
        role="faculty",
        designation="faculty",
        full_name=payload["name"],
        department_id=user.department_id,
        is_active=payload["is_active"],
    )
    faculty.set_password(payload["password"])
    db.session.add(faculty)
    db.session.commit()
    db.session.refresh(faculty)

    from utils.department_service import faculty_with_course_summaries

    dept_name = user.department_rel.name if user.department_rel else "your department"
    summary = next(
        (f for f in faculty_with_course_summaries(user.department_id) if f["id"] == faculty.id),
        faculty.to_dict(),
    )
    return jsonify(
        {
            "message": f"Faculty added to {dept_name} successfully.",
            "faculty": summary,
            "department": dept_name,
            "department_detail": user.department_rel.to_dict() if user.department_rel else None,
        }
    ), 201


@hod_bp.route("/faculty/<int:faculty_id>/access", methods=["PATCH"])
@jwt_required()
@role_required("hod")
def update_faculty_access(faculty_id):
    """HOD enables or disables faculty login access."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Your account is not linked to a department."}), 400

    data = request.get_json(silent=True) or {}
    if "is_active" not in data:
        return jsonify({"message": "is_active is required."}), 400

    faculty = User.query.filter_by(
        id=faculty_id, role="faculty", department_id=user.department_id
    ).first()
    if not faculty:
        return jsonify({"message": "Faculty not found in your department."}), 404

    faculty.is_active = bool(data["is_active"])
    db.session.commit()

    from utils.department_service import faculty_with_course_summaries

    summary = next(
        (f for f in faculty_with_course_summaries(user.department_id) if f["id"] == faculty.id),
        faculty.to_dict(),
    )
    status = "enabled" if faculty.is_active else "disabled"
    return jsonify(
        {"message": f"Faculty access {status}.", "faculty": summary}
    ), 200


@hod_bp.route("/courses", methods=["POST"])
@jwt_required()
@role_required("hod")
def add_course_with_assignment():
    """HOD adds a course and assigns faculty for a year."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Your account is not linked to a department."}), 400

    data = request.get_json(silent=True) or {}
    course_code = (data.get("course_code") or "").strip().upper()
    name = (data.get("name") or data.get("course_name") or "").strip()
    regulation = (data.get("regulation") or "").strip()
    try:
        year = int(data.get("year") or 0)
        faculty_id = int(data.get("faculty_id") or 0)
        semester = int(data.get("semester") or 0) or None
        class_number = int(data.get("class_number") or 0)
    except (TypeError, ValueError):
        year = 0
        faculty_id = 0
        semester = None
        class_number = 0

    errors = []
    if not course_code:
        errors.append("Course code is required.")
    if not name:
        errors.append("Course name is required.")
    if not regulation:
        errors.append("Regulation is required.")
    if year not in (1, 2, 3, 4):
        errors.append("Year must be 1, 2, 3, or 4.")
    if semester is not None:
        err = validate_year_semester(year, semester)
        if err:
            errors.append(err)
    if not faculty_id:
        errors.append("Faculty is required.")
    if class_number < 1:
        errors.append("Class is required.")

    from utils.department_service import get_department_year_class_counts

    if year in (1, 2, 3, 4) and class_number >= 1:
        max_class = get_department_year_class_counts(user.department_id).get(year, 1)
        if class_number > max_class:
            errors.append(f"Class must be between 1 and {max_class} for year {year}.")

    faculty = User.query.filter_by(
        id=faculty_id, role="faculty", department_id=user.department_id, is_active=True
    ).first()
    if faculty_id and not faculty:
        errors.append("Selected faculty must belong to your department.")

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    course = Course.query.filter_by(course_code=course_code).first()
    if course:
        if course.department_id != user.department_id:
            return jsonify({"message": "Course code belongs to another department."}), 409
        course.name = name
        course.regulation = regulation
    else:
        dept = user.department_rel
        course = Course(
            course_code=course_code,
            name=name,
            regulation=regulation,
            department_id=user.department_id,
            department_label=dept.name if dept else "",
        )
        db.session.add(course)
        db.session.flush()

    existing = CourseAssignment.query.filter_by(
        course_id=course.id, faculty_id=faculty_id, year=year, class_number=class_number
    ).first()
    if existing:
        return jsonify(
            {
                "message": "This faculty is already assigned to this course for that year and class."
            }
        ), 409

    assignment = CourseAssignment(
        course_id=course.id,
        faculty_id=faculty_id,
        year=year,
        semester=semester,
        class_number=class_number,
    )
    db.session.add(assignment)
    db.session.commit()

    item = course.to_dict()
    item["assignment"] = assignment.to_dict()
    item["staff_display"] = faculty.full_name
    return jsonify(
        {"message": "Course added and faculty assigned.", "course": item}
    ), 201


@hod_bp.route("/assignments/<int:assignment_id>", methods=["DELETE"])
@jwt_required()
@role_required("hod")
def delete_assignment(assignment_id):
    user = _current_hod()
    assignment = CourseAssignment.query.get(assignment_id)
    if not assignment or not assignment.course:
        return jsonify({"message": "Assignment not found."}), 404
    if assignment.course.department_id != user.department_id:
        return jsonify({"message": "Not allowed."}), 403

    delete_checklist_for_assignment(assignment_id)
    db.session.delete(assignment)
    db.session.commit()
    return jsonify({"message": "Assignment removed."}), 200


def _submission_summary(sheet: MarkSheet, faculty_name: str) -> dict:
    data = parse_submission_data(sheet.co_submission_data)
    report_type = "component_summary" if is_component_summary(data) else (data.get("reportType") or "weighted")
    final_co = data.get("finalCO") or {}
    student_summaries = data.get("studentSummaries") or []
    components = components_from_submission(data, sheet)
    component_labels = [resolve_component_label(c) for c in components]
    return {
        "id": sheet.id,
        "course_code": sheet.course_code,
        "course_name": sheet.course_name,
        "regulation": sheet.regulation,
        "year": sheet.year,
        "semester": sheet.semester,
        "department": sheet.department_label,
        "faculty_id": sheet.faculty_id,
        "faculty_name": faculty_name,
        "threshold": sheet.passing_threshold,
        "weightages": sheet.component_weightages or {},
        "used_cos": data.get("usedCOs") or [],
        "final_co": final_co,
        "report_type": report_type,
        "components": components,
        "component_labels": component_labels,
        "component_display": " · ".join(component_labels) if component_labels else "—",
        "student_count": len(student_summaries) or len(data.get("studentResults") or []),
        "submitted_at": sheet.co_submitted_at.isoformat() if sheet.co_submitted_at else None,
        "submission": data,
    }


def _expand_submissions_for_list(sheets: list, faculty_map: dict) -> list[dict]:
    """One table row per mark sheet component (CA1, CA2, Assignment, etc.)."""
    records = build_submission_records(sheets, faculty_map)
    return flatten_submission_rows(records)


@hod_bp.route("/co-submissions", methods=["GET"])
@jwt_required()
@role_required("hod")
def list_co_submissions():
    """List CO attainment reports submitted by faculty in the HOD's department."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"submissions": []}), 200

    sheets = marksheets_submitted_to_department(user.department_id)

    faculty_ids = {s.faculty_id for s in sheets}
    faculty_map = {
        u.id: u.full_name
        for u in User.query.filter(User.id.in_(faculty_ids)).all()
    } if faculty_ids else {}

    return jsonify(
        {"submissions": _expand_submissions_for_list(sheets, faculty_map)}
    ), 200


@hod_bp.route("/co-submissions/<int:sheet_id>", methods=["GET"])
@jwt_required()
@role_required("hod")
def get_co_submission(sheet_id):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    sheet = MarkSheet.query.filter_by(id=sheet_id, co_submitted=True).first()
    if not sheet or not hod_can_access_submission(user, sheet):
        return jsonify({"message": "Submission not found."}), 404

    faculty = User.query.get(sheet.faculty_id)
    return jsonify({"submission": _submission_summary(sheet, faculty.full_name if faculty else "")}), 200


@hod_bp.route("/checklist", methods=["GET"])
@jwt_required()
@role_required("hod")
def get_checklist():
    """Year / batch / section checklist with auto-tick from faculty component submissions."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"years": [], "summary": {"total": 0, "completed": 0, "pending": 0}}), 200

    return jsonify(build_checklist_tree(user.department_id)), 200


@hod_bp.route("/checklist", methods=["POST"])
@jwt_required()
@role_required("hod")
def add_checklist_item():
    """HOD assigns a mark sheet component to an assigned course."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Your account is not linked to a department."}), 400

    data = request.get_json(silent=True) or {}
    component_id = (data.get("component_id") or "").strip()
    component_label = (data.get("component_label") or data.get("component") or "").strip()

    try:
        assignment_id = int(data.get("course_assignment_id") or data.get("assignment_id") or 0)
    except (TypeError, ValueError):
        assignment_id = 0

    errors = []
    if not assignment_id:
        errors.append("Course assignment is required.")
    if not component_label and not component_id:
        errors.append("Mark sheet component is required.")

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    assignment = (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(
            CourseAssignment.id == assignment_id,
            Course.department_id == user.department_id,
        )
        .first()
    )
    if not assignment or not assignment.course:
        return jsonify({"message": "Course assignment not found in your department."}), 404

    course = assignment.course
    norm_id = norm_key(component_id or component_label)
    existing = HodChecklistItem.query.filter_by(
        course_assignment_id=assignment.id,
    ).all()
    for row in existing:
        if norm_key(row.component_id or row.component_label) == norm_id:
            return jsonify({"message": "This component is already assigned to the course."}), 409

    item = HodChecklistItem(
        department_id=user.department_id,
        course_assignment_id=assignment.id,
        year=assignment.year,
        semester=assignment.semester,
        course_code=course.course_code,
        course_name=course.name,
        component_id=component_id,
        component_label=component_label,
        created_by=user.id,
    )
    db.session.add(item)
    db.session.flush()

    if assignment.faculty_id:
        from utils.notification_service import notify_faculty_checklist_assignment

        notification = notify_faculty_checklist_assignment(
            faculty_id=assignment.faculty_id,
            hod_user=user,
            checklist_item=item,
            assignment=assignment,
        )
        if notification:
            db.session.add(notification)

    db.session.commit()

    from utils.checklist_service import collect_component_submissions, item_with_status

    submissions = collect_component_submissions(user.department_id)
    return jsonify(
        {
            "message": "Component assigned to course checklist.",
            "item": item_with_status(item, submissions, assignment.faculty_id),
        }
    ), 201


@hod_bp.route("/checklist/<int:item_id>", methods=["DELETE"])
@jwt_required()
@role_required("hod")
def delete_checklist_item(item_id):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from models import Notification

    item = HodChecklistItem.query.filter_by(
        id=item_id, department_id=user.department_id
    ).first()
    if not item:
        return jsonify({"message": "Checklist item not found."}), 404

    Notification.query.filter_by(checklist_item_id=item.id).delete(
        synchronize_session=False
    )
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Checklist item removed."}), 200


@hod_bp.route("/classes", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_list_classes():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"classes": []}), 200
    from utils.department_service import list_department_classes

    return jsonify({"classes": list_department_classes(user.department_id)}), 200


@hod_bp.route("/students", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_list_students():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"students": []}), 200
    from utils.department_service import (
        faculty_names_for_department_year,
        get_department_class_profiles,
        get_department_year_class_counts,
        list_department_students,
    )

    year = request.args.get("year")
    students = list_department_students(user.department_id, year=year)
    year_faculty = faculty_names_for_department_year(user.department_id, year)
    dept_name = (user.department_rel.name if user.department_rel else "") or ""
    class_profiles = []
    class_count = 1
    if year not in (None, "", "all"):
        try:
            year_int = int(year)
            class_profiles = get_department_class_profiles(user.department_id, year_int, dept_name)
            class_count = get_department_year_class_counts(user.department_id).get(year_int, 1)
        except (TypeError, ValueError):
            pass
    return jsonify(
        {
            "students": students,
            "year_faculty": year_faculty,
            "class_profiles": class_profiles,
            "class_count": class_count,
        }
    ), 200


@hod_bp.route("/students", methods=["POST"])
@jwt_required()
@role_required("hod")
def hod_add_student():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from models import Student

    data = request.get_json(silent=True) or {}
    register_number = (data.get("register_number") or "").strip()
    full_name = (data.get("full_name") or data.get("name") or "").strip()
    branch = (data.get("branch") or "Bachelor of Technology").strip()

    try:
        year = int(data.get("year") or 0)
        semester = int(data.get("semester") or 1)
    except (TypeError, ValueError):
        return jsonify({"message": "Valid year and semester are required."}), 400

    errors = []
    if not register_number:
        errors.append("Register number is required.")
    if not full_name:
        errors.append("Student name is required.")
    if year not in (1, 2, 3, 4):
        errors.append("Year must be between 1 and 4.")
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    if Student.query.filter_by(register_number=register_number).first():
        return jsonify({"message": "Register number already exists."}), 409

    dept = user.department_rel
    student = Student(
        register_number=register_number,
        full_name=full_name,
        branch=branch,
        department=dept.name if dept else "",
        year=year,
        semester=semester,
    )
    db.session.add(student)
    db.session.commit()
    return jsonify({"message": "Student added.", "student": student.to_dict()}), 201


@hod_bp.route("/students/bulk", methods=["POST"])
@jwt_required()
@role_required("hod")
def hod_add_students_bulk():
    """Save or update multiple students for the HOD department in one request."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from utils.department_service import save_class_student_roster

    data = request.get_json(silent=True) or {}
    entries = data.get("students") or []
    if not isinstance(entries, list) or not entries:
        return jsonify({"message": "Provide a non-empty students list."}), 400

    branch = (data.get("branch") or "Bachelor of Technology").strip()
    try:
        year = int(data.get("year") or 0)
        semester = int(data.get("semester") or 1)
        class_number = int(data.get("class_number") or 0)
    except (TypeError, ValueError):
        return jsonify({"message": "Valid year and semester are required."}), 400

    if year not in (1, 2, 3, 4):
        return jsonify({"message": "Year must be between 1 and 4."}), 400
    if class_number < 1:
        return jsonify({"message": "Class number is required for saving the name list."}), 400

    result, errors = save_class_student_roster(
        user.department_id,
        year,
        class_number,
        entries,
        branch=branch,
        semester=semester,
    )
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    created = result.get("created", 0)
    updated = result.get("updated", 0)
    total = result.get("count", 0)
    parts = []
    if created:
        parts.append(f"{created} added")
    if updated:
        parts.append(f"{updated} updated")
    summary = ", ".join(parts) if parts else f"{total} saved"

    return jsonify(
        {
            "message": f"Class {class_number} name list saved ({summary}).",
            "count": total,
            "created": created,
            "updated": updated,
            "class_profiles": result.get("class_profiles", []),
        }
    ), 200


@hod_bp.route("/students/<int:student_id>", methods=["PUT"])
@jwt_required()
@role_required("hod")
def hod_update_student(student_id):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from models import Student

    student = Student.query.get(student_id)
    if not student:
        return jsonify({"message": "Student not found."}), 404

    dept = user.department_rel
    if not dept or student.department.lower() != dept.name.lower():
        return jsonify({"message": "Student not in your department."}), 403

    data = request.get_json(silent=True) or {}
    register_number = (data.get("register_number") or student.register_number).strip()
    full_name = (data.get("full_name") or data.get("name") or student.full_name).strip()
    branch = (data.get("branch") or student.branch).strip()

    try:
        year = int(data.get("year") or student.year)
        semester = int(data.get("semester") or student.semester)
    except (TypeError, ValueError):
        return jsonify({"message": "Valid year and semester are required."}), 400

    if not register_number or not full_name:
        return jsonify({"message": "Register number and name are required."}), 400
    if year not in (1, 2, 3, 4):
        return jsonify({"message": "Year must be between 1 and 4."}), 400

    clash = Student.query.filter(
        Student.register_number == register_number, Student.id != student_id
    ).first()
    if clash:
        return jsonify({"message": "Register number already exists."}), 409

    student.register_number = register_number
    student.full_name = full_name
    student.branch = branch
    student.year = year
    student.semester = semester
    db.session.commit()
    return jsonify({"message": "Student updated.", "student": student.to_dict()}), 200


@hod_bp.route("/students/<int:student_id>", methods=["DELETE"])
@jwt_required()
@role_required("hod")
def hod_delete_student(student_id):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from models import Student

    student = Student.query.get(student_id)
    if not student:
        return jsonify({"message": "Student not found."}), 404

    dept = user.department_rel
    if not dept or student.department.lower() != dept.name.lower():
        return jsonify({"message": "Student not in your department."}), 403

    db.session.delete(student)
    db.session.commit()
    return jsonify({"message": "Student deleted."}), 200


@hod_bp.route("/year-settings", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_get_year_settings():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"year_settings": []}), 200
    from utils.department_service import (
        department_class_student_stats,
        get_department_year_settings,
    )

    cs = department_class_student_stats(user.department_id)
    return jsonify(
        {
            "year_settings": get_department_year_settings(
                user.department_id, cs.get("students_by_year")
            ),
        }
    ), 200


@hod_bp.route("/year-settings/<int:year>", methods=["PUT"])
@jwt_required()
@role_required("hod")
def hod_update_year_setting(year):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from utils.department_service import (
        department_class_student_stats,
        get_department_year_settings,
        set_department_year_setting,
    )

    data = request.get_json(silent=True) or {}
    row, errors = set_department_year_setting(
        user.department_id,
        year,
        class_count=data.get("class_count"),
        student_count=data.get("student_count"),
    )
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    cs = department_class_student_stats(user.department_id)
    settings = get_department_year_settings(user.department_id, cs.get("students_by_year"))
    setting = next((s for s in settings if s["year"] == year), None)
    parts = []
    if data.get("student_count") is not None:
        parts.append(f"{setting['student_count']} student(s)")
    if data.get("class_count") is not None:
        parts.append(f"{setting['class_count']} class(es)")
    summary = " and ".join(parts) if parts else "Settings updated"
    return jsonify(
        {
            "message": f"Year {year}: {summary}.",
            "setting": setting or row.to_dict(),
            "year_settings": settings,
        }
    ), 200


@hod_bp.route("/year-settings/<int:year>/class-profiles/<int:class_number>", methods=["PUT"])
@jwt_required()
@role_required("hod")
def hod_update_class_profile(year, class_number):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    from utils.department_service import get_department_class_profiles, upsert_department_class_profile

    data = request.get_json(silent=True) or {}
    profile, errors = upsert_department_class_profile(
        user.department_id, year, class_number, data
    )
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    dept_name = (user.department_rel.name if user.department_rel else "") or ""
    return jsonify(
        {
            "message": f"Class {class_number} details saved.",
            "profile": profile,
            "class_profiles": get_department_class_profiles(
                user.department_id, year, dept_name
            ),
        }
    ), 200


@hod_bp.route("/mark-list/filters", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_mark_list_filters():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"batches": [], "years": [], "semesters": [], "classes": [], "courses": [], "components": []}), 200
    from utils.hod_mark_list_service import mark_list_filter_options

    return jsonify(mark_list_filter_options(user.department_id)), 200


@hod_bp.route("/mark-list", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_mark_list_search():
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"students": [], "components": [], "course": None}), 200

    from utils.hod_mark_list_service import mark_list_search

    def _int_arg(name):
        try:
            v = request.args.get(name)
            return int(v) if v not in (None, "", "all") else None
        except (TypeError, ValueError):
            return None

    batch = (request.args.get("batch") or "").strip() or None
    assignment_id = _int_arg("assignment_id")
    result = mark_list_search(
        user.department_id,
        batch=batch,
        year=_int_arg("year"),
        semester=_int_arg("semester"),
        class_number=_int_arg("class_number"),
        assignment_id=assignment_id,
        component_id=(request.args.get("component_id") or "").strip() or None,
    )
    return jsonify(result), 200


@hod_bp.route("/co-attainment/course", methods=["GET"])
@jwt_required()
@role_required("hod")
def get_course_co_attainment():
    """Mark sheets + metadata for one assigned course (HOD view)."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    try:
        assignment_id = int(request.args.get("assignment_id") or 0)
    except (TypeError, ValueError):
        assignment_id = 0

    if not assignment_id:
        return jsonify({"message": "assignment_id is required."}), 400

    from utils.hod_co_attainment_service import (
        course_attainment_payload,
        get_assignment_for_hod,
    )

    assignment = get_assignment_for_hod(assignment_id, user.department_id)
    if not assignment:
        return jsonify({"message": "Course assignment not found in your department."}), 404

    payload = course_attainment_payload(assignment, user.department_id)
    return jsonify(payload), 200


@hod_bp.route("/co-attainment/year", methods=["GET"])
@jwt_required()
@role_required("hod")
def get_year_co_attainment():
    """All assigned courses in a year with mark sheets for year-level CO/PO view."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    try:
        year = int(request.args.get("year") or 0)
    except (TypeError, ValueError):
        year = 0

    semester = request.args.get("semester")
    sem_int = None
    if semester not in (None, "", "all"):
        try:
            sem_int = int(semester)
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid semester."}), 400

    if year not in (1, 2, 3, 4):
        return jsonify({"message": "Valid year (1–4) is required."}), 400

    from utils.hod_co_attainment_service import year_attainment_payload

    payload = year_attainment_payload(user.department_id, year, sem_int)
    return jsonify(payload), 200
