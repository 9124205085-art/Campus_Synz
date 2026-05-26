from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db


class Department(db.Model):
    """Academic department (e.g. B.Tech Information Technology)."""

    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    users = db.relationship("User", back_populates="department_rel", lazy=True)
    courses = db.relationship("Course", back_populates="department_rel", lazy=True)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name}


class User(db.Model):
    """User model for Admin, HOD, and Faculty."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # admin | hod | faculty
    full_name = db.Column(db.String(120), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    department_rel = db.relationship("Department", back_populates="users")

    ROLES = ("admin", "hod", "faculty")

    @property
    def department(self) -> str | None:
        return self.department_rel.name if self.department_rel else None

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "full_name": self.full_name,
            "department": self.department,
            "department_id": self.department_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Course(db.Model):
    """Academic course offered by a department."""

    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    course_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    regulation = db.Column(db.String(50), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False)
    # Legacy DB column (NOT NULL in older DBs) — kept in sync with department_rel.name
    department_label = db.Column("department", db.String(120), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    department_rel = db.relationship("Department", back_populates="courses")

    @property
    def department(self) -> str | None:
        if self.department_rel:
            return self.department_rel.name
        return self.department_label or None

    def sync_department_label(self) -> None:
        if self.department_rel:
            self.department_label = self.department_rel.name

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "course_code": self.course_code,
            "name": self.name,
            "regulation": self.regulation,
            "department": self.department,
            "department_id": self.department_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Student(db.Model):
    """Enrolled student — used to auto-fill mark sheets by branch, department, year."""

    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    register_number = db.Column(db.String(30), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    branch = db.Column(db.String(80), nullable=False, index=True)
    department = db.Column(db.String(120), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    semester = db.Column(db.Integer, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "register_number": self.register_number,
            "full_name": self.full_name,
            "branch": self.branch,
            "department": self.department,
            "year": self.year,
            "semester": self.semester,
        }


class MarkSheet(db.Model):
    """Faculty mark entry sheet (Excel-style grid)."""

    __tablename__ = "mark_sheets"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_name = db.Column(db.String(200), nullable=False)
    course_code = db.Column(db.String(20), nullable=False)
    regulation = db.Column(db.String(50), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    department_label = db.Column(db.String(120), nullable=False, default="")
    branch = db.Column(db.String(80), nullable=False, default="")
    year = db.Column(db.Integer, nullable=True)
    semester = db.Column(db.Integer, nullable=True)
    num_students = db.Column(db.Integer, nullable=False)
    num_questions = db.Column(db.Integer, nullable=False)
    assessment_components = db.Column(db.JSON, nullable=False, default=list)
    question_cos = db.Column(db.JSON, nullable=False, default=list)
    question_marks = db.Column(db.JSON, nullable=False, default=list)
    student_rows = db.Column(db.JSON, nullable=False, default=list)
    is_saved = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    faculty = db.relationship("User", backref="mark_sheets")
    department_rel = db.relationship("Department")

    def to_dict(self) -> dict:
        from utils.marksheet_constants import ASSESSMENT_LABELS

        components = self.assessment_components or []
        return {
            "id": self.id,
            "faculty_id": self.faculty_id,
            "course_name": self.course_name,
            "course_code": self.course_code,
            "regulation": self.regulation,
            "department": self.department_label
            or (self.department_rel.name if self.department_rel else ""),
            "department_id": self.department_id,
            "branch": self.branch or "",
            "year": self.year,
            "semester": self.semester,
            "num_students": self.num_students,
            "num_questions": self.num_questions,
            "assessment_components": components,
            "assessment_labels": [
                ASSESSMENT_LABELS.get(c, c) for c in components
            ],
            "question_cos": self.question_cos or [],
            "question_marks": self.question_marks or [],
            "student_rows": self.student_rows or [],
            "is_saved": self.is_saved,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
