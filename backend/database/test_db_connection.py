"""Test database connection using backend/.env DATABASE_URL."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine, text

from config import build_database_uri


def main():
    uri = build_database_uri()
    display = uri
    if "@" in uri:
        # Hide password in logs
        parts = uri.split("@", 1)
        prefix = parts[0]
        if ":" in prefix:
            user_part = prefix.rsplit(":", 1)[0]
            display = f"{user_part}:****@{parts[1]}"
        else:
            display = uri

    print(f"Connecting to: {display}")

    engine = create_engine(uri)
    try:
        with engine.connect() as conn:
            dialect = engine.dialect.name
            query = (
                text("SELECT version()")
                if dialect == "postgresql"
                else text("SELECT sqlite_version()")
            )
            version = conn.execute(query).scalar()
            print(f"OK — {dialect} connected")
            print(f"Version: {version}")
            return 0
    except Exception as exc:
        print(f"FAILED — {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
