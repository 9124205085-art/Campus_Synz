from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import or_

from extensions import db
from models import (
    Course,
    CourseAssignment,
    Department,
    DepartmentYearSetting,
    DepartmentClassProfile,
    FacultyClassRoster,
    HodChecklistItem,
    MarkSheet,
    Notification,
    User,
)
from utils.decorators import role_required
from utils.helpers import generate_username, get_or_create_department, normalize_department_name
from utils.user_service import (
    check_dept_code_unique,
    check_employee_id_unique,
    parse_department_payload,
    parse_staff_payload,
)

admin_bp = Blueprint("admin", __name__)


def _user_list_item(user: User) -> dict:
    data = user.to_dict()
    data["name"] = user.full_name
    return data


# ---------- Users (admin dashboard) ----------

@admin_bp.route("/users", methods=["GET"])
@jwt_required()
@role_required("admin")
def list_users():
    search = (request.args.get("q") or request.args.get("search") or "").strip()
    role = (request.args.get("role") or "all").strip().lower()
    status = (request.args.get("status") or "all").strip().lower()

    try:
        page = max(1, int(request.args.get("page") or 1))
        per_page = min(50, max(5, int(request.args.get("per_page") or 10)))
    except (TypeError, ValueError):
        page = 1
        per_page = 10

    query = User.query
    if role and role != "all":
        query = query.filter(User.role == role)
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(User.is_active.is_(False))

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
                User.username.ilike(term),
                User.employee_id.ilike(term),
            )
        )

    total = query.count()
    users = (
        query.order_by(User.id.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    total_pages = max(1, (total + per_page - 1) // per_page)

    return jsonify(
        {
            "users": [_user_list_item(u) for u in users],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": total_pages,
            },
        }
    ), 200


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404
    return jsonify({"user": _user_list_item(user)}), 200


@admin_bp.route("/users/<int:user_id>/status", methods=["PATCH"])
@jwt_required()
@role_required("admin")
def set_user_status(user_id):
    admin_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    if "is_active" not in data:
        return jsonify({"message": "is_active is required."}), 400

    is_active = bool(data.get("is_active"))
    if user.id == admin_id and not is_active:
        return jsonify({"message": "You cannot deactivate your own admin account."}), 400

    user.is_active = is_active
    db.session.commit()
    action = "activated" if is_active else "deactivated"
    return jsonify(
        {"message": f"User {action} successfully.", "user": _user_list_item(user)}
    ), 200


@admin_bp.route("/users/<int:user_id>/reset-password", methods=["POST"])
@jwt_required()
@role_required("admin")
def reset_user_password(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    password = (data.get("password") or "").strip()
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400

    user.set_password(password)
    db.session.commit()
    return jsonify({"message": f"Password reset for {user.full_name}."}), 200


def _resolve_department(data, required=True):
    department_id = data.get("department_id")
    department_name = (data.get("department") or data.get("departments") or "").strip()

    if department_id not in (None, "", 0, "0"):
        try:
            dept_id = int(department_id)
        except (TypeError, ValueError):
            return None, ["Invalid department selected."]
        department = Department.query.get(dept_id)
        if not department:
            return None, ["Selected department not found."]
        return department, []

    if department_name:
        return get_or_create_department(department_name), []

    if required:
        return None, ["Department is required."]
    return None, []


def _validate_user_fields(data, require_password=True):
    name = (data.get("name") or data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    errors = []
    if not name:
        errors.append("Name is required.")
    if not email:
        errors.append("Email is required.")
    if require_password and (not password or len(password) < 6):
        errors.append("Password must be at least 6 characters.")

    return name, email, password, errors


def _department_detail(dept: Department) -> dict:
    data = dept.to_dict()
    data["hod_count"] = User.query.filter_by(role="hod", department_id=dept.id).count()
    data["faculty_count"] = User.query.filter_by(role="faculty", department_id=dept.id).count()
    data["course_count"] = Course.query.filter_by(department_id=dept.id).count()
    return data


# ---------- Departments ----------

@admin_bp.route("/departments", methods=["GET"])
@jwt_required()
@role_required("admin")
def list_departments():
    departments = Department.query.order_by(Department.name).all()
    return jsonify({"departments": [_department_detail(d) for d in departments]}), 200


@admin_bp.route("/departments", methods=["POST"])
@jwt_required()
@role_required("admin")
def add_department():
    data = request.get_json(silent=True) or {}
    payload, errors = parse_department_payload(data)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    name = normalize_department_name(payload["name"])
    if Department.query.filter(db.func.lower(Department.name) == name.lower()).first():
        return jsonify({"message": "Department name already exists."}), 409
    if not check_dept_code_unique(payload["code"]):
        return jsonify({"message": "Department code already exists."}), 409

    dept = Department(
        name=name,
        code=payload["code"],
        degree=payload["degree"],
        duration=payload["duration"],
        status=payload["status"],
    )
    db.session.add(dept)
    db.session.commit()
    return jsonify({"message": "Department added.", "department": _department_detail(dept)}), 201


@admin_bp.route("/departments/<int:dept_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_department(dept_id):
    dept = Department.query.get(dept_id)
    if not dept:
        return jsonify({"message": "Department not found."}), 404
    return jsonify({"department": _department_detail(dept)}), 200


@admin_bp.route("/departments/<int:dept_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_department(dept_id):
    dept = Department.query.get(dept_id)
    if not dept:
        return jsonify({"message": "Department not found."}), 404

    data = request.get_json(silent=True) or {}
    payload, errors = parse_department_payload(data)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    name = normalize_department_name(payload["name"])
    clash = Department.query.filter(
        db.func.lower(Department.name) == name.lower(), Department.id != dept_id
    ).first()
    if clash:
        return jsonify({"message": "Another department with this name exists."}), 409
    if not check_dept_code_unique(payload["code"], dept_id):
        return jsonify({"message": "Department code already exists."}), 409

    dept.name = name
    dept.code = payload["code"]
    dept.degree = payload["degree"]
    dept.duration = payload["duration"]
    dept.status = payload["status"]
    db.session.commit()
    return jsonify({"message": "Department updated.", "department": _department_detail(dept)}), 200


@admin_bp.route("/departments/<int:dept_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_department(dept_id):
    dept = Department.query.get(dept_id)
    if not dept:
        return jsonify({"message": "Department not found."}), 404

    _delete_department_related(dept_id)
    db.session.delete(dept)
    db.session.commit()
    return jsonify({"message": "Department deleted."}), 200


# ---------- HODs ----------

@admin_bp.route("/hods", methods=["GET"])
@jwt_required()
@role_required("admin")
def list_hods():
    hods = User.query.filter_by(role="hod").order_by(User.created_at.desc()).all()
    return jsonify({"hods": [u.to_dict() for u in hods]}), 200


@admin_bp.route("/hods/<int:user_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_hod(user_id):
    user = User.query.filter_by(id=user_id, role="hod").first()
    if not user:
        return jsonify({"message": "HOD not found."}), 404
    return jsonify({"user": user.to_dict()}), 200


def _create_staff_user(data, default_role):
    payload, errors = parse_staff_payload(data, default_role, require_password=True)
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return None, errors

    if User.query.filter_by(email=payload["email"]).first():
        return None, ["Email is already registered."]
    if not check_employee_id_unique(payload["employee_id"]):
        return None, ["Employee ID is already in use."]

    user = User(
        employee_id=payload["employee_id"],
        username=payload["employee_id"].lower(),
        email=payload["email"],
        mobile=payload["mobile"],
        role=payload["role"],
        designation=payload["designation"],
        full_name=payload["name"],
        department_id=department.id,
        is_active=payload["is_active"],
    )
    user.set_password(payload["password"])
    return user, []


def _update_staff_user(user, data):
    payload, errors = parse_staff_payload(
        data, user.role, require_password=bool(data.get("password"))
    )
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return errors

    existing = User.query.filter(User.email == payload["email"], User.id != user.id).first()
    if existing:
        return ["Email is already used by another user."]
    if not check_employee_id_unique(payload["employee_id"], user.id):
        return ["Employee ID is already in use."]

    user.employee_id = payload["employee_id"]
    user.username = payload["employee_id"].lower()
    user.full_name = payload["name"]
    user.email = payload["email"]
    user.mobile = payload["mobile"]
    user.role = payload["role"]
    user.designation = payload["designation"]
    user.department_id = department.id
    user.is_active = payload["is_active"]
    if payload["password"]:
        user.set_password(payload["password"])
    return []


@admin_bp.route("/hod", methods=["POST"])
@jwt_required()
@role_required("admin")
def add_hod():
    data = request.get_json(silent=True) or {}
    user, errors = _create_staff_user(data, "hod")
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "HOD added successfully.", "user": user.to_dict()}), 201


@admin_bp.route("/hods/<int:user_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_hod(user_id):
    user = User.query.filter_by(id=user_id, role="hod").first()
    if not user:
        return jsonify({"message": "HOD not found."}), 404

    data = request.get_json(silent=True) or {}
    errors = _update_staff_user(user, data)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    db.session.commit()
    return jsonify({"message": "HOD updated successfully.", "user": user.to_dict()}), 200


@admin_bp.route("/hods/<int:user_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_hod(user_id):
    user = User.query.filter_by(id=user_id, role="hod").first()
    if not user:
        return jsonify({"message": "HOD not found."}), 404

    _delete_hod_related(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "HOD deleted successfully."}), 200


def _delete_hod_related(user_id: int) -> None:
    HodChecklistItem.query.filter_by(created_by=user_id).update(
        {HodChecklistItem.created_by: None}, synchronize_session=False
    )
    Notification.query.filter_by(user_id=user_id).delete(synchronize_session=False)


def _delete_faculty_related(user_id: int) -> None:
    MarkSheet.query.filter_by(faculty_id=user_id).delete(synchronize_session=False)
    FacultyClassRoster.query.filter_by(faculty_id=user_id).delete(synchronize_session=False)
    CourseAssignment.query.filter_by(faculty_id=user_id).delete(synchronize_session=False)


def _delete_course_related(course_id: int) -> None:
    HodChecklistItem.query.filter(
        HodChecklistItem.course_assignment_id.in_(
            db.session.query(CourseAssignment.id).filter_by(course_id=course_id)
        )
    ).delete(synchronize_session=False)
    assignment_ids = [
        a.id for a in CourseAssignment.query.filter_by(course_id=course_id).all()
    ]
    if assignment_ids:
        MarkSheet.query.filter(MarkSheet.course_assignment_id.in_(assignment_ids)).delete(
            synchronize_session=False
        )
    CourseAssignment.query.filter_by(course_id=course_id).delete(synchronize_session=False)


def _delete_department_related(dept_id: int) -> None:
    for course in Course.query.filter_by(department_id=dept_id).all():
        _delete_course_related(course.id)
        db.session.delete(course)

    for user in User.query.filter_by(department_id=dept_id).all():
        if user.role == "admin":
            user.department_id = None
            continue
        if user.role == "faculty":
            _delete_faculty_related(user.id)
        elif user.role == "hod":
            _delete_hod_related(user.id)
        db.session.delete(user)

    HodChecklistItem.query.filter_by(department_id=dept_id).delete(synchronize_session=False)
    DepartmentYearSetting.query.filter_by(department_id=dept_id).delete(synchronize_session=False)
    DepartmentClassProfile.query.filter_by(department_id=dept_id).delete(synchronize_session=False)
    MarkSheet.query.filter_by(department_id=dept_id).delete(synchronize_session=False)


# ---------- Faculty ----------

@admin_bp.route("/faculty-list", methods=["GET"])
@jwt_required()
@role_required("admin")
def list_faculty():
    faculty = User.query.filter_by(role="faculty").order_by(User.created_at.desc()).all()
    return jsonify({"faculty": [u.to_dict() for u in faculty]}), 200


@admin_bp.route("/faculty/<int:user_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_faculty(user_id):
    user = User.query.filter_by(id=user_id, role="faculty").first()
    if not user:
        return jsonify({"message": "Faculty not found."}), 404
    return jsonify({"user": user.to_dict()}), 200


@admin_bp.route("/faculty", methods=["POST"])
@jwt_required()
@role_required("admin")
def add_faculty():
    data = request.get_json(silent=True) or {}
    user, errors = _create_staff_user(data, "faculty")
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "Faculty added successfully.", "user": user.to_dict()}), 201


@admin_bp.route("/faculty/<int:user_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_faculty(user_id):
    user = User.query.filter_by(id=user_id, role="faculty").first()
    if not user:
        return jsonify({"message": "Faculty not found."}), 404

    data = request.get_json(silent=True) or {}
    errors = _update_staff_user(user, data)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    db.session.commit()
    return jsonify({"message": "Faculty updated successfully.", "user": user.to_dict()}), 200


@admin_bp.route("/faculty/<int:user_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_faculty(user_id):
    user = User.query.filter_by(id=user_id, role="faculty").first()
    if not user:
        return jsonify({"message": "Faculty not found."}), 404

    _delete_faculty_related(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "Faculty deleted successfully."}), 200


# ---------- Courses ----------

@admin_bp.route("/courses", methods=["GET"])
@jwt_required()
@role_required("admin")
def list_courses():
    courses = Course.query.order_by(Course.created_at.desc()).all()
    result = []
    for course in courses:
        item = course.to_dict()
        item["staff"] = _staff_for_department(course.department_id)
        result.append(item)
    return jsonify({"courses": result}), 200


@admin_bp.route("/courses/<int:course_id>", methods=["GET"])
@jwt_required()
@role_required("admin")
def get_course(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({"message": "Course not found."}), 404
    item = course.to_dict()
    item["staff"] = _staff_for_department(course.department_id)
    return jsonify({"course": item}), 200


@admin_bp.route("/course", methods=["POST"])
@jwt_required()
@role_required("admin")
def add_course():
    data = request.get_json(silent=True) or {}

    course_code = (data.get("course_code") or "").strip().upper()
    name = (data.get("name") or data.get("course_name") or "").strip()
    regulation = (data.get("regulation") or "").strip()
    department, dept_errors = _resolve_department(data)

    errors = list(dept_errors)
    if not course_code:
        errors.append("Course code is required.")
    if not name:
        errors.append("Course name is required.")
    if not regulation:
        errors.append("Regulation is required.")

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    if Course.query.filter_by(course_code=course_code).first():
        return jsonify({"message": "Course code already exists."}), 409

    course = Course(
        course_code=course_code,
        name=name,
        regulation=regulation,
        department_id=department.id,
        department_label=department.name,
    )
    db.session.add(course)
    db.session.commit()

    item = course.to_dict()
    item["staff"] = _staff_for_department(course.department_id)
    return jsonify({"message": "Course added successfully.", "course": item}), 201


@admin_bp.route("/courses/<int:course_id>", methods=["PUT"])
@jwt_required()
@role_required("admin")
def update_course(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({"message": "Course not found."}), 404

    data = request.get_json(silent=True) or {}
    course_code = (data.get("course_code") or course.course_code).strip().upper()
    name = (data.get("name") or course.name).strip()
    regulation = (data.get("regulation") or course.regulation).strip()
    department, dept_errors = _resolve_department(data)

    errors = list(dept_errors)
    if not course_code:
        errors.append("Course code is required.")
    if not name:
        errors.append("Course name is required.")
    if not regulation:
        errors.append("Regulation is required.")

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    clash = Course.query.filter(Course.course_code == course_code, Course.id != course_id).first()
    if clash:
        return jsonify({"message": "Course code already exists."}), 409

    course.course_code = course_code
    course.name = name
    course.regulation = regulation
    course.department_id = department.id
    course.department_label = department.name
    db.session.commit()

    item = course.to_dict()
    item["staff"] = _staff_for_department(course.department_id)
    return jsonify({"message": "Course updated successfully.", "course": item}), 200


@admin_bp.route("/courses/<int:course_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_course(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({"message": "Course not found."}), 404

    _delete_course_related(course_id)
    db.session.delete(course)
    db.session.commit()
    return jsonify({"message": "Course deleted successfully."}), 200


def _staff_for_department(department_id):
    if not department_id:
        return []
    faculty = User.query.filter_by(role="faculty", department_id=department_id).all()
    return [{"id": f.id, "full_name": f.full_name, "email": f.email} for f in faculty]
