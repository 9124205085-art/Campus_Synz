"""HOD student mark list — filter by batch, year, semester, class, course, component."""

import re

from models import Course, CourseAssignment, DepartmentClassProfile, MarkSheet, User
from utils.department_service import (
    department_students_for_class,
    department_year_target_count,
    get_department_class_profiles,
    get_department_year_class_counts,
    marksheets_submitted_to_department,
)
from utils.marksheet_constants import LEGACY_ASSESSMENT_LABELS
from utils.marksheet_service import resolve_assessment_labels
from utils.submission_utils import (
    build_submission_records,
    component_matches,
    is_component_summary,
    parse_submission_data,
    resolve_component_label,
)


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
    totals = row.get("component_totals") or {}
    if component_id in totals:
        entry = totals[component_id]
        return float(entry.get("obtained") or 0), float(entry.get("max") or 0)

    target = _norm_key(component_id)
    for key, entry in totals.items():
        if _norm_key(key) == target:
            return float(entry.get("obtained") or 0), float(entry.get("max") or 0)

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


def _component_display(row: dict, component_id: str, obtained: float, max_m: float) -> str:
    totals = row.get("component_totals") or {}
    entry = totals.get(component_id)
    if not entry:
        target = _norm_key(component_id)
        for key, val in totals.items():
            if _norm_key(key) == target:
                entry = val
                break
    if entry and entry.get("display"):
        return str(entry["display"])
    if max_m:
        return f"{int(obtained)}/{max_m}"
    return "—"


def _ingest_submission_marks(sheet, by_reg: dict[str, dict]) -> None:
    """Merge component_summary studentSummaries into marks lookup."""
    data = parse_submission_data(sheet.co_submission_data)
    if not is_component_summary(data):
        return

    for student in data.get("studentSummaries") or []:
        reg = str(student.get("register_number") or "").strip().upper()
        if not reg:
            continue
        if reg not in by_reg:
            by_reg[reg] = {
                "register_number": student.get("register_number") or "",
                "student_name": student.get("student_name") or "",
                "assessment_marks": {},
                "component_totals": {},
            }
        existing = by_reg[reg]
        if not existing.get("student_name"):
            existing["student_name"] = student.get("student_name") or ""

        for comp_id, block in (student.get("byComponent") or {}).items():
            if not isinstance(block, dict) or not block.get("hasMarks"):
                continue
            obtained = block.get("totalObtained")
            max_m = block.get("totalMax")
            display = None
            if max_m:
                display = f"{int(obtained or 0)}/{int(max_m)}"
            elif block.get("overallCoPct") is not None:
                display = f"{block['overallCoPct']}%"
                obtained = block["overallCoPct"]
                max_m = 100
            if not display:
                continue
            totals = existing.setdefault("component_totals", {})
            if comp_id not in totals:
                totals[comp_id] = {
                    "obtained": float(obtained or 0),
                    "max": float(max_m or 0),
                    "display": display,
                }


def _sheet_matches_batch(sheet, department_id: int, batch: str) -> bool:
    batch = (batch or "").strip()
    if not batch:
        return True

    if (sheet.batch or "").strip() == batch:
        return True

    data = parse_submission_data(sheet.co_submission_data)
    course = data.get("course") or {}
    if (course.get("batch") or "").strip() == batch:
        return True

    assignment = None
    if sheet.course_assignment_id:
        assignment = CourseAssignment.query.get(sheet.course_assignment_id)

    if assignment:
        profile = DepartmentClassProfile.query.filter_by(
            department_id=department_id,
            year=int(assignment.year),
            class_number=int(assignment.class_number or 1),
        ).first()
        if profile and (profile.admission_year or "").strip() == batch:
            return True

    if sheet.year is not None:
        batch_profiles = _profiles_for_batch(department_id, batch)
        if any(int(p.year) == int(sheet.year) for p in batch_profiles):
            return True

    if assignment and _profiles_for_batch(department_id, batch):
        return any(
            int(p.year) == int(assignment.year)
            and int(p.class_number) == int(assignment.class_number or 1)
            for p in _profiles_for_batch(department_id, batch)
        )

    return False


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


def _merged_marks_by_register(sheets: list) -> dict[str, dict]:
    """Merge student_rows and submission summaries keyed by register number."""
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
                    "component_totals": {},
                }
                continue
            existing = by_reg[reg]
            if not existing.get("student_name") and row.get("student_name"):
                existing["student_name"] = row["student_name"]
            for aid, marks in (row.get("assessment_marks") or {}).items():
                prev = (existing.get("assessment_marks") or {}).get(aid)
                if marks and (not prev or not any(str(m).strip() for m in prev if m is not None)):
                    existing.setdefault("assessment_marks", {})[aid] = marks
        _ingest_submission_marks(sheet, by_reg)
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


