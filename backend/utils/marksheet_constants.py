"""Shared options for mark sheet setup and student enrollment."""

BRANCHES = [
    "Bachelor of Engineering",
    "Bachelor of Technology",
]

DEPARTMENTS = [
    "Computer Science Engineering",
    "Information Technology",
    "Artificial Intelligence and Data Science",
    "Electronics and Communication Engineering",
    "Electrical and Electronics Engineering",
    "Automobile Engineering",
    "Mechatronics",
    "Mechanical",
    "Aerospace",
    "Aeronautical",
]

YEARS = [1, 2, 3, 4]
SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8]

YEAR_SEMESTER_MAP = {
    1: [1, 2],
    2: [3, 4],
    3: [5, 6],
    4: [7, 8],
}


def semesters_for_year(year: int) -> list[int]:
    try:
        y = int(year)
    except (TypeError, ValueError):
        return []
    return list(YEAR_SEMESTER_MAP.get(y, []))


def validate_year_semester(year, semester) -> str | None:
    try:
        y = int(year)
        s = int(semester)
    except (TypeError, ValueError):
        return "Valid year (1–4) and semester are required."
    if y not in YEARS:
        return "Valid year (1–4) is required."
    allowed = semesters_for_year(y)
    if s not in allowed:
        labels = " or ".join(f"Sem {n}" for n in allowed)
        return f"Year {y} must use {labels} (not Semester {s})."
    return None

CO_OPTIONS = ["CO1", "CO2", "CO3", "CO4", "CO5", "CO6", "CO7", "CO8"]

PO_OPTIONS = [f"PO{i}" for i in range(1, 13)]

CO_PO_MAPPING_LEVELS = [0, 1, 2, 3]

MARK_OPTIONS = ["1", "2", "13", "14", "16"]

# Legacy preset IDs — kept for older mark sheets already in the database.
LEGACY_ASSESSMENT_LABELS = {
    "ca1": "Continuous Assessment 1",
    "ca2": "Continuous Assessment 2",
    "assignment_1": "Assignment 1",
    "assignment_2": "Assignment 2",
    "assignment_3": "Assignment 3",
    "quiz_1": "Quiz 1",
    "quiz_2": "Quiz 2",
    "quiz_3": "Quiz 3",
    "model_exam": "Model Examination",
}

VALID_ASSESSMENT_IDS = set(LEGACY_ASSESSMENT_LABELS.keys())
ASSESSMENT_LABELS = LEGACY_ASSESSMENT_LABELS

# Faculty define components manually when creating a new mark sheet.
ASSESSMENT_COMPONENTS: list[dict] = []
