"""Mark sheet row builders, student lookup, and mark validation."""

from models import Student
from utils.marksheet_constants import (
    ASSESSMENT_COMPONENTS,
    ASSESSMENT_LABELS,
    BRANCHES,
    CO_OPTIONS,
    CO_PO_MAPPING_LEVELS,
    DEPARTMENTS,
    MARK_OPTIONS,
    PO_OPTIONS,
    SEMESTERS,
    VALID_ASSESSMENT_IDS,
    YEARS,
)


def marksheet_config_payload(faculty=None) -> dict:
    departments = list(DEPARTMENTS)
    if faculty and getattr(faculty, "department_id", None):
        from models import Department

        linked = Department.query.get(faculty.department_id)
        if linked and linked.name not in departments:
            departments.append(linked.name)

    return {
        "branches": BRANCHES,
        "departments": departments,
        "years": YEARS,
        "semesters": SEMESTERS,
        "assessment_components": ASSESSMENT_COMPONENTS,
        "mark_options": MARK_OPTIONS,
        "co_options": CO_OPTIONS,
        "po_options": PO_OPTIONS,
        "co_po_mapping_levels": CO_PO_MAPPING_LEVELS,
    }


DEFAULT_CO_PO_TEMPLATES = {
    "CO1": {"PO1": 3, "PO2": 2, "PO3": 1, "PO6": 1, "PO7": 2},
    "CO2": {"PO1": 2, "PO2": 3, "PO3": 2, "PO4": 1, "PO6": 1, "PO7": 2, "PO8": 1},
    "CO3": {"PO1": 1, "PO2": 2, "PO3": 3, "PO4": 2, "PO5": 1, "PO6": 1, "PO7": 1, "PO8": 2},
    "CO4": {"PO2": 1, "PO3": 2, "PO4": 3, "PO5": 2, "PO6": 2, "PO7": 1, "PO8": 2, "PO9": 1},
    "CO5": {"PO1": 2, "PO3": 1, "PO4": 2, "PO5": 3, "PO6": 1, "PO7": 2, "PO8": 1, "PO9": 1, "PO10": 1},
}


def empty_co_po_row() -> dict:
    return {po: 0 for po in PO_OPTIONS}


def build_default_co_po_mapping(used_cos: list[str]) -> dict:
    mapping = {}
    for co in used_cos:
        if co not in CO_OPTIONS:
            continue
        row = empty_co_po_row()
        template = DEFAULT_CO_PO_TEMPLATES.get(co, {})
        for po, level in template.items():
            if po in row:
                row[po] = level
        if co not in DEFAULT_CO_PO_TEMPLATES:
            idx = CO_OPTIONS.index(co) if co in CO_OPTIONS else 0
            row[f"PO{min(idx + 1, 12)}"] = 2
        mapping[co] = row
    return mapping


def validate_co_po_mapping(
    mapping: dict | None, question_cos: list[str]
) -> tuple[dict, str | None]:
    used_cos = sorted(set(question_cos))
    if not mapping or not isinstance(mapping, dict):
        return build_default_co_po_mapping(used_cos), None

    normalised = {}
    for co in used_cos:
        row = mapping.get(co) or {}
        clean_row = empty_co_po_row()
        for po in PO_OPTIONS:
            try:
                val = int(row.get(po, 0))
            except (TypeError, ValueError):
                return {}, f"Invalid mapping value for {co} → {po}."
            if val not in CO_PO_MAPPING_LEVELS:
                return {}, f"Mapping for {co} → {po} must be 0, 1, 2, or 3."
            clean_row[po] = val
        normalised[co] = clean_row
    return normalised, None


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
                "assignment_levels": {},
            }
        )
    return rows


def build_roster_student_rows(
    roster_entries: list, assessment_ids: list[str], num_questions: int
) -> list[dict]:
    rows = []
    for entry in roster_entries:
        rows.append(
            {
                "student_name": (entry.get("full_name") or entry.get("student_name") or "").strip(),
                "register_number": (entry.get("register_number") or "").strip(),
                "assessment_marks": {
                    aid: ["" for _ in range(num_questions)] for aid in assessment_ids
                },
                "assignment_levels": {},
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
            "assignment_levels": {},
        }
        for _ in range(num_students)
    ]


def default_question_cos(num_questions: int) -> list[str]:
    return ["CO1" for _ in range(num_questions)]


def default_question_marks(num_questions: int) -> list[str]:
    return ["2" for _ in range(num_questions)]


def flatten_question_marks(raw, num_questions: int, components: list[str] | None = None) -> list[str]:
    """Normalise stored config to a flat list (handles legacy per-component dicts)."""
    if isinstance(raw, list) and len(raw) == num_questions:
        return [str(m) for m in raw]
    if isinstance(raw, dict) and raw:
        key = None
        if components:
            for cid in components:
                if cid in raw:
                    key = cid
                    break
        arr = raw.get(key) if key else next(iter(raw.values()))
        if isinstance(arr, list) and len(arr) == num_questions:
            return [str(m) for m in arr]
    return default_question_marks(num_questions)


