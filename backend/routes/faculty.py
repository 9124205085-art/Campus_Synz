from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from datetime import datetime

from extensions import db
from models import FacultyClassRoster, MarkSheet, Notification, User
from utils.decorators import role_required
from utils.helpers import get_or_create_department, is_valid_department
from utils.marksheet_constants import BRANCHES, CO_OPTIONS, DEPARTMENTS, SEMESTERS, YEARS, validate_year_semester
from utils.co_attainment_calc import build_faculty_dashboard_stats
from utils.marksheet_service import (
    build_manual_student_rows,
    build_roster_student_rows,
    build_student_rows,
    flatten_question_cos,
    flatten_question_marks,
    marksheet_config_payload,
    query_students,
    validate_assessments,
    validate_co_po_mapping,
    validate_question_config,
    validate_student_rows_for_save,
)
from utils.assignment_service import (
    is_assignment_component,
    max_assignment_questions,
    validate_assignment_student_levels,
    validate_component_settings,
)
from utils.department_service import (
    attach_submission_routing,
    faculty_has_course_assignment,
    filter_marksheets_to_assigned_courses,
    get_department_hod,
    marksheet_is_for_assigned_course,
    sync_marksheet_department,
)
from utils.roster_service import (
    get_roster,
    roster_student_count,
    roster_student_entries,
    roster_students_for_faculty,
    roster_summary_payload,
    save_roster,
)

faculty_bp = Blueprint("faculty", __name__)


def _get_assigned_marksheet(faculty_id, sheet_id):
    sheet = MarkSheet.query.filter_by(id=sheet_id, faculty_id=faculty_id).first()
    if not sheet:
        return None, "Mark sheet not found."
    if not marksheet_is_for_assigned_course(sheet, faculty_id):
        return None, (
            "This mark sheet is not for a course assigned to you. "
            "Use Create Mark Sheet from your assigned course on the dashboard."
        )
    return sheet, None


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
    sheets = filter_marksheets_to_assigned_courses(sheets, faculty_id)
    analytics = build_faculty_dashboard_stats(sheets)
    analytics["stats"]["roster_students_count"] = roster_student_count(faculty_id)
    if analytics["stats"].get("students_count", 0) == 0:
        analytics["stats"]["students_count"] = analytics["stats"]["roster_students_count"]

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
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
    return jsonify(marksheet_config_payload(faculty)), 200


@faculty_bp.route("/students", methods=["GET"])
@jwt_required()
@role_required("faculty")
def list_students_for_marksheet():
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
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
    if not is_valid_department(department, faculty):
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    else:
        err = validate_year_semester(year, semester)
        if err:
            errors.append(err)

    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    students = query_students(branch, department, year, semester)
    return jsonify(
        {
            "count": len(students),
            "students": [s.to_dict() for s in students],
        }
    ), 200


@faculty_bp.route("/student-roster", methods=["GET"])
@jwt_required()
@role_required("faculty")
def get_student_roster():
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
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
    if not is_valid_department(department, faculty):
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    else:
        err = validate_year_semester(year, semester)
        if err:
            errors.append(err)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    payload = roster_students_for_faculty(faculty_id, branch, department, year, semester)
    return jsonify(payload), 200


@faculty_bp.route("/student-roster", methods=["PUT"])
@jwt_required()
@role_required("faculty")
def upsert_student_roster():
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
    data = request.get_json(silent=True) or {}
    branch = (data.get("branch") or "").strip()
    department = (data.get("department") or "").strip()
    try:
        year = int(data.get("year") or 0)
        semester = int(data.get("semester") or 0)
    except (TypeError, ValueError):
        year = 0
        semester = 0
    students = data.get("students") or []

    errors = []
    if branch not in BRANCHES:
        errors.append("Valid branch is required.")
    if not is_valid_department(department, faculty):
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    else:
        err = validate_year_semester(year, semester)
        if err:
            errors.append(err)
    if errors:
        return jsonify({"message": " ".join(errors), "errors": errors}), 400

    roster, err = save_roster(faculty_id, branch, department, year, semester, students)
    if err:
        return jsonify({"message": err}), 400

    db.session.commit()
    return jsonify(
        {"message": "Class list saved.", "roster": roster.to_dict()}
    ), 200