def _profiles_for_batch(department_id: int, batch: str) -> list:
    batch = (batch or "").strip()
    if not batch:
        return []
    return [
        p
        for p in DepartmentClassProfile.query.filter_by(department_id=department_id).all()
        if (p.admission_year or "").strip() == batch
    ]


def _students_for_batch(
    department_id: int,
    batch: str,
    *,
    year: int | None = None,
    class_number: int | None = None,
) -> list[dict]:
    """Department students linked to an admission batch via class profiles."""
    batch = (batch or "").strip()
    if not batch:
        return []

    profiles = _profiles_for_batch(department_id, batch)
    if year is not None:
        profiles = [p for p in profiles if int(p.year) == int(year)]
    if class_number is not None:
        profiles = [p for p in profiles if int(p.class_number) == int(class_number)]

    seen_regs: set[str] = set()
    students: list[dict] = []

    def add_student(row: dict, yr: int, cn: int) -> None:
        reg = str(row.get("register_number") or "").strip()
        reg_key = reg.upper()
        if not reg or reg_key in seen_regs:
            return
        seen_regs.add(reg_key)
        students.append(
            {
                "full_name": row.get("full_name") or "",
                "register_number": reg,
                "branch": row.get("branch") or "",
                "semester": row.get("semester"),
                "year": yr,
                "class_number": cn,
            }
        )

    if profiles:
        for profile in profiles:
            yr = int(profile.year)
            cn = int(profile.class_number)
            class_count = get_department_year_class_counts(department_id).get(yr, 1)
            total_slots = department_year_target_count(department_id, yr)
            for row in department_students_for_class(
                department_id, yr, cn, class_count, total_slots
            ):
                add_student(row, yr, cn)
        return sorted(students, key=lambda s: str(s.get("register_number") or ""))

    years = [int(year)] if year is not None else [1, 2, 3, 4]
    for yr in years:
        class_count = get_department_year_class_counts(department_id).get(yr, 1)
        total_slots = department_year_target_count(department_id, yr)
        class_numbers = (
            [int(class_number)]
            if class_number is not None
            else list(range(1, class_count + 1))
        )
        for cn in class_numbers:
            for row in department_students_for_class(
                department_id, yr, cn, class_count, total_slots
            ):
                add_student(row, yr, cn)

    return sorted(students, key=lambda s: str(s.get("register_number") or ""))


def _submitted_marksheets(
    department_id: int,
    batch: str,
    *,
    year: int | None = None,
    semester: int | None = None,
    class_number: int | None = None,
    assignment_id: int | None = None,
) -> list:
    """Mark sheets faculty submitted to the HOD — same scope as the checklist."""
    batch = (batch or "").strip()
    sheets = marksheets_submitted_to_department(department_id)

    if batch:
        sheets = [s for s in sheets if _sheet_matches_batch(s, department_id, batch)]

    if year is not None:
        sheets = [s for s in sheets if s.year is not None and int(s.year) == int(year)]
    if semester is not None:
        sheets = [s for s in sheets if s.semester is not None and int(s.semester) == int(semester)]
    if assignment_id:
        sheets = [s for s in sheets if s.course_assignment_id == int(assignment_id)]

    if class_number is not None and not assignment_id:
        cn = int(class_number)
        matched = []
        for sheet in sheets:
            if sheet.course_assignment_id:
                assignment = CourseAssignment.query.get(sheet.course_assignment_id)
                if assignment and int(assignment.class_number or 1) == cn:
                    matched.append(sheet)
        if matched:
            sheets = matched

    return sheets


def _components_from_submitted_sheets(sheets: list) -> list[dict]:
    """Components included in faculty submissions to the HOD."""
    if not sheets:
        return []

    faculty_ids = {s.faculty_id for s in sheets}
    faculty_map = {
        u.id: u.full_name
        for u in User.query.filter(User.id.in_(faculty_ids)).all()
    } if faculty_ids else {}

    records = build_submission_records(sheets, faculty_map)
    components: list[dict] = []
    seen: set[str] = set()

    for rec in records:
        for comp in rec.get("components") or []:
            cid = comp.get("id", "") if isinstance(comp, dict) else str(comp)
            label = resolve_component_label(comp)
            key = _norm_key(cid) or _norm_key(label)
            if key and key not in seen:
                seen.add(key)
                components.append({"component_id": cid, "component_label": label})

    if not components:
        for sheet in sheets:
            for cid in _sheet_component_ids(sheet):
                label = _component_label_on_sheet(sheet, cid)
                key = _norm_key(cid)
                if key and key not in seen:
                    seen.add(key)
                    components.append({"component_id": cid, "component_label": label})

    return components


