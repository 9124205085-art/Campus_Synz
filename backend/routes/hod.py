from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from extensions import db
from models import Course, CourseAssignment, MarkSheet, User
from utils.decorators import role_required
from utils.department_service import get_department_dashboard_data
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
            "stats": {
                "faculty_count": len(dept_data.get("faculty_with_courses") or dept_data["staff"]),
                "courses_count": len(dept_data["courses"]),
                "assignments_count": len(dept_data["assignments"]),
            },
            "staff": dept_data["staff"],
            "faculty_with_courses": dept_data.get("faculty_with_courses", []),
            "courses": dept_data["courses"],
            "assignments": dept_data["assignments"],
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

    from utils.department_service import faculty_with_course_summaries

    summary = next(
        (f for f in faculty_with_course_summaries(user.department_id) if f["id"] == faculty.id),
        faculty.to_dict(),
    )
    return jsonify({"message": "Faculty added successfully.", "faculty": summary}), 201


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
    except (TypeError, ValueError):
        year = 0
        faculty_id = 0
        semester = None

    errors = []
    if not course_code:
        errors.append("Course code is required.")
    if not name:
        errors.append("Course name is required.")
    if not regulation:
        errors.append("Regulation is required.")
    if year not in (1, 2, 3, 4):
        errors.append("Year must be 1, 2, 3, or 4.")
    if not faculty_id:
        errors.append("Faculty is required.")

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
        course_id=course.id, faculty_id=faculty_id, year=year
    ).first()
    if existing:
        return jsonify(
            {"message": "This faculty is already assigned to this course for that year."}
        ), 409

    assignment = CourseAssignment(
        course_id=course.id,
        faculty_id=faculty_id,
        year=year,
        semester=semester,
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

    db.session.delete(assignment)
    db.session.commit()
    return jsonify({"message": "Assignment removed."}), 200


def _submission_summary(sheet: MarkSheet, faculty_name: str) -> dict:
    data = sheet.co_submission_data or {}
    final_co = data.get("finalCO") or {}
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
        "student_count": len(data.get("studentResults") or []),
        "submitted_at": sheet.co_submitted_at.isoformat() if sheet.co_submitted_at else None,
        "submission": data,
    }


@hod_bp.route("/co-submissions", methods=["GET"])
@jwt_required()
@role_required("hod")
def list_co_submissions():
    """List CO attainment reports submitted by faculty in the HOD's department."""
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"submissions": []}), 200

    sheets = (
        MarkSheet.query.filter_by(
            department_id=user.department_id,
            co_submitted=True,
        )
        .order_by(MarkSheet.co_submitted_at.desc())
        .all()
    )

    faculty_ids = {s.faculty_id for s in sheets}
    faculty_map = {
        u.id: u.full_name
        for u in User.query.filter(User.id.in_(faculty_ids)).all()
    } if faculty_ids else {}

    return jsonify(
        {
            "submissions": [
                _submission_summary(s, faculty_map.get(s.faculty_id, ""))
                for s in sheets
            ]
        }
    ), 200


@hod_bp.route("/co-submissions/<int:sheet_id>", methods=["GET"])
@jwt_required()
@role_required("hod")
def get_co_submission(sheet_id):
    user = _current_hod()
    if not user or not user.department_id:
        return jsonify({"message": "Department not linked."}), 400

    sheet = MarkSheet.query.filter_by(
        id=sheet_id,
        department_id=user.department_id,
        co_submitted=True,
    ).first()
    if not sheet:
        return jsonify({"message": "Submission not found."}), 404

    faculty = User.query.get(sheet.faculty_id)
    return jsonify({"submission": _submission_summary(sheet, faculty.full_name if faculty else "")}), 200
