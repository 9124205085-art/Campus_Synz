from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from extensions import db
from models import Course, Department, User
from utils.decorators import role_required
from utils.helpers import generate_username, get_or_create_department, normalize_department_name

admin_bp = Blueprint("admin", __name__)


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
    name = normalize_department_name(data.get("name") or "")
    if not name:
        return jsonify({"message": "Department name is required."}), 400

    existing = Department.query.filter(db.func.lower(Department.name) == name.lower()).first()
    if existing:
        return jsonify({"message": "Department already exists."}), 409

    dept = Department(name=name)
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
    name = normalize_department_name(data.get("name") or "")
    if not name:
        return jsonify({"message": "Department name is required."}), 400

    clash = Department.query.filter(
        db.func.lower(Department.name) == name.lower(), Department.id != dept_id
    ).first()
    if clash:
        return jsonify({"message": "Another department with this name exists."}), 409

    dept.name = name
    db.session.commit()
    return jsonify({"message": "Department updated.", "department": _department_detail(dept)}), 200


@admin_bp.route("/departments/<int:dept_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_department(dept_id):
    dept = Department.query.get(dept_id)
    if not dept:
        return jsonify({"message": "Department not found."}), 404

    if User.query.filter_by(department_id=dept_id).count() > 0:
        return jsonify({"message": "Cannot delete department with assigned HOD or faculty."}), 400
    if Course.query.filter_by(department_id=dept_id).count() > 0:
        return jsonify({"message": "Cannot delete department with assigned courses."}), 400

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


@admin_bp.route("/hod", methods=["POST"])
@jwt_required()
@role_required("admin")
def add_hod():
    data = request.get_json(silent=True) or {}
    name, email, password, errors = _validate_user_fields(data, require_password=True)
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email is already registered."}), 409

    user = User(
        username=generate_username(email),
        email=email,
        role="hod",
        full_name=name,
        department_id=department.id,
    )
    user.set_password(password)
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
    name, email, password, errors = _validate_user_fields(data, require_password=False)
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    existing = User.query.filter(User.email == email, User.id != user_id).first()
    if existing:
        return jsonify({"message": "Email is already used by another user."}), 409

    user.full_name = name
    user.email = email
    user.department_id = department.id
    if password:
        user.set_password(password)

    db.session.commit()
    return jsonify({"message": "HOD updated successfully.", "user": user.to_dict()}), 200


@admin_bp.route("/hods/<int:user_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_hod(user_id):
    user = User.query.filter_by(id=user_id, role="hod").first()
    if not user:
        return jsonify({"message": "HOD not found."}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "HOD deleted successfully."}), 200


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
    name, email, password, errors = _validate_user_fields(data, require_password=True)
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email is already registered."}), 409

    user = User(
        username=generate_username(email),
        email=email,
        role="faculty",
        full_name=name,
        department_id=department.id,
    )
    user.set_password(password)
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
    name, email, password, errors = _validate_user_fields(data, require_password=False)
    department, dept_errors = _resolve_department(data)
    errors.extend(dept_errors)

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    existing = User.query.filter(User.email == email, User.id != user_id).first()
    if existing:
        return jsonify({"message": "Email is already used by another user."}), 409

    user.full_name = name
    user.email = email
    user.department_id = department.id
    if password:
        user.set_password(password)

    db.session.commit()
    return jsonify({"message": "Faculty updated successfully.", "user": user.to_dict()}), 200


@admin_bp.route("/faculty/<int:user_id>", methods=["DELETE"])
@jwt_required()
@role_required("admin")
def delete_faculty(user_id):
    user = User.query.filter_by(id=user_id, role="faculty").first()
    if not user:
        return jsonify({"message": "Faculty not found."}), 404

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

    db.session.delete(course)
    db.session.commit()
    return jsonify({"message": "Course deleted successfully."}), 200


def _staff_for_department(department_id):
    if not department_id:
        return []
    faculty = User.query.filter_by(role="faculty", department_id=department_id).all()
    return [{"id": f.id, "full_name": f.full_name, "email": f.email} for f in faculty]