@faculty_bp.route("/student-roster/summary", methods=["GET"])
@jwt_required()
@role_required("faculty")
def student_roster_summary():
    faculty_id = int(get_jwt_identity())
    return jsonify(roster_summary_payload(faculty_id)), 200


@faculty_bp.route("/marksheets", methods=["GET"])
@jwt_required()
@role_required("faculty")
def list_marksheets():
    faculty_id = int(get_jwt_identity())
    sheets = (
        MarkSheet.query.filter_by(faculty_id=faculty_id)
        .order_by(MarkSheet.updated_at.desc())
        .all()
    )
    sheets = filter_marksheets_to_assigned_courses(sheets, faculty_id)
    return jsonify({"marksheets": [s.to_dict() for s in sheets]}), 200


@faculty_bp.route("/marksheets/<int:sheet_id>", methods=["GET"])
@jwt_required()
@role_required("faculty")
def get_marksheet(sheet_id):
    faculty_id = int(get_jwt_identity())
    sheet, err = _get_assigned_marksheet(faculty_id, sheet_id)
    if err:
        return jsonify({"message": err}), 404
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
    batch = (data.get("batch") or "").strip()
    section = (data.get("section") or "").strip().upper()
    department_id = data.get("department_id")
    assessment_raw = data.get("assessment_components") or []

    errors = []
    if not course_name:
        errors.append("Course name is required.")
    if not course_code:
        errors.append("Course code is required.")
    if not regulation:
        errors.append("Regulation is required.")
    if branch not in BRANCHES:
        errors.append("Valid branch is required.")
    if not is_valid_department(department_name, faculty):
        errors.append("Valid department is required.")
    if year not in YEARS:
        errors.append("Valid year (1–4) is required.")
    else:
        err = validate_year_semester(year, semester)
        if err:
            errors.append(err)

    if (
        not errors
        and faculty
        and course_code
        and year
        and semester
        and not faculty_has_course_assignment(faculty_id, course_code, year, semester)
    ):
        errors.append(
            "This course is not assigned to you for the selected year and semester. "
            "Use one of your assigned courses from the dashboard."
        )

    assessment_ids, custom_assessment_labels, assess_err = validate_assessments(
        assessment_raw, data.get("assessment_component_labels")
    )
    if assess_err:
        errors.append(assess_err)

    question_cos, question_marks, q_err = validate_question_config(
        num_questions,
        data.get("question_cos"),
        data.get("question_marks"),
    )
    if q_err:
        errors.append(q_err)

    co_po_mapping, map_err = validate_co_po_mapping(
        data.get("co_po_mapping"), question_cos or []
    )
    if map_err:
        errors.append(map_err)

    component_settings, settings_err = validate_component_settings(
        data.get("component_settings"),
        assessment_ids or [],
        custom_assessment_labels,
        num_questions,
    )
    if settings_err:
        errors.append(settings_err)

    assignment_max_q = max_assignment_questions(
        component_settings, assessment_ids or [], custom_assessment_labels
    )
    if assignment_max_q > num_questions:
        num_questions = assignment_max_q

    if num_questions < 1 or num_questions > 50:
        errors.append("Number of questions must be between 1 and 50.")

    if student_source == "database":
        pass
    elif student_source == "roster":
        roster_entries = roster_student_entries(
            faculty_id, branch, department_name, year, semester
        )
        roster_size = len(roster_entries)
        if roster_size == 0:
            errors.append(
                "No class list for this selection. Your HOD must add students for this year, or save a list from the Dashboard Students card."
            )
        elif num_students < 1 or num_students > roster_size:
            errors.append(
                f"Number of students must be between 1 and {roster_size} (available class list size)."
            )
    elif student_source == "manual":
        if num_students < 1 or num_students > 200:
            errors.append("Number of students must be between 1 and 200 for manual entry.")
    else:
        errors.append('student_source must be "roster", "manual", or "database".')

    department = None
    if faculty and faculty.department_id:
        from models import Department

        department = Department.query.get(faculty.department_id)
        if department:
            department_name = department.name
    elif department_id:
        from models import Department

        department = Department.query.get(int(department_id))
    elif department_name:
        department = get_or_create_department(department_name)

    if not department:
        errors.append("Department is required.")
    elif faculty and faculty.department_id and department.id != faculty.department_id:
        errors.append("Mark sheets must use your assigned department.")

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
        elif student_source == "roster":
            roster_entries = roster_student_entries(
                faculty_id, branch, department_name, year, semester
            )
            student_rows = build_roster_student_rows(
                roster_entries[:num_students],
                assessment_ids,
                num_questions,
            )
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
        department_label=department.name,
        branch=branch,
        batch=batch,
        section=section,
        year=year,
        semester=semester,
        num_students=len(student_rows),
        num_questions=num_questions,
        assessment_components=assessment_ids,
        assessment_labels=custom_assessment_labels,
        question_cos=question_cos,
        question_marks=question_marks,
        co_po_mapping=co_po_mapping,
        component_settings=component_settings,
        student_rows=student_rows,
        is_saved=False,
    )
    db.session.add(sheet)
    db.session.commit()

    msg = {
        "manual": "Mark sheet created. Enter student names and marks in the grid.",
        "database": "Mark sheet created with students loaded from the database.",
        "roster": "Mark sheet created with your saved class list.",
    }.get(student_source, "Mark sheet created.")

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
    sheet, err = _get_assigned_marksheet(faculty_id, sheet_id)
    if err:
        return jsonify({"message": err}), 404

    data = request.get_json(silent=True) or {}
    components = sheet.assessment_components or []
    label_map = sheet.assessment_labels if isinstance(sheet.assessment_labels, dict) else {}
    assignment_ids = [
        cid for cid in components if is_assignment_component(cid, label_map.get(cid, ""))
    ]

    if "component_settings" in data:
        settings, settings_err = validate_component_settings(
            data.get("component_settings"),
            components,
            label_map,
            sheet.num_questions,
        )
        if settings_err:
            return jsonify({"message": settings_err}), 400
        sheet.component_settings = settings

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
            rows,
            components,
            sheet.num_questions,
            q_marks,
            component_settings=sheet.component_settings or {},
            label_map=label_map,
        )
        if err:
            return jsonify({"message": err}), 400
        level_err = validate_assignment_student_levels(cleaned, assignment_ids)
        if level_err:
            return jsonify({"message": level_err}), 400
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
    sheet, err = _get_assigned_marksheet(faculty_id, sheet_id)
    if err:
        return jsonify({"message": err}), 404

    db.session.delete(sheet)
    db.session.commit()
    return jsonify({"message": "Mark sheet deleted."}), 200


