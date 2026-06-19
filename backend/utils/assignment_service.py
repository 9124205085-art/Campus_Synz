"""Assignment component levels (Higher / Middle / Lower) for mark sheets."""



from utils.marksheet_constants import CO_OPTIONS, MARK_OPTIONS

from utils.marksheet_service import default_question_cos, default_question_marks, validate_question_config



ASSIGNMENT_LEVELS = ("higher", "middle", "lower")

ASSIGNMENT_LEVEL_LABELS = {

    "higher": "Higher",

    "middle": "Middle",

    "lower": "Lower",

}

DEFAULT_LEVEL_THRESHOLDS = {"lower_max": 50, "middle_max": 75}





def is_assignment_component(component_id: str, label: str = "") -> bool:

    cid = (component_id or "").lower()

    name = (label or "").lower()

    if "assignment" in name or "assignment" in cid:

        return True

    if cid.startswith("assignment_"):

        return True

    return False





def level_question_count(level_cfg: dict | None) -> int:

    if not level_cfg:

        return 0

    if level_cfg.get("num_questions"):

        try:

            return int(level_cfg["num_questions"])

        except (TypeError, ValueError):

            pass

    cos = level_cfg.get("question_cos") or []

    return len(cos)





def max_questions_across_levels(levels: dict | None) -> int:

    if not levels:

        return 1

    counts = [level_question_count(levels.get(level)) for level in ASSIGNMENT_LEVELS]

    return max(1, max(counts) if counts else 1)





def default_assignment_levels(num_questions: int) -> dict:

    cos = default_question_cos(num_questions)

    marks = default_question_marks(num_questions)

    return {

        level: {

            "num_questions": num_questions,

            "question_cos": list(cos),

            "question_marks": list(marks),

        }

        for level in ASSIGNMENT_LEVELS

    }





def _validate_level_config(cfg: dict, level_name: str, component_label: str) -> tuple[dict | None, str | None]:

    num_q = level_question_count(cfg)

    if num_q < 1 or num_q > 50:

        return None, (

            f"{ASSIGNMENT_LEVEL_LABELS.get(level_name, level_name)} level ({component_label}): "

            "number of questions must be between 1 and 50."

        )

    cos, marks, err = validate_question_config(

        num_q,

        cfg.get("question_cos"),

        cfg.get("question_marks"),

    )

    if err:

        return None, f"{ASSIGNMENT_LEVEL_LABELS.get(level_name, level_name)} level ({component_label}): {err}"

    return {

        "num_questions": num_q,

        "question_cos": cos,

        "question_marks": marks,

    }, None





def _validate_reference_components(raw_refs) -> tuple[list, str | None]:

    if not raw_refs:

        return [], None

    if not isinstance(raw_refs, list):

        return [], "Invalid reference components."

    cleaned = []

    for item in raw_refs:

        if not isinstance(item, dict):

            continue

        try:

            sheet_id = int(item.get("marksheet_id"))

        except (TypeError, ValueError):

            continue

        comp_id = str(item.get("component_id") or "").strip()

        if not comp_id:

            continue

        cleaned.append(

            {

                "marksheet_id": sheet_id,

                "component_id": comp_id,

                "label": str(item.get("label") or comp_id).strip(),

            }

        )

    return cleaned, None





def _validate_level_thresholds(raw) -> dict:

    if not isinstance(raw, dict):

        return dict(DEFAULT_LEVEL_THRESHOLDS)

    try:

        lower_max = int(raw.get("lower_max", 50))

        middle_max = int(raw.get("middle_max", 75))

    except (TypeError, ValueError):

        return dict(DEFAULT_LEVEL_THRESHOLDS)

    lower_max = max(1, min(99, lower_max))

    middle_max = max(lower_max + 1, min(100, middle_max))

    return {"lower_max": lower_max, "middle_max": middle_max}