def flatten_question_cos(raw, num_questions: int, components: list[str] | None = None) -> list[str]:
    if isinstance(raw, list) and len(raw) == num_questions:
        return [str(c) for c in raw]
    if isinstance(raw, dict) and raw:
        key = None
        if components:
            for cid in components:
                if cid in raw:
                    key = cid
                    break
        arr = raw.get(key) if key else next(iter(raw.values()))
        if isinstance(arr, list) and len(arr) == num_questions:
            return [str(c) for c in arr]
    return default_question_cos(num_questions)


def validate_assessments(
    components: list, custom_labels: dict | None = None
) -> tuple[list[str] | None, dict, str | None]:
    """Validate component IDs; return ids and custom label map for storage."""
    if not components or not isinstance(components, list):
        return None, {}, "Add at least one mark sheet component."

    custom_labels = custom_labels or {}
    ids: list[str] = []
    stored_custom: dict[str, str] = {}

    for c in components:
        cid = str(c).strip()
        if not cid:
            continue
        if cid in VALID_ASSESSMENT_IDS:
            if cid not in ids:
                ids.append(cid)
            continue
        if cid.startswith("custom_"):
            label = (custom_labels.get(cid) or "").strip()
            if not label:
                return None, {}, f"Custom component needs a name: {cid}"
            if len(label) > 120:
                return None, {}, "Custom component name is too long (max 120 characters)."
            if cid not in ids:
                ids.append(cid)
                stored_custom[cid] = label
            continue
        return None, {}, f"Invalid assessment component: {cid}. Add components using a name."

    if not ids:
        return None, {}, "Add at least one mark sheet component."
    return ids, stored_custom, None


def slugify_custom_component_id(label: str) -> str | None:
    import re

    slug = re.sub(r"[^a-z0-9]+", "_", (label or "").strip().lower()).strip("_")
    if not slug:
        return None
    return f"custom_{slug[:40]}"


def resolve_assessment_labels(components: list, custom_labels: dict | None = None) -> list[str]:
    custom = custom_labels or {}
    return [custom.get(c) or ASSESSMENT_LABELS.get(c, c.replace("custom_", "").replace("_", " ").title()) for c in components]


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
    rows: list,
    components: list[str],
    num_questions: int,
    question_marks: list[str],
    *,
    component_settings: dict | None = None,
    label_map: dict | None = None,
) -> tuple[list[dict] | None, str | None]:
    from utils.assignment_service import (
        ASSIGNMENT_LEVELS,
        get_level_question_count_for_student,
        get_level_question_marks,
        is_assignment_component,
    )

    component_settings = component_settings or {}
    label_map = label_map or {}
    cleaned = []
    for row in rows:
        if components and "assessment_marks" in row:
            am = row.get("assessment_marks") or {}
            cleaned_am = {}
            for aid in components:
                marks = am.get(aid) or []
                if len(marks) != num_questions:
                    return None, f"Each student needs marks for all questions in {aid}."
                row_q_marks = get_level_question_marks(
                    aid,
                    label_map.get(aid, ""),
                    row.get("assignment_levels") or {},
                    component_settings,
                    question_marks,
                    num_questions,
                )
                validate_count = get_level_question_count_for_student(
                    aid,
                    label_map.get(aid, ""),
                    row.get("assignment_levels") or {},
                    component_settings,
                    num_questions,
                )
                if is_assignment_component(aid, label_map.get(aid, "")):
                    marks_to_validate = marks[:validate_count]
                    q_marks_to_validate = row_q_marks[:validate_count]
                else:
                    marks_to_validate = marks
                    q_marks_to_validate = row_q_marks
                normalized_partial, err = validate_assessment_marks_list(
                    marks_to_validate, q_marks_to_validate
                )
                if err:
                    return None, err
                normalized = list(marks)
                for i, val in enumerate(normalized_partial):
                    normalized[i] = val
                cleaned_am[aid] = normalized
            levels_map = row.get("assignment_levels") or {}
            cleaned_levels = {}
            for cid in components:
                if not is_assignment_component(cid, label_map.get(cid, "")):
                    continue
                level = (levels_map.get(cid) or "").strip().lower()
                if level in ASSIGNMENT_LEVELS:
                    cleaned_levels[cid] = level
            cleaned.append(
                {
                    "student_id": row.get("student_id"),
                    "student_name": (row.get("student_name") or "").strip(),
                    "register_number": (row.get("register_number") or "").strip(),
                    "assessment_marks": cleaned_am,
                    "assignment_levels": cleaned_levels,
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
