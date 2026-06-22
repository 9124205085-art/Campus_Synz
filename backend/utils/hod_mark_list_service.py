"""HOD student mark list — filter by batch, year, semester, class, course, component."""

import re

from sqlalchemy import or_

from models import Course, CourseAssignment, DepartmentClassProfile, HodChecklistItem, MarkSheet, User
from utils.department_service import (
    department_students_for_class,
    department_year_target_count,
    get_department_class_profiles,
    get_department_year_class_counts,
)
from utils.marksheet_constants import LEGACY_ASSESSMENT_LABELS
from utils.marksheet_service import resolve_assessment_labels
from utils.submission_utils import component_matches


def _norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _parse_num(value) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _component_marks(row: dict, component_id: str) -> tuple[float, float]:
    """Return (obtained, max) for a component on a student row."""
    am = row.get("assessment_marks") or {}
    marks = am.get(component_id)
    if marks is None:
        # Fuzzy match custom vs legacy ids (e.g. ca1 vs custom_continuous_assessment_1)
        target = _norm_key(component_id)
        for key, vals in am.items():
            if _norm_key(key) == target:
                marks = vals
                break
    if not isinstance(marks, list):
        return 0.0, 0.0
    obtained = sum(_parse_num(m) for m in marks)
    max_marks = len(marks) * 2 if marks else 0
    return obtained, max_marks


def _sheet_component_ids(sheet) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for cid in sheet.assessment_components or []:
        if cid and cid not in seen:
            seen.add(cid)
            ids.append(cid)
    label_map = sheet.assessment_labels if isinstance(sheet.assessment_labels, dict) else {}
    for cid in label_map:
        if cid and cid not in seen:
            seen.add(cid)
            ids.append(cid)
    for row in sheet.student_rows or []:
        for cid in (row.get("assessment_marks") or {}):
            if cid and cid not in seen:
                seen.add(cid)
                ids.append(cid)
    return ids


def _component_label_on_sheet(sheet, component_id: str) -> str:
    label_map = sheet.assessment_labels if isinstance(sheet.assessment_labels, dict) else {}
    if label_map.get(component_id):
        return label_map[component_id]
    if component_id in LEGACY_ASSESSMENT_LABELS:
        return LEGACY_ASSESSMENT_LABELS[component_id]
    comp_ids = sheet.assessment_components or []
    labels = resolve_assessment_labels(
        comp_ids,
        label_map,
    )
    if component_id in comp_ids:
        idx = comp_ids.index(component_id)
        if idx < len(labels):
            return labels[idx]
    return component_id.replace("_", " ").title()


def resolve_sheet_component_id(
    sheet,
    filter_component_id: str,
    filter_label: str | None = None,
) -> str | None:
    """Map HOD checklist id (e.g. ca1) to marksheet assessment_marks key."""
    if not sheet or not filter_component_id:
        return filter_component_id or None

    filter_id = filter_component_id.strip()
    filter_label = (filter_label or "").strip()
    all_ids = _sheet_component_ids(sheet)

    if filter_id in all_ids:
        return filter_id

    for cid in all_ids:
        label = _component_label_on_sheet(sheet, cid)
        if component_matches(filter_id, filter_label, {"id": cid, "label": label}):
            return cid

    return filter_id


def _marksheets_for_assignment(assignment) -> list:
    """All saved or HOD-submitted mark sheets for this course assignment."""
    course = assignment.course
    if not course:
        return []

    seen: set[int] = set()
    sheets: list = []

    def _add(query):
        for sheet in query.order_by(MarkSheet.updated_at.desc()).all():
            if sheet.id not in seen:
                seen.add(sheet.id)
                sheets.append(sheet)

    base_filter = or_(MarkSheet.is_saved.is_(True), MarkSheet.co_submitted.is_(True))

    _add(
        MarkSheet.query.filter_by(course_assignment_id=assignment.id).filter(base_filter)
    )
    _add(
        MarkSheet.query.filter_by(
            faculty_id=assignment.faculty_id,
            course_code=course.course_code,
            year=assignment.year,
            semester=assignment.semester,
        ).filter(base_filter)
    )
    return sheets


