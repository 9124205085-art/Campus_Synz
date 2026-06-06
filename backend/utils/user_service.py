"""User and department validation helpers for admin/HOD."""

from models import DEGREE_OPTIONS, DESIGNATION_OPTIONS, STATUS_OPTIONS, Department, User


def parse_department_payload(data):
    name = (data.get("name") or "").strip()
    code = (data.get("code") or "").strip().upper()
    degree = (data.get("degree") or "B.Tech").strip()
    try:
        duration = int(data.get("duration") or 4)
    except (TypeError, ValueError):
        duration = 0
    status = (data.get("status") or "active").strip().lower()

    errors = []
    if not name:
        errors.append("Department name is required.")
    if not code:
        errors.append("Department code is required.")
    if degree not in DEGREE_OPTIONS:
        errors.append(f"Degree must be one of: {', '.join(DEGREE_OPTIONS)}.")
    if duration < 1 or duration > 6:
        errors.append("Duration must be between 1 and 6 years.")
    if status not in STATUS_OPTIONS:
        errors.append("Status must be active or inactive.")

    return {"name": name, "code": code, "degree": degree, "duration": duration, "status": status}, errors


def parse_staff_payload(data, default_role, require_password=True):
    employee_id = (data.get("employee_id") or "").strip().upper()
    name = (data.get("name") or data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    mobile = (data.get("mobile") or "").strip()
    password = data.get("password") or ""
    designation = (data.get("designation") or default_role).strip().lower()
    is_active = data.get("is_active", True)
    if isinstance(is_active, str):
        is_active = is_active.lower() in ("true", "1", "active", "yes")

    role = designation if designation in ("hod", "faculty") else default_role

    errors = []
    if not employee_id:
        errors.append("Employee ID is required.")
    if not name:
        errors.append("Name is required.")
    if not email:
        errors.append("Email is required.")
    if not mobile or len(mobile) < 10:
        errors.append("Valid mobile number is required.")
    if require_password and (not password or len(password) < 6):
        errors.append("Password must be at least 6 characters.")
    if designation not in DESIGNATION_OPTIONS:
        errors.append("Designation must be HOD or Faculty.")

    return {
        "employee_id": employee_id,
        "name": name,
        "email": email,
        "mobile": mobile,
        "password": password,
        "role": role,
        "designation": designation,
        "is_active": bool(is_active),
    }, errors


def check_employee_id_unique(employee_id, exclude_user_id=None):
    q = User.query.filter_by(employee_id=employee_id)
    if exclude_user_id:
        q = q.filter(User.id != exclude_user_id)
    return q.first() is None


def check_dept_code_unique(code, exclude_dept_id=None):
    q = Department.query.filter_by(code=code)
    if exclude_dept_id:
        q = q.filter(Department.id != exclude_dept_id)
    return q.first() is None
