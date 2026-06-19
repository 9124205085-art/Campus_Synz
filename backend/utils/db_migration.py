"""Database migration helpers (SQLite + PostgreSQL compatible)."""

from sqlalchemy import inspect, text

from extensions import db


def dialect_name() -> str:
    return db.engine.dialect.name


def is_postgresql() -> bool:
    return dialect_name() == "postgresql"


def column_exists(table: str, column: str) -> bool:
    inspector = inspect(db.engine)
    if table not in inspector.get_table_names():
        return False
    return column in {col["name"] for col in inspector.get_columns(table)}


def add_column_if_missing(table: str, column: str, col_type: str) -> None:
    if not column_exists(table, column):
        with db.engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()


def boolean_default(*, active: bool = False) -> str:
    if is_postgresql():
        return "BOOLEAN DEFAULT TRUE" if active else "BOOLEAN DEFAULT FALSE"
    return "BOOLEAN DEFAULT 1" if active else "BOOLEAN DEFAULT 0"


def datetime_type() -> str:
    return "TIMESTAMP" if is_postgresql() else "DATETIME"


def json_text_default() -> str:
    if is_postgresql():
        return "JSONB DEFAULT '{}'"
    return "TEXT DEFAULT '{}'"