def _resolve_component_in_sheets(sheets: list, component_id: str, filter_label: str = "") -> str:
    for sheet in sheets:
        resolved = resolve_sheet_component_id(sheet, component_id, filter_label)
        if resolved:
            return resolved
    return component_id


def _assignments_for_department(department_id: int) -> list[CourseAssignment]:
    course_ids = [c.id for c in Course.query.filter_by(department_id=department_id).all()]
    if not course_ids:
        return []
    return (
        CourseAssignment.query.filter(CourseAssignment.course_id.in_(course_ids))
        .order_by(CourseAssignment.year, CourseAssignment.semester, CourseAssignment.class_number)
        .all()
    )


def _batch_values_for_department(department_id: int) -> list[str]:
    batches = {
        (p.admission_year or "").strip()
        for p in DepartmentClassProfile.query.filter_by(department_id=department_id).all()
        if (p.admission_year or "").strip()
    }
    for sheet in marksheets_submitted_to_department(department_id):
        batch = (sheet.batch or "").strip()
        if batch:
            batches.add(batch)
            continue
        if sheet.course_assignment_id:
            assignment = CourseAssignment.query.get(sheet.course_assignment_id)
            if assignment:
                profile = DepartmentClassProfile.query.filter_by(
                    department_id=department_id,
                    year=int(assignment.year),
                    class_number=int(assignment.class_number or 1),
                ).first()
                admission = (profile.admission_year or "").strip() if profile else ""
                if admission:
                    batches.add(admission)
    return sorted(batches)


def _courses_for_batch(assignments: list, department_id: int, batch: str) -> list[dict]:
    if batch:
        assignments = _filter_assignments_by_batch(assignments, department_id, batch)
    courses = []
    seen = set()
    for a in assignments:
        course = a.course
        if not course:
            continue
        if a.id in seen:
            continue
        seen.add(a.id)
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
    return courses


def _filter_assignments_by_batch(assignments: list, department_id: int, batch: str) -> list:
    batch = (batch or "").strip()
    if not batch:
        return assignments

    profiles = DepartmentClassProfile.query.filter_by(department_id=department_id).all()
    valid_pairs = {
        (int(p.year), int(p.class_number))
        for p in profiles
        if (p.admission_year or "").strip() == batch
    }
    if valid_pairs:
        return [
            a
            for a in assignments
            if (int(a.year), int(a.class_number or 1)) in valid_pairs
        ]

    matching = []
    for assignment in assignments:
        sheets = _submitted_marksheets(department_id, batch, assignment_id=assignment.id)
        if sheets:
            matching.append(assignment)
    return matching or assignments


def mark_list_filter_options(department_id: int) -> dict:
    from models import Department

    dept = Department.query.get(department_id)
    assignments = _assignments_for_department(department_id)
    batches = _batch_values_for_department(department_id)
    years = sorted({int(a.year) for a in assignments if a.year})
    profile_years = {
        int(p.year)
        for p in DepartmentClassProfile.query.filter_by(department_id=department_id).all()
        if p.year
    }
    years = sorted(set(years) | profile_years)
    semesters = sorted({int(a.semester) for a in assignments if a.semester})
    classes = sorted({int(a.class_number or 1) for a in assignments})

    courses = _courses_for_batch(assignments, department_id, "")

    submitted_sheets = marksheets_submitted_to_department(department_id)
    components = _components_from_submitted_sheets(submitted_sheets)

    class_profiles = []
    for year in years:
        class_profiles.extend(get_department_class_profiles(department_id, year))

    return {
        "department_name": dept.name if dept else "",
        "batches": batches,
        "years": years,
        "semesters": semesters,
        "classes": classes,
        "courses": courses,
        "components": components,
        "class_profiles": class_profiles,
    }


