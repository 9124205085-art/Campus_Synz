"""
Run this ONCE from your backend folder:
    python database/migrate_co_columns.py

It adds passing_threshold and component_weightages columns to the
existing mark_sheets table without destroying any data.
"""

import sqlite3
import os

# Adjust this path if your college.db is elsewhere
DB_PATH = os.path.join(os.path.dirname(__file__), "college.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(mark_sheets)")
    existing = {row[1] for row in cursor.fetchall()}
    print(f"Existing columns: {existing}")

    added = []

    if "passing_threshold" not in existing:
        cursor.execute(
            "ALTER TABLE mark_sheets ADD COLUMN passing_threshold REAL DEFAULT 60.0"
        )
        added.append("passing_threshold")

    if "component_weightages" not in existing:
        cursor.execute(
            "ALTER TABLE mark_sheets ADD COLUMN component_weightages TEXT DEFAULT '{}'"
        )
        added.append("component_weightages")

    conn.commit()
    conn.close()

    if added:
        print(f"✅ Added columns: {', '.join(added)}")
    else:
        print("✅ All columns already exist — nothing to do.")

if __name__ == "__main__":
    migrate()
