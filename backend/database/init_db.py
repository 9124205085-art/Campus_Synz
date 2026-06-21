"""Initialize SQLite database and seed default admin user."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from database.migrate_departments import migrate
from database.migrate_marksheet_v2 import migrate as migrate_marksheet_v2
from database.migrate_rbac_v1 import migrate as migrate_rbac_v1
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


def init_database():
    app = create_app()
    with app.app_context():
        os.makedirs(os.path.join(os.path.dirname(__file__)), exist_ok=True)

        db.create_all()
        migrate()
        migrate_marksheet_v2()
        migrate_rbac_v1()
        seed_users()

        print("Database initialized successfully.")
        print("Default credentials:")
        print("  Admin -> admin@kcgcollege.edu / Admin@123")
        print("  Sign in as admin, then create departments and assign HOD accounts.")


if __name__ == "__main__":
    init_database()