def _merged_marks_by_register(sheets: list) -> dict[str, dict]:
    """Merge student_rows from all mark sheets keyed by register number."""
    by_reg: dict[str, dict] = {}
    for sheet in sheets:
        for row in sheet.student_rows or []:
            reg = str(row.get("register_number") or "").strip().upper()
            if not reg:
                continue
            if reg not in by_reg:
                by_reg[reg] = {
                    "register_number": row.get("register_number") or "",
                    "student_name": row.get("student_name") or "",
                    "assessment_marks": dict(row.get("assessment_marks") or {}),
                }
                continue
            existing = by_reg[reg]
            if not existing.get("student_name") and row.get("student_name"):
                existing["student_name"] = row["student_name"]
            for aid, marks in (row.get("assessment_marks") or {}).items():
                prev = (existing.get("assessment_marks") or {}).get(aid)
                if marks and (not prev or not any(str(m).strip() for m in prev if m is not None)):
                    existing.setdefault("assessment_marks", {})[aid] = marks
    return by_reg


def _primary_sheet(sheets: list):
    if not sheets:
        return None
    return max(
        sheets,
        key=lambda s: (
            len(s.student_rows or []),
            s.num_questions or 0,
            s.updated_at or s.created_at,
        ),
    )


def _assignments_for_department(department_id: int) -> list[CourseAssignment]:
    course_ids = [c.id for c in Course.query.filter_by(department_id=department_id).all()]
    if not course_ids:
        return []
    return (
        CourseAssignment.query.filter(CourseAssignment.course_id.in_(course_ids))
        .order_by(CourseAssignment.year, CourseAssignment.semester, CourseAssignment.class_number)
        .all()
    )


def mark_list_filter_options(department_id: int) -> dict:
    assignments = _assignments_for_department(department_id)
    batches = sorted(
        {
            (p.admission_year or "").strip()
            for p in DepartmentClassProfile.query.filter_by(department_id=department_id).all()
            if (p.admission_year or "").strip()
        }
    )
    years = sorted({int(a.year) for a in assignments if a.year})
    semesters = sorted({int(a.semester) for a in assignments if a.semester})
    classes = sorted({int(a.class_number or 1) for a in assignments})

    courses = []
    seen = set()
    for a in assignments:
        course = a.course
        if not course:
            continue
        key = a.id
        if key in seen:
            continue
        seen.add(key)
        courses.append(
            {
                "assignment_id": a.id,
                "course_id": course.id,
                "course_code": course.course_code,
                "course_name": course.name,
                "year": a.year,
                "semester": a.semester,
                "class_number": a.class_number or 1,
                "class_label": f"Class {a.class_number or 1}",
                "faculty_name": a.faculty.full_name if a.faculty else "",
            }
        )

    components = []
    comp_seen = set()
    for item in HodChecklistItem.query.filter_by(department_id=department_id).all():
        cid = (item.component_id or "").strip()
        label = (item.component_label or cid).strip()
        key = (cid, label)
        if cid and key not in comp_seen:
            comp_seen.add(key)
            components.append({"component_id": cid, "component_label": label})

    for sheet in MarkSheet.query.filter_by(department_id=department_id, is_saved=True).all():
        for cid in sheet.assessment_components or []:
            labels = resolve_assessment_labels(
                sheet.assessment_components or [],
                sheet.assessment_labels if isinstance(sheet.assessment_labels, dict) else {},
            )
            label_map = dict(zip(sheet.assessment_components or [], labels))
            label = label_map.get(cid, cid)
            key = (cid, label)
            if cid and key not in comp_seen:
                comp_seen.add(key)
                components.append({"component_id": cid, "component_label": label})

    class_profiles = []
    for year in years:
        class_profiles.extend(get_department_class_profiles(department_id, year))

    return {
        "batches": batches,
        "years": years,
        "semesters": semesters,
        "classes": classes,
        "courses": courses,
        "components": components,
        "class_profiles": class_profiles,
    }


