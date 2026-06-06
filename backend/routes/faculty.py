from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from datetime import datetime

from extensions import db
from models import MarkSheet, User
from utils.decorators import role_required
from utils.helpers import get_or_create_department
from utils.marksheet_constants import BRANCHES, CO_OPTIONS, DEPARTMENTS, SEMESTERS, YEARS
from utils.co_attainment_calc import build_faculty_dashboard_stats
from utils.marksheet_service import (
    build_manual_student_rows,
    build_student_rows,
    flatten_question_cos,
    flatten_question_marks,
    marksheet_config_payload,
    query_students,
    validate_assessments,
    validate_question_config,
    validate_student_rows_for_save,
)

faculty_bp = Blueprint("faculty", __name__)


def _empty_rows_legacy(num_students, num_questions):
    return [
        {"student_name": "", "marks": ["" for _ in range(num_questions)]}
        for _ in range(num_students)
    ]


@faculty_bp.route("/dashboard-stats", methods=["GET"])
@jwt_required()
@role_required("faculty")
def faculty_dashboard_stats():
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)

    query = MarkSheet.query.filter_by(faculty_id=faculty_id, is_saved=True)
    semester = request.args.get("semester")
    if semester and semester != "all":
        try:
            year_str, sem_str = semester.split("-")
            year = int(year_str)
            sem = int(sem_str)
            query = query.filter_by(year=year, semester=sem)
        except (TypeError, ValueError):
            pass

    sheets = query.order_by(MarkSheet.updated_at.desc()).all()
    analytics = build_faculty_dashboard_stats(sheets)

    return jsonify(
        {
            "user": faculty.to_dict() if faculty else None,
            "analytics": analytics,
        }
    ), 200


@faculty_bp.route("/marksheet-config", methods=["GET"])
@jwt_required()
@role_required("faculty")
def marksheet_config():
    return jsonify(marksheet_config_payload()), 200


@faculty_bp.route("/students", methods=["GET"])
@jwt_required()
@role_required("faculty")
def list_students_for_marksheet():
    branch = (request.args.get("branch") or "").strip()
    department = (request.args.get("department") or "").strip()
    try:
        year = int(request.args.get("year") or 0)
        semester = int(request.args.get("semester") or 0)
    except (TypeError, ValueError):
        year = 0
        semester = 0

    errors = []
    if branch not in BRANCHES:
        errors.append("Valid branch is required.")
    if department not in DEPARTMENTS:
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    if semester not in SEMESTERS:
        errors.append("Valid semester (1–8) is required.")

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    students = query_students(branch, department, year, semester)
    return jsonify(
        {
            "count": len(students),
            "students": [s.to_dict() for s in students],
        }
    ), 200


@faculty_bp.route("/marksheets", methods=["GET"])
@jwt_required()
@role_required("faculty")
def list_marksheets():
    faculty_id = int(get_jwt_identity())
    sheets = (
        MarkSheet.query.filter_by(faculty_id=faculty_id, is_saved=True)
        .order_by(MarkSheet.updated_at.desc())
        .all()
    )
    return jsonify({"marksheets": [s.to_dict() for s in sheets]}), 200


@faculty_bp.route("/marksheets/<int:sheet_id>", methods=["GET"])
@jwt_required()
@role_required("faculty")
def get_marksheet(sheet_id):
    faculty_id = int(get_jwt_identity())
    sheet = MarkSheet.query.filter_by(id=sheet_id, faculty_id=faculty_id).first()
    if not sheet:
        return jsonify({"message": "Mark sheet not found."}), 404
    payload = marksheet_config_payload()
    return jsonify(
        {
            "marksheet": sheet.to_dict(),
            "co_options": payload["co_options"],
            "mark_options": payload["mark_options"],
        }
    ), 200


@faculty_bp.route("/marksheets", methods=["POST"])
@jwt_required()
@role_required("faculty")
def create_marksheet():
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
    data = request.get_json(silent=True) or {}

    student_source = (data.get("student_source") or "manual").strip().lower()

    try:
        num_questions = int(data.get("num_questions") or data.get("number_of_questions") or 0)
        year = int(data.get("year") or 0)
        semester = int(data.get("semester") or 0)
        num_students = int(data.get("num_students") or 0)
    except (TypeError, ValueError):
        num_questions = 0
        year = 0
        semester = 0
        num_students = 0

    course_name = (data.get("course_name") or "").strip()
    course_code = (data.get("course_code") or "").strip().upper()
    regulation = (data.get("regulation") or "").strip()
    department_name = (data.get("department") or "").strip()
    branch = (data.get("branch") or "").strip()
    department_id = data.get("department_id")
    assessment_raw = data.get("assessment_components") or []

    errors = []
    if num_questions < 1 or num_questions > 50:
        errors.append("Number of questions must be between 1 and 50.")
    if not course_name:
        errors.append("Course name is required.")
    if not course_code:
        errors.append("Course code is required.")
    if not regulation:
        errors.append("Regulation is required.")
    if branch not in BRANCHES:
        errors.append("Valid branch is required.")
    if department_name not in DEPARTMENTS:
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    if semester not in SEMESTERS:
        errors.append("Valid semester (1–8) is required.")

    assessment_ids, assess_err = validate_assessments(assessment_raw)
    if assess_err:
        errors.append(assess_err)

    question_cos, question_marks, q_err = validate_question_config(
        num_questions,
        data.get("question_cos"),
        data.get("question_marks"),
    )
    if q_err:
        errors.append(q_err)

    if student_source == "database":
        pass
    elif student_source == "manual":
        if num_students < 1 or num_students > 200:
            errors.append("Number of students must be between 1 and 200 for manual entry.")
    else:
        errors.append('student_source must be "manual" or "database".')

    department = None
    if department_id:
        from models import Department
        department = Department.query.get(int(department_id))
    elif department_name:
        department = get_or_create_department(department_name)
    elif faculty and faculty.department_id:
        from models import Department
        department = Department.query.get(faculty.department_id)

    if not department:
        errors.append("Department is required.")

    student_rows = []
    if not errors and assessment_ids:
        if student_source == "database":
            students = query_students(branch, department_name, year, semester)
            if not students:
                errors.append(
                    "No students found for the selected branch, department, year, and semester."
                )
            else:
                student_rows = build_student_rows(students, assessment_ids, num_questions)
        else:
            student_rows = build_manual_student_rows(
                num_students, assessment_ids, num_questions
            )

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    # Build instance with implicit dynamic data attribute fallbacks
    sheet = MarkSheet(
        faculty_id=faculty_id,
        course_name=course_name,
        course_code=course_code,
        regulation=regulation,
        department_id=department.id,
        department_label=department_name,
        branch=branch,
        year=year,
        semester=semester,
        num_students=len(student_rows),
        num_questions=num_questions,
        assessment_components=assessment_ids,
        question_cos=question_cos,
        question_marks=question_marks,
        student_rows=student_rows,
        is_saved=False,
    )
    db.session.add(sheet)
    db.session.commit()

    msg = (
        "Mark sheet created. Enter student names and marks in the grid."
        if student_source == "manual"
        else "Mark sheet created with students loaded from the database."
    )

    return jsonify(
        {
            "message": msg,
            "marksheet": sheet.to_dict(),
            "co_options": CO_OPTIONS,
        }
    ), 201


