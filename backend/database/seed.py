"""Seed default admin account for fresh deployments."""

from extensions import db
from models import User
from utils.helpers import get_or_create_department


def seed_users():
    """Create default admin account if it does not exist."""
    admin_dept = get_or_create_department("Administration")

    admin_data = {
        "username": "admin",
        "email": "admin@kcgcollege.edu",
        "password": "Admin@123",
        "role": "admin",
        "full_name": "System Administrator",
        "department_id": admin_dept.id,
    }

    existing = User.query.filter_by(username=admin_data["username"]).first()
    if existing:
        if not existing.department_id:
            existing.department_id = admin_data["department_id"]
        db.session.commit()
        return

    user = User(
        username=admin_data["username"],
        email=admin_data["email"],
        role=admin_data["role"],
        full_name=admin_data["full_name"],
        department_id=admin_data["department_id"],
    )
    user.set_password(admin_data["password"])
    db.session.add(user)
    db.session.commit()
