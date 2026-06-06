"""Initialize SQLite database and seed default users, departments, and course frameworks."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from database.migrate_departments import migrate
from database.migrate_marksheet_v2 import migrate as migrate_marksheet_v2
from database.migrate_rbac_v1 import migrate as migrate_rbac_v1
from database.seed_students import seed_students
from extensions import db
from models import User, Course  # Imported Course model definition here
from utils.helpers import get_or_create_department


def seed_users():
    """Create default Admin, HOD, and Faculty accounts if they do not exist."""
    admin_dept = get_or_create_department("Administration")
    cse_dept = get_or_create_department("Computer Science")
    it_dept = get_or_create_department("B.Tech Information Technology")

    default_users = [
        {
            "username": "admin",
            "email": "admin@kcgcollege.edu",
            "password": "Admin@123",
            "role": "admin",
            "full_name": "System Administrator",
            "department_id": admin_dept.id,
        },
        {
            "username": "hod_cse",
            "email": "hod.cse@kcgcollege.edu",
            "password": "Hod@123",
            "role": "hod",
            "full_name": "Dr. R. Kumar",
            "department_id": cse_dept.id,
        },
        {
            "username": "faculty_cse",
            "email": "faculty.cse@kcgcollege.edu",
            "password": "Faculty@123",
            "role": "faculty",
            "full_name": "Prof. S. Priya",
            "department_id": cse_dept.id,
        },
        {
            "username": "hod_it",
            "email": "hod.it@kcgcollege.edu",
            "password": "Hod@123",
            "role": "hod",
            "full_name": "Dr. IT HOD",
            "department_id": it_dept.id,
        },
    ]

    for data in default_users:
        existing = User.query.filter_by(username=data["username"]).first()
        if existing:
            if not existing.department_id:
                existing.department_id = data["department_id"]
            continue

        user = User(
            username=data["username"],
            email=data["email"],
            role=data["role"],
            full_name=data["full_name"],
            department_id=data["department_id"],
        )
        user.set_password(data["password"])
        db.session.add(user)

    db.session.commit()


def seed_courses():
    """Seed baseline department courses linked to their respective operational IDs."""
    it_dept = get_or_create_department("B.Tech Information Technology")
    
    # Define baseline tracking structures expected by frontend select arrays
    default_courses = [
        {
            "course_code": "CS101",
            "name": "Data Structure",
            "regulation": "R2021",
            "department_id": it_dept.id
        }
    ]
    
    for c_data in default_courses:
        existing_course = Course.query.filter_by(course_code=c_data["course_code"]).first()
        if not existing_course:
            course = Course(
                course_code=c_data["course_code"],
                name=c_data["name"],
                regulation=c_data["regulation"],
                department_id=c_data["department_id"]
            )
            # Synchronize legacy fields built into your custom database classes
            course.sync_department_label()
            db.session.add(course)
            
    db.session.commit()
    print("  Seeded default academic course records framework successfully.")


def init_database():
    app = create_app()
    with app.app_context():
        os.makedirs(os.path.join(os.path.dirname(__file__)), exist_ok=True)
        
        # Fresh table structure validation
        db.create_all()
        migrate()
        migrate_marksheet_v2()
        migrate_rbac_v1()
        seed_users()
        seed_courses()  # Added execution step here
        
        n = seed_students()
        if n:
            print(f"  Seeded {n} student(s) for mark sheets.")
        print("Database initialized successfully.")
        print("Default credentials:")
        print("  Admin   -> admin@kcgcollege.edu / Admin@123")
        print("  HOD IT  -> hod.it@kcgcollege.edu / Hod@123 (B.Tech Information Technology)")


if __name__ == "__main__":
    init_database()