@faculty_bp.route("/marksheets/<int:sheet_id>", methods=["PUT"])
@jwt_required()
@role_required("faculty")
def update_marksheet(sheet_id):
    faculty_id = int(get_jwt_identity())
    sheet = MarkSheet.query.filter_by(id=sheet_id, faculty_id=faculty_id).first()
    if not sheet:
        return jsonify({"message": "Mark sheet not found."}), 404

    data = request.get_json(silent=True) or {}
    components = sheet.assessment_components or []

    if "question_cos" in data:
        cos, _, q_err = validate_question_config(
            sheet.num_questions, data["question_cos"], None
        )
        if q_err:
            return jsonify({"message": q_err}), 400
        sheet.question_cos = cos

    if "question_marks" in data:
        _, marks, q_err = validate_question_config(
            sheet.num_questions, None, data["question_marks"]
        )
        if q_err:
            return jsonify({"message": q_err}), 400
        sheet.question_marks = marks

    if "student_rows" in data:
        rows = data["student_rows"]
        if not isinstance(rows, list) or len(rows) != sheet.num_students:
            return jsonify({"message": "Invalid student rows count."}), 400

        q_marks = flatten_question_marks(sheet.question_marks, sheet.num_questions, components)
        cleaned, err = validate_student_rows_for_save(
            rows, components, sheet.num_questions, q_marks
        )
        if err:
            return jsonify({"message": err}), 400
        sheet.student_rows = cleaned
        sheet.question_marks = q_marks
        sheet.question_cos = flatten_question_cos(
            sheet.question_cos, sheet.num_questions, components
        )

    sheet.is_saved = True
    db.session.commit()
    return jsonify(
        {"message": "Mark sheet saved successfully.", "marksheet": sheet.to_dict()}
    ), 200


@faculty_bp.route("/marksheets/<int:sheet_id>", methods=["DELETE"])
@jwt_required()
@role_required("faculty")
def delete_marksheet(sheet_id):
    faculty_id = int(get_jwt_identity())
    sheet = MarkSheet.query.filter_by(id=sheet_id, faculty_id=faculty_id).first()
    if not sheet:
        return jsonify({"message": "Mark sheet not found."}), 404

    db.session.delete(sheet)
    db.session.commit()
    return jsonify({"message": "Mark sheet deleted."}), 200


@faculty_bp.route("/marksheets/<int:sheet_id>/submit-co-attainment", methods=["POST"])
@jwt_required()
@role_required("faculty")
def submit_co_attainment(sheet_id):
    """Faculty submits calculated CO attainment report to department HOD."""
    faculty_id = int(get_jwt_identity())
    sheet = MarkSheet.query.filter_by(id=sheet_id, faculty_id=faculty_id).first()
    if not sheet:
        return jsonify({"message": "Mark sheet not found."}), 404
    if not sheet.is_saved:
        return jsonify({"message": "Save the mark sheet before submitting CO attainment."}), 400

    data = request.get_json(silent=True) or {}
    threshold = data.get("threshold")
    weightages = data.get("weightages")
    submission = data.get("submission")

    if threshold is None or not isinstance(weightages, dict):
        return jsonify({"message": "Threshold and weightages are required."}), 400
    if not submission or not isinstance(submission, dict):
        return jsonify({"message": "CO calculation results are required. Calculate first."}), 400

    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid passing threshold."}), 400

    total_weight = sum(float(v or 0) for v in weightages.values())
    if round(total_weight) != 100:
        return jsonify({"message": f"Weightages must sum to 100%. Currently: {total_weight}%"}), 400

    sheet.passing_threshold = threshold
    sheet.component_weightages = weightages
    sheet.co_submission_data = submission
    sheet.co_submitted = True
    sheet.co_submitted_at = datetime.utcnow()
    db.session.commit()

    faculty = User.query.get(faculty_id)
    return jsonify(
        {
            "message": "CO attainment submitted to your department HOD.",
            "marksheet": sheet.to_dict(),
            "faculty_name": faculty.full_name if faculty else "",
        }
    ), 200