def mark_list_search(
    department_id: int,
    *,
    batch: str | None = None,
    year: int | None = None,
    semester: int | None = None,
    class_number: int | None = None,
    assignment_id: int | None = None,
    component_id: str | None = None,
) -> dict:
    assignments = _assignments_for_department(department_id)
    if assignment_id:
        assignments = [a for a in assignments if a.id == assignment_id]
    else:
        if year is not None:
            assignments = [a for a in assignments if int(a.year) == int(year)]
        if semester is not None:
            assignments = [a for a in assignments if int(a.semester) == int(semester)]
        if class_number is not None:
            assignments = [a for a in assignments if int(a.class_number or 1) == int(class_number)]

    if batch:
        batch = batch.strip()
        profiles = DepartmentClassProfile.query.filter_by(department_id=department_id).all()
        valid_pairs = {
            (p.year, p.class_number)
            for p in profiles
            if (p.admission_year or "").strip() == batch
        }
        if valid_pairs:
            assignments = [
                a
                for a in assignments
                if (int(a.year), int(a.class_number or 1)) in valid_pairs
            ]

    if not assignments:
        return {
            "students": [],
            "components": [],
            "course": None,
            "message": "No matching course assignment for the selected filters.",
        }

    assignment = assignments[0]
    course = assignment.course
    class_num = int(assignment.class_number or 1)
    yr = int(assignment.year)
    class_count = get_department_year_class_counts(department_id).get(yr, 1)
    total_slots = department_year_target_count(department_id, yr)
    roster = department_students_for_class(
        department_id, yr, class_num, class_count, total_slots
    )

    sheets = _marksheets_for_assignment(assignment)
    sheet = _primary_sheet(sheets)

    comp_ids: list[str] = []
    label_map: dict = {}
    if sheet:
        comp_ids = _sheet_component_ids(sheet)
        for s in sheets:
            lm = s.assessment_labels if isinstance(s.assessment_labels, dict) else {}
            label_map.update(lm)
        labels = resolve_assessment_labels(comp_ids, label_map)
        label_map = dict(zip(comp_ids, labels))

    resolved_component_id = None
    filter_label = None
    if component_id and sheet:
        filter_label = next(
            (
                (item.component_label or "").strip()
                for item in HodChecklistItem.query.filter_by(department_id=department_id).all()
                if _norm_key(item.component_id or "") == _norm_key(component_id)
            ),
            None,
        )
        resolved_component_id = resolve_sheet_component_id(sheet, component_id, filter_label)

    if resolved_component_id:
        if resolved_component_id not in comp_ids:
            comp_ids.append(resolved_component_id)
        component_id = resolved_component_id
    elif component_id and component_id not in comp_ids:
        comp_ids.append(component_id)

    components_meta = [
        {
            "component_id": cid,
            "component_label": label_map.get(cid)
            or _component_label_on_sheet(sheet, cid)
            if sheet
            else cid.replace("_", " ").title(),
        }
        for cid in comp_ids
        if not component_id or cid == component_id or _norm_key(cid) == _norm_key(component_id or "")
    ]

    marks_by_reg = _merged_marks_by_register(sheets) if sheets else {}

    students = []
    for idx, student in enumerate(roster, start=1):
        reg = str(student.get("register_number") or "").strip()
        reg_key = reg.upper()
        mark_row = marks_by_reg.get(reg_key, {})
        comp_marks = {}
        for cid in [c["component_id"] for c in components_meta]:
            lookup_id = resolve_sheet_component_id(sheet, cid) if sheet else cid
            obtained, max_m = _component_marks(mark_row, lookup_id or cid)
            comp_marks[cid] = {
                "obtained": round(obtained, 2),
                "max": max_m,
                "display": f"{int(obtained)}/{max_m}" if max_m else "—",
            }
        students.append(
            {
                "sno": idx,
                "register_number": reg,
                "full_name": student.get("full_name") or "",
                "component_marks": comp_marks,
            }
        )

    faculty = User.query.get(assignment.faculty_id) if assignment.faculty_id else None
    profile = next(
        (
            p
            for p in get_department_class_profiles(department_id, yr)
            if p.get("class_number") == class_num
        ),
        None,
    )

    return {
        "students": students,
        "components": components_meta,
        "course": {
            "assignment_id": assignment.id,
            "course_code": course.course_code if course else "",
            "course_name": course.name if course else "",
            "year": yr,
            "semester": assignment.semester,
            "class_number": class_num,
            "class_label": f"Class {class_num}",
            "faculty_name": faculty.full_name if faculty else "",
            "batch": (profile or {}).get("admission_year") or (sheet.batch if sheet else ""),
            "marksheet_id": sheet.id if sheet else None,
        },
        "message": None if sheet else "No saved mark sheet found for this course yet.",
    }
