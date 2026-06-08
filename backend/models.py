from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db

DEGREE_OPTIONS = ("B.Tech", "B.E")
STATUS_OPTIONS = ("active", "inactive")
DESIGNATION_OPTIONS = ("hod", "faculty")


class Department(db.Model):
    """Academic department."""

    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=True, index=True)
    degree = db.Column(db.String(20), nullable=False, default="B.Tech")
    duration = db.Column(db.Integer, nullable=False, default=4)
    status = db.Column(db.String(20), nullable=False, default="active")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    users = db.relationship("User", back_populates="department_rel", lazy=True)
    courses = db.relationship("Course", back_populates="department_rel", lazy=True)

    @property
    def is_active(self) -> bool:
        return (self.status or "active").lower() == "active"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code or "",
            "degree": self.degree or "B.Tech",
            "duration": self.duration or 4,
            "status": self.status or "active",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class User(db.Model):
    """User model for Admin, HOD, and Faculty."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.String(30), unique=True, nullable=True, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    mobile = db.Column(db.String(15), nullable=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    designation = db.Column(db.String(30), nullable=True)
    full_name = db.Column(db.String(120), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    department_rel = db.relationship("Department", back_populates="users")
    course_assignments = db.relationship("CourseAssignment", back_populates="faculty", lazy=True)

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
            "employee_id": self.employee_id or "",
            "username": self.username,
            "email": self.email,
            "mobile": self.mobile or "",
            "role": self.role,
            "designation": self.designation or self.role,
            "full_name": self.full_name,
            "department": self.department,
            "department_id": self.department_id,
            "is_active": self.is_active,
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
    department_label = db.Column("department", db.String(120), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    department_rel = db.relationship("Department", back_populates="courses")
    assignments = db.relationship("CourseAssignment", back_populates="course", lazy=True)

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


class CourseAssignment(db.Model):
    """Faculty assigned to teach a course for a specific year."""

    __tablename__ = "course_assignments"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    semester = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    course = db.relationship("Course", back_populates="assignments")
    faculty = db.relationship("User", back_populates="course_assignments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "course_id": self.course_id,
            "faculty_id": self.faculty_id,
            "year": self.year,
            "semester": self.semester,
            "course_code": self.course.course_code if self.course else "",
            "course_name": self.course.name if self.course else "",
            "regulation": self.course.regulation if self.course else "",
            "faculty_name": self.faculty.full_name if self.faculty else "",
            "faculty_email": self.faculty.email if self.faculty else "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Student(db.Model):
    """Enrolled student."""

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
    """Faculty mark entry sheet."""

    __tablename__ = "mark_sheets"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_assignment_id = db.Column(db.Integer, db.ForeignKey("course_assignments.id"), nullable=True)
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
    passing_threshold = db.Column(db.Float, nullable=False, default=60.0)
    component_weightages = db.Column(db.JSON, nullable=False, default=dict)
    co_submitted = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    co_submitted_at = db.Column(db.DateTime, nullable=True)
    co_submission_data = db.Column(db.JSON, nullable=True)
    co_po_mapping = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    faculty = db.relationship("User", backref="mark_sheets")
    department_rel = db.relationship("Department")
    course_assignment = db.relationship("CourseAssignment")

    def to_dict(self) -> dict:
        from utils.marksheet_constants import ASSESSMENT_LABELS
        from utils.marksheet_service import flatten_question_cos, flatten_question_marks

        components = self.assessment_components or []
        num_q = self.num_questions or 0
        flat_cos = flatten_question_cos(self.question_cos, num_q, components)
        flat_marks = flatten_question_marks(self.question_marks, num_q, components)
        return {
            "id": self.id,
            "faculty_id": self.faculty_id,
            "course_assignment_id": self.course_assignment_id,
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
            "assessment_labels": [ASSESSMENT_LABELS.get(c, c) for c in components],
            "question_cos": flat_cos,
            "question_marks": flat_marks,
            "student_rows": self.student_rows or [],
            "is_saved": self.is_saved,
            "passing_threshold": self.passing_threshold,
            "component_weightages": self.component_weightages or {},
            "co_submitted": self.co_submitted,
            "co_submitted_at": self.co_submitted_at.isoformat() if self.co_submitted_at else None,
            "co_po_mapping": self.co_po_mapping or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
