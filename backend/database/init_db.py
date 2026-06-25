"""Initialize SQLite database and seed default admin user."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from database.migrate_departments import migrate
from database.migrate_marksheet_v2 import migrate as migrate_marksheet_v2
from database.migrate_rbac_v1 import migrate as migrate_rbac_v1
from database.seed import seed_users
from extensions import db


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