@faculty_bp.route("/marksheets/<int:sheet_id>/submit-co-attainment", methods=["POST"])
@jwt_required()
@role_required("faculty")
def submit_co_attainment(sheet_id):
    """Faculty submits calculated CO attainment report to department HOD."""
    faculty_id = int(get_jwt_identity())
    sheet, err = _get_assigned_marksheet(faculty_id, sheet_id)
    if err:
        return jsonify({"message": err}), 404
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

    faculty = User.query.get(faculty_id)
    if not faculty or not faculty.department_id:
        return jsonify(
            {
                "message": (
                    "Your account is not linked to a department. "
                    "Ask the admin to assign you to the correct department before submitting."
                )
            }
        ), 400

    sync_marksheet_department(sheet, faculty)

    hod = get_department_hod(faculty.department_id)

    sheet.passing_threshold = threshold
    sheet.component_weightages = weightages
    sheet.co_submission_data = attach_submission_routing(submission, faculty, hod)
    sheet.co_submitted = True
    sheet.co_submitted_at = datetime.utcnow()
    db.session.commit()

    dept_name = faculty.department_rel.name if faculty.department_rel else sheet.department_label
    if hod:
        message = f"CO attainment submitted to {hod.full_name} (HOD, {dept_name})."
    else:
        message = (
            f"CO attainment saved for {dept_name}, but no active HOD is linked to this "
            "department. Ask the admin to assign an HOD."
        )

    return jsonify(
        {
            "message": message,
            "marksheet": sheet.to_dict(),
            "faculty_name": faculty.full_name,
            "hod_name": hod.full_name if hod else None,
            "department": dept_name,
        }
    ), 200