def _resolve_assignment_for_sheet(sheet, department_id: int):
    """Course assignment id for attainment / mark sheet loading."""
    if sheet.course_assignment_id:
        return sheet.course_assignment_id
    if not sheet or not sheet.course_code:
        return None
    course_ids = [c.id for c in Course.query.filter_by(department_id=department_id).all()]
    if not course_ids:
        return None
    q = CourseAssignment.query.filter(
        CourseAssignment.course_id.in_(course_ids),
        CourseAssignment.faculty_id == sheet.faculty_id,
        CourseAssignment.year == sheet.year,
        CourseAssignment.semester == sheet.semester,
    ).join(Course, CourseAssignment.course_id == Course.id).filter(
        Course.course_code == sheet.course_code
    )
    assignment = q.first()
    return assignment.id if assignment else None


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
    batch = (batch or "").strip()
    if not batch:
        return {
            "students": [],
            "components": [],
            "course": None,
            "message": "Select an admission batch to view students.",
        }

    roster = _students_for_batch(
        department_id,
        batch,
        year=year,
        class_number=class_number,
    )

    sheets = _submitted_marksheets(
        department_id,
        batch,
        year=year,
        semester=semester,
        class_number=class_number,
        assignment_id=assignment_id,
    )

    components_meta = _components_from_submitted_sheets(sheets)
    filter_label = ""
    if component_id:
        filter_label = next(
            (
                c["component_label"]
                for c in components_meta
                if _norm_key(c["component_id"]) == _norm_key(component_id)
            ),
            "",
        )
        components_meta = [
            c
            for c in components_meta
            if _norm_key(c["component_id"]) == _norm_key(component_id)
            or component_matches(component_id, filter_label, c)
        ]
        if not components_meta:
            components_meta = [
                {"component_id": component_id, "component_label": filter_label or component_id}
            ]

    marks_by_reg = _merged_marks_by_register(sheets) if sheets else {}
    primary_sheet = _primary_sheet(sheets)

    students = []
    for idx, student in enumerate(roster, start=1):
        reg = str(student.get("register_number") or "").strip()
        reg_key = reg.upper()
        mark_row = marks_by_reg.get(reg_key, {})
        comp_marks = {}
        for meta in components_meta:
            cid = meta["component_id"]
            lookup_id = _resolve_component_in_sheets(
                sheets, cid, meta.get("component_label") or ""
            )
            obtained, max_m = _component_marks(mark_row, lookup_id or cid)
            comp_marks[cid] = {
                "obtained": round(obtained, 2),
                "max": max_m,
                "display": _component_display(mark_row, cid, obtained, max_m),
            }
        students.append(
            {
                "sno": idx,
                "register_number": reg,
                "full_name": student.get("full_name") or "",
                "year": student.get("year"),
                "class_number": student.get("class_number"),
                "component_marks": comp_marks,
            }
        )

    course = None
    message = None
    if assignment_id:
        assignment = CourseAssignment.query.get(assignment_id)
        if assignment and assignment.course:
            faculty = User.query.get(assignment.faculty_id) if assignment.faculty_id else None
            course = {
                "assignment_id": assignment.id,
                "course_code": assignment.course.course_code,
                "course_name": assignment.course.name,
                "year": assignment.year,
                "semester": assignment.semester,
                "class_number": assignment.class_number or 1,
                "class_label": f"Class {assignment.class_number or 1}",
                "faculty_name": faculty.full_name if faculty else "",
                "batch": batch,
                "marksheet_id": primary_sheet.id if primary_sheet else None,
            }
    elif primary_sheet:
        faculty = User.query.get(primary_sheet.faculty_id) if primary_sheet.faculty_id else None
        resolved_assignment_id = _resolve_assignment_for_sheet(primary_sheet, department_id)
        class_num = class_number or 1
        if resolved_assignment_id:
            assignment = CourseAssignment.query.get(resolved_assignment_id)
            if assignment:
                class_num = assignment.class_number or 1
        course = {
            "assignment_id": resolved_assignment_id,
            "course_code": primary_sheet.course_code or "",
            "course_name": primary_sheet.course_name or "",
            "year": primary_sheet.year,
            "semester": primary_sheet.semester,
            "class_number": class_num,
            "class_label": f"Class {class_num}",
            "faculty_name": faculty.full_name if faculty else "",
            "batch": batch,
            "marksheet_id": primary_sheet.id,
        }

    if not students:
        message = (
            f"No students found for batch {batch} in this department. "
            "Add students under Year settings or set admission year on class profiles."
        )
    elif not components_meta:
        message = (
            "Students listed for this batch. No mark components submitted by faculty yet — "
            "columns appear after faculty submit marks to the HOD."
        )
    elif not sheets:
        message = "No submitted mark sheets match these filters."

    submitted_courses = []
    if sheets:
        seen_codes = set()
        for sheet in sheets:
            code = (sheet.course_code or "").strip()
            if code and code not in seen_codes:
                seen_codes.add(code)
                submitted_courses.append(
                    {
                        "assignment_id": _resolve_assignment_for_sheet(sheet, department_id),
                        "course_code": sheet.course_code,
                        "course_name": sheet.course_name,
                        "year": sheet.year,
                        "semester": sheet.semester,
                    }
                )

    return {
        "students": students,
        "components": components_meta,
        "course": course,
        "batch": batch,
        "submitted_courses": submitted_courses,
        "message": message,
    }
