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

CO_OPTIONS = ["CO1", "CO2", "CO3", "CO4", "CO5", "CO6", "CO7", "CO8"]

MARK_OPTIONS = ["1", "2", "13", "14", "16"]

ASSESSMENT_COMPONENTS = [
    {"id": "ca1", "label": "Continuous Assessment 1"},
    {"id": "ca2", "label": "Continuous Assessment 2"},
    {"id": "assignment_1", "label": "Assignment 1"},
    {"id": "assignment_2", "label": "Assignment 2"},
    {"id": "assignment_3", "label": "Assignment 3"},
    {"id": "quiz_1", "label": "Quiz 1"},
    {"id": "quiz_2", "label": "Quiz 2"},
    {"id": "quiz_3", "label": "Quiz 3"},
    {"id": "model_exam", "label": "Model Examination"},
]

VALID_ASSESSMENT_IDS = {a["id"] for a in ASSESSMENT_COMPONENTS}

ASSESSMENT_LABELS = {a["id"]: a["label"] for a in ASSESSMENT_COMPONENTS}
