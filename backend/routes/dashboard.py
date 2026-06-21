from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import Department, User
from utils.decorators import role_required
from utils.department_service import _hod_stats_from_dept_data, get_department_dashboard_data

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/admin", methods=["GET"])
@jwt_required()
@role_required("admin")
def admin_dashboard():
    from models import Course

    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    inactive_users = User.query.filter_by(is_active=False).count()
    total_admins = User.query.filter_by(role="admin").count()

    return jsonify(
        {
            "message": "Welcome to the Admin Dashboard",
            "stats": {
                "total_users": total_users,
                "active_users": active_users,
                "inactive_users": inactive_users,
                "total_admins": total_admins,
                "total_hods": User.query.filter_by(role="hod").count(),
                "total_faculty": User.query.filter_by(role="faculty").count(),
                "total_courses": Course.query.count(),
                "departments": Department.query.count(),
            },
        }
    ), 200


@dashboard_bp.route("/hod", methods=["GET"])
@jwt_required()
@role_required("hod")
def hod_dashboard():
    user = User.query.get(int(get_jwt_identity()))
    dept_data = get_department_dashboard_data(user.department_id if user else None)

    return jsonify(
        {
            "message": f"Welcome, {user.full_name if user else 'HOD'}",
            "user": user.to_dict() if user else None,
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


@dashboard_bp.route("/faculty", methods=["GET"])
@jwt_required()
@role_required("faculty")
def faculty_dashboard():
    user = User.query.get(int(get_jwt_identity()))
    dept_data = get_department_dashboard_data(
        user.department_id if user else None,
        faculty_id=user.id if user else None,
    )

    return jsonify(
        {
            "message": f"Welcome, {user.full_name if user else 'Faculty'}",
            "user": user.to_dict() if user else None,
            "department": dept_data["department"],
            "department_detail": dept_data["department_detail"],
            "department_connected": dept_data["connected"],
            "stats": {
                "courses_count": len(dept_data["courses"]),
                "assigned_courses_count": len(dept_data["courses"]),
            },
            "assigned_courses": dept_data["courses"],
            "courses": dept_data["courses"],
            "staff": dept_data["staff"],
        }
    ), 200
