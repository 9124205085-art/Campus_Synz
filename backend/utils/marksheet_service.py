"""Mark sheet row builders, student lookup, and mark validation."""

from models import Student
from utils.marksheet_constants import (
    ASSESSMENT_COMPONENTS,
    BRANCHES,
    CO_OPTIONS,
    DEPARTMENTS,
    MARK_OPTIONS,
    SEMESTERS,
    VALID_ASSESSMENT_IDS,
    YEARS,
)


def marksheet_config_payload() -> dict:
    return {
        "branches": BRANCHES,
        "departments": DEPARTMENTS,
        "years": YEARS,
        "semesters": SEMESTERS,
        "assessment_components": ASSESSMENT_COMPONENTS,
        "mark_options": MARK_OPTIONS,
        "co_options": CO_OPTIONS,
    }


def query_students(branch: str, department: str, year: int, semester: int | None = None):
    q = Student.query.filter_by(branch=branch, department=department, year=year)
    if semester is not None:
        q = q.filter_by(semester=semester)
    return q.order_by(Student.register_number).all()


def build_student_rows(students, assessment_ids: list[str], num_questions: int) -> list[dict]:
    rows = []
    for s in students:
        rows.append(
            {
                "student_id": s.id,
                "student_name": s.full_name,
                "register_number": s.register_number,
                "assessment_marks": {
                    aid: ["" for _ in range(num_questions)] for aid in assessment_ids
                },
            }
        )
    return rows


def build_manual_student_rows(
    num_students: int, assessment_ids: list[str], num_questions: int
) -> list[dict]:
    return [
        {
            "student_name": "",
            "register_number": "",
            "assessment_marks": {
                aid: ["" for _ in range(num_questions)] for aid in assessment_ids
            },
        }
        for _ in range(num_students)
    ]


def default_question_cos(num_questions: int) -> list[str]:
    return ["CO1" for _ in range(num_questions)]


def default_question_marks(num_questions: int) -> list[str]:
    return ["2" for _ in range(num_questions)]


def validate_assessments(components: list) -> tuple[list[str] | None, str | None]:
    if not components or not isinstance(components, list):
        return None, "Select at least one mark sheet component."
    ids = []
    for c in components:
        cid = str(c).strip()
        if cid not in VALID_ASSESSMENT_IDS:
            return None, f"Invalid assessment component: {cid}"
        if cid not in ids:
            ids.append(cid)
    return ids, None


def validate_question_config(
    num_questions: int, question_cos: list | None, question_marks: list | None
) -> tuple[list[str], list[str], str | None]:
    cos = question_cos or default_question_cos(num_questions)
    marks = question_marks or default_question_marks(num_questions)
    if len(cos) != num_questions or len(marks) != num_questions:
        return [], [], "Question CO and mark settings must match number of questions."
    for co in cos:
        if co not in CO_OPTIONS:
            return [], [], f"Invalid CO value: {co}"
    for m in marks:
        if str(m) not in MARK_OPTIONS:
            return [], [], f"Invalid mark type: {m}. Use 1, 2, 13, 14, or 16."
    return [str(c) for c in cos], [str(m) for m in marks], None


def max_mark_for_question(question_marks: list[str], q_index: int) -> float:
    try:
        return float(question_marks[q_index])
    except (TypeError, ValueError, IndexError):
        return 0.0


def validate_cell_mark(value, max_mark: float) -> tuple[str, str | None]:
    """Allow empty, 0, or any number from 0 to max_mark (inclusive cap)."""
    if value is None or str(value).strip() == "":
        return "", None
    raw = str(value).strip()
    try:
        num = float(raw)
    except ValueError:
        return raw, f"Enter a number from 0 to {max_mark}."
    if num < 0 or num > max_mark:
        return raw, f"Mark must be between 0 and {max_mark}."
    
    if num == int(num):
        return str(int(num)), None
    return str(num), None


def validate_assessment_marks_list(
    marks: list, question_marks: list[str]
) -> tuple[list[str], str | None]:
    cleaned = []
    for q_index, m in enumerate(marks):
        max_m = max_mark_for_question(question_marks, q_index)
        normalized, err = validate_cell_mark(m, max_m)
        if err:
            return [], err
        cleaned.append(normalized)
    return cleaned, None


def validate_student_rows_for_save(
    rows: list, components: list[str], num_questions: int, question_marks: list[str]
) -> tuple[list[dict] | None, str | None]:
    cleaned = []
    for row in rows:
        if components and "assessment_marks" in row:
            am = row.get("assessment_marks") or {}
            cleaned_am = {}
            for aid in components:
                marks = am.get(aid) or []
                if len(marks) != num_questions:
                    return None, f"Each student needs marks for all questions in {aid}."
                normalized, err = validate_assessment_marks_list(marks, question_marks)
                if err:
                    return None, err
                cleaned_am[aid] = normalized
            cleaned.append(
                {
                    "student_id": row.get("student_id"),
                    "student_name": (row.get("student_name") or "").strip(),
                    "register_number": (row.get("register_number") or "").strip(),
                    "assessment_marks": cleaned_am,
                }
            )
        else:
            marks = row.get("marks") or []
            if len(marks) != num_questions:
                return None, "Each student must have marks for all questions."
            normalized, err = validate_assessment_marks_list(marks, question_marks)
            if err:
                return None, err
            cleaned.append(
                {
                    "student_name": (row.get("student_name") or "").strip(),
                    "marks": normalized,
                }
            )
    return cleaned, None


def is_legacy_row(row: dict) -> bool:
    return "assessment_marks" not in row and "marks" in row