@faculty_bp.route("/marksheets/submit-component-report", methods=["POST"])
@jwt_required()
@role_required("faculty")
def submit_component_report():
    """Submit multi-component CO/PO summary (Assignment, CA1, CA2, etc.) to department HOD."""
    faculty_id = int(get_jwt_identity())
    faculty = User.query.get(faculty_id)
    data = request.get_json(silent=True) or {}

    submission = data.get("submission")
    threshold = data.get("threshold")
    sheet_ids = data.get("sheet_ids") or []

    if threshold is None:
        return jsonify({"message": "Threshold is required."}), 400
    if not submission or not isinstance(submission, dict):
        return jsonify({"message": "Component summary data is required."}), 400
    if not sheet_ids or not isinstance(sheet_ids, list):
        return jsonify({"message": "At least one mark sheet id is required."}), 400

    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return jsonify({"message": "Invalid passing threshold."}), 400

    if not faculty or not faculty.department_id:
        return jsonify(
            {
                "message": (
                    "Your account is not linked to a department. "
                    "Ask the admin to assign you before submitting."
                )
            }
        ), 400

    sheets = []
    for sid in sheet_ids:
        try:
            sid_int = int(sid)
        except (TypeError, ValueError):
            continue
        sheet, err = _get_assigned_marksheet(faculty_id, sid_int)
        if sheet:
            sheets.append(sheet)

    if not sheets:
        return jsonify(
            {
                "message": (
                    "No valid mark sheets found for your assigned courses. "
                    "Create and save marks only for courses assigned to you."
                )
            }
        ), 404

    unsaved = [s for s in sheets if not s.is_saved]
    if unsaved:
        return jsonify(
            {
                "message": (
                    f"Save all mark sheets before submitting "
                    f"({unsaved[0].course_code} — component sheet not saved)."
                )
            }
        ), 400

    primary = sheets[0]
    for sheet in sheets:
        sync_marksheet_department(sheet, faculty)

    hod = get_department_hod(faculty.department_id)

    submission_payload = attach_submission_routing(
        {
            **submission,
            "reportType": "component_summary",
            "threshold": threshold,
            "course": {
                **(submission.get("course") or {}),
                "code": primary.course_code,
                "name": primary.course_name,
                "year": primary.year,
                "semester": primary.semester,
                "regulation": primary.regulation,
                "department": primary.department_label
                or (faculty.department_rel.name if faculty.department_rel else ""),
            },
        },
        faculty,
        hod,
    )
    if not submission_payload.get("components"):
        from utils.submission_utils import components_from_submission

        submission_payload["components"] = components_from_submission(submission_payload, primary)

    now = datetime.utcnow()
    for sheet in sheets:
        sheet.passing_threshold = threshold
        sheet.co_submission_data = submission_payload
        sheet.co_submitted = True
        sheet.co_submitted_at = now

    db.session.commit()

    dept_name = faculty.department_rel.name if faculty.department_rel else primary.department_label
    if hod:
        message = f"Component CO/PO summary submitted to {hod.full_name} (HOD, {dept_name})."
    else:
        message = (
            f"Summary saved for {dept_name}, but no active HOD is linked. "
            "Ask the admin to assign an HOD."
        )

    return jsonify(
        {
            "message": message,
            "marksheet": primary.to_dict(),
            "hod_name": hod.full_name if hod else None,
            "department": dept_name,
        }
    ), 200


@faculty_bp.route("/notifications", methods=["GET"])
@jwt_required()
@role_required("faculty")
def list_notifications():
    user_id = int(get_jwt_identity())
    notifications = (
        Notification.query.filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify(
        {
            "notifications": [n.to_dict() for n in notifications],
            "unread_count": unread_count,
        }
    ), 200


@faculty_bp.route("/notifications/<int:notification_id>/read", methods=["PATCH"])
@jwt_required()
@role_required("faculty")
def mark_notification_read(notification_id):
    user_id = int(get_jwt_identity())
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not notification:
        return jsonify({"message": "Notification not found."}), 404

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.session.commit()

    unread_count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify(
        {
            "message": "Notification marked as read.",
            "notification": notification.to_dict(),
            "unread_count": unread_count,
        }
    ), 200


@faculty_bp.route("/notifications/read-all", methods=["POST"])
@jwt_required()
@role_required("faculty")
def mark_all_notifications_read():
    user_id = int(get_jwt_identity())
    now = datetime.utcnow()
    (
        Notification.query.filter_by(user_id=user_id, is_read=False).update(
            {"is_read": True, "read_at": now},
            synchronize_session=False,
        )
    )
    db.session.commit()
    return jsonify({"message": "All notifications marked as read.", "unread_count": 0}), 200