def validate_component_settings(

    component_settings: dict | None,

    assessment_ids: list[str],

    label_map: dict | None,

    num_questions: int,

) -> tuple[dict, str | None]:

    if component_settings is not None and not isinstance(component_settings, dict):

        return {}, "Invalid component settings."



    component_settings = component_settings if isinstance(component_settings, dict) else {}

    label_map = label_map or {}

    cleaned: dict = {}



    for cid in assessment_ids:

        if not is_assignment_component(cid, label_map.get(cid, "")):

            continue

        raw = component_settings.get(cid)

        comp_label = label_map.get(cid, cid)

        if not raw:

            cleaned[cid] = {

                "kind": "assignment",

                "reference_components": [],

                "level_thresholds": dict(DEFAULT_LEVEL_THRESHOLDS),

                "levels": default_assignment_levels(num_questions or 5),

            }

            continue

        levels_raw = raw.get("levels") if isinstance(raw, dict) else None

        if not isinstance(levels_raw, dict):

            return {}, f"Assignment levels required for {comp_label}."



        levels_out = {}

        for level in ASSIGNMENT_LEVELS:

            cfg = levels_raw.get(level) or {}

            level_out, err = _validate_level_config(cfg, level, comp_label)

            if err:

                return {}, err

            levels_out[level] = level_out



        refs, ref_err = _validate_reference_components(raw.get("reference_components"))

        if ref_err:

            return {}, ref_err



        cleaned[cid] = {

            "kind": "assignment",

            "reference_components": refs,

            "level_thresholds": _validate_level_thresholds(raw.get("level_thresholds")),

            "levels": levels_out,

        }



    return cleaned, None





def max_assignment_questions(component_settings: dict | None, assessment_ids: list[str], label_map: dict) -> int:

    """Largest question count across assignment level configs."""

    if not component_settings:

        return 0

    label_map = label_map or {}

    max_q = 0

    for cid in assessment_ids:

        if not is_assignment_component(cid, label_map.get(cid, "")):

            continue

        raw = component_settings.get(cid) or {}

        levels = raw.get("levels") if isinstance(raw, dict) else {}

        max_q = max(max_q, max_questions_across_levels(levels))

    return max_q





def validate_assignment_student_levels(

    student_rows: list,

    assignment_ids: list[str],

    require_level_when_marks: bool = True,

) -> str | None:

    if not assignment_ids:

        return None



    for idx, row in enumerate(student_rows, start=1):

        if not isinstance(row, dict):

            continue

        levels_map = row.get("assignment_levels") or {}

        marks_map = row.get("assessment_marks") or {}

        for cid in assignment_ids:

            marks = marks_map.get(cid) or []

            has_marks = any(str(m).strip() != "" for m in marks)

            level = (levels_map.get(cid) or "").strip().lower()

            if has_marks and require_level_when_marks:

                if level not in ASSIGNMENT_LEVELS:

                    return (

                        f"Row {idx}: select Higher, Middle, or Lower for the assignment "

                        f"before entering marks."

                    )

    return None





def get_level_question_marks(

    component_id: str,

    label: str,

    assignment_levels: dict,

    component_settings: dict,

    default_marks: list[str],

    num_questions: int,

) -> list[str]:

    """Per-student question max marks for an assignment component."""

    if not is_assignment_component(component_id, label):

        return list(default_marks)

    level = (assignment_levels.get(component_id) or "").strip().lower()

    if level not in ASSIGNMENT_LEVELS:

        return list(default_marks)

    cfg = (component_settings.get(component_id) or {}).get("levels", {}).get(level, {})

    marks = cfg.get("question_marks")

    level_n = level_question_count(cfg)

    if isinstance(marks, list) and level_n > 0:

        padded = [str(m) for m in marks[:level_n]]

        while len(padded) < num_questions:

            padded.append("0")

        return padded

    return list(default_marks)





def get_level_question_count_for_student(

    component_id: str,

    label: str,

    assignment_levels: dict,

    component_settings: dict,

    default_count: int,

) -> int:

    if not is_assignment_component(component_id, label):

        return default_count

    level = (assignment_levels.get(component_id) or "").strip().lower()

    if level not in ASSIGNMENT_LEVELS:

        return default_count

    cfg = (component_settings.get(component_id) or {}).get("levels", {}).get(level, {})

    n = level_question_count(cfg)

    return n if n > 0 else default_count

