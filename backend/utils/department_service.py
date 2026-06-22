"""Department-linked data and course assignments for dashboards."""

from extensions import db
from models import Course, CourseAssignment, Department, FacultyClassRoster, Student, User


def get_department_detail(department_id):
    if not department_id:
        return None
    dept = Department.query.get(department_id)
    return dept.to_dict() if dept else None


def assignments_for_department(department_id):
    """All course assignments in a department with course + faculty details."""
    courses = Course.query.filter_by(department_id=department_id).all()
    course_ids = [c.id for c in courses]
    if not course_ids:
        return []

    assignments = (
        CourseAssignment.query.filter(CourseAssignment.course_id.in_(course_ids))
        .order_by(CourseAssignment.year, CourseAssignment.created_at.desc())
        .all()
    )
    result = []
    for a in assignments:
        item = a.to_dict()
        if a.course:
            item.update(
                {
                    "department": a.course.department,
                    "department_id": a.course.department_id,
                }
            )
        result.append(item)
    return result


def assignments_for_faculty(faculty_id):
    return [
        a.to_dict()
        for a in CourseAssignment.query.filter_by(faculty_id=faculty_id)
        .order_by(CourseAssignment.year.desc())
        .all()
    ]


def faculty_has_course_assignment(faculty_id, course_code, year, semester):
    """True if this faculty is assigned the course for the given academic term."""
    if not faculty_id or not course_code:
        return False
    match = (
        CourseAssignment.query.join(Course, CourseAssignment.course_id == Course.id)
        .filter(
            CourseAssignment.faculty_id == faculty_id,
            Course.course_code == course_code.strip().upper(),
            CourseAssignment.year == int(year),
            CourseAssignment.semester == int(semester),
        )
        .first()
    )
    return match is not None


def _assignment_matches_sheet(assignment, sheet) -> bool:
    course = assignment.course if assignment else None
    if not course or not sheet:
        return False
    return (
        (sheet.course_code or "").strip().upper() == (course.course_code or "").strip().upper()
        and int(sheet.year or 0) == int(assignment.year or 0)
        and int(sheet.semester or 0) == int(assignment.semester or 0)
    )


def faculty_course_assignments(faculty_id):
    return CourseAssignment.query.filter_by(faculty_id=faculty_id).all()


def marksheet_is_for_assigned_course(sheet, faculty_id) -> bool:
    """True when the sheet belongs to this faculty and matches an HOD assignment."""
    if not sheet or sheet.faculty_id != faculty_id:
        return False
    return any(
        _assignment_matches_sheet(assignment, sheet)
        for assignment in faculty_course_assignments(faculty_id)
    )


def filter_marksheets_to_assigned_courses(sheets, faculty_id):
    """Keep only mark sheets for courses HOD assigned to this faculty."""
    if not sheets:
        return []
    assignments = faculty_course_assignments(faculty_id)
    if not assignments:
        return []
    return [
        sheet
        for sheet in sheets
        if any(_assignment_matches_sheet(assignment, sheet) for assignment in assignments)
    ]


def courses_with_assignments(department_id):
    """Courses in dept enriched with assignment rows."""
    courses = (
        Course.query.filter_by(department_id=department_id)
        .order_by(Course.course_code)
        .all()
    )
    out = []
    for course in courses:
        item = course.to_dict()
        assigns = CourseAssignment.query.filter_by(course_id=course.id).all()
        item["assignments"] = [a.to_dict() for a in assigns]
        item["staff"] = [a.to_dict() for a in assigns]
        names = [a.faculty.full_name for a in assigns if a.faculty]
        item["staff_display"] = ", ".join(names) if names else "Not assigned"
        out.append(item)
    return out


def faculty_with_course_summaries(department_id, active_only=False):
    """Faculty in a department with assigned courses and course count."""
    query = User.query.filter_by(role="faculty", department_id=department_id)
    if active_only:
        query = query.filter_by(is_active=True)
    faculty_users = query.order_by(User.full_name).all()

    result = []
    for faculty in faculty_users:
        assigns = assignments_for_faculty(faculty.id)
        course_labels = []
        for a in assigns:
            cls = a.get("class_label") or f"Class {a.get('class_number', 1)}"
            course_labels.append(
                f"{a['course_code']} — {a['course_name']} (Year {a['year']}, {cls})"
            )
        item = faculty.to_dict()
        item["courses"] = assigns
        item["course_list"] = course_labels
        item["courses_display"] = ", ".join(course_labels) if course_labels else "—"
        item["course_count"] = len(assigns)
        result.append(item)
    return result


def faculty_assigned_years(faculty_id):
    """Academic years this faculty is assigned to teach via HOD course assignment."""
    years = set()
    for assignment in CourseAssignment.query.filter_by(faculty_id=faculty_id).all():
        try:
            years.add(int(assignment.year))
        except (TypeError, ValueError):
            continue
    return sorted(years)


def faculty_has_year_assignment(faculty_id, year) -> bool:
    try:
        year = int(year)
    except (TypeError, ValueError):
        return False
    return (
        CourseAssignment.query.filter_by(faculty_id=faculty_id, year=year).first()
        is not None
    )


def faculty_assigned_class_numbers(faculty_id, year) -> list[int]:
    """Class numbers this faculty teaches for the given year (from course assignments)."""
    try:
        year = int(year)
    except (TypeError, ValueError):
        return []
    classes = sorted(
        {
            int(a.class_number or 1)
            for a in CourseAssignment.query.filter_by(faculty_id=faculty_id, year=year).all()
        }
    )
    return classes or [1]


def class_slot_range(class_number: int, total_slots: int, class_count: int) -> tuple[int, int]:
    """Inclusive 1-based slot range for a class (matches HOD year list division)."""
    if total_slots <= 0 or class_count <= 0:
        return 1, 0
    class_number = max(1, min(int(class_number), int(class_count)))
    base, remainder = divmod(int(total_slots), int(class_count))
    if class_number <= remainder:
        size = base + 1
        start = (class_number - 1) * size + 1
    else:
        size = base
        start = remainder * (base + 1) + (class_number - remainder - 1) * base + 1
    end = start + size - 1
    return start, end


def get_department_class_profiles(department_id, year, default_department_name: str = "") -> list:
    """Class profile rows for each class in a year (with slot ranges)."""
    from models import Department, DepartmentClassProfile

    try:
        year = int(year)
    except (TypeError, ValueError):
        return []

    dept = Department.query.get(department_id) if department_id else None
    dept_label = (default_department_name or (dept.name if dept else "") or "").strip()
    class_count = get_department_year_class_counts(department_id).get(year, 1)
    total_slots = department_year_target_count(department_id, year)

    saved = {
        row.class_number: row
        for row in DepartmentClassProfile.query.filter_by(
            department_id=department_id, year=year
        ).all()
    }

    profiles = []
    for class_number in range(1, class_count + 1):
        row = saved.get(class_number)
        start, end = class_slot_range(class_number, total_slots, class_count)
        if row:
            payload = row.to_dict()
        else:
            payload = {
                "id": None,
                "department_id": department_id,
                "year": year,
                "class_number": class_number,
                "class_label": f"Class {class_number}",
                "department_name": dept_label,
                "class_teacher_name": "",
                "semester": 1,
                "admission_year": "",
                "updated_at": None,
            }
        payload["slot_start"] = start
        payload["slot_end"] = end
        payload["student_capacity"] = max(0, end - start + 1) if end >= start else 0
        profiles.append(payload)
    return profiles


def upsert_department_class_profile(department_id, year, class_number, data: dict):
    from models import DepartmentClassProfile

    try:
        year = int(year)
        class_number = int(class_number)
    except (TypeError, ValueError):
        return None, ["Valid year and class number are required."]
    if year not in (1, 2, 3, 4):
        return None, ["Year must be between 1 and 4."]
    if class_number < 1 or class_number > 50:
        return None, ["Class number must be between 1 and 50."]

    max_class = get_department_year_class_counts(department_id).get(year, 1)
    if class_number > max_class:
        return None, [f"Class {class_number} is not configured for year {year}."]

    department_name = (data.get("department_name") or "").strip() or None
    class_teacher_name = (data.get("class_teacher_name") or "").strip() or None
    admission_year = (data.get("admission_year") or "").strip() or None

    semester = data.get("semester")
    if semester is not None and semester != "":
        try:
            semester = int(semester)
        except (TypeError, ValueError):
            return None, ["Semester must be a number."]
        if semester not in (1, 2, 3, 4, 5, 6, 7, 8):
            return None, ["Semester must be between 1 and 8."]
    else:
        semester = None

    row = DepartmentClassProfile.query.filter_by(
        department_id=department_id, year=year, class_number=class_number
    ).first()
    if row:
        row.department_name = department_name
        row.class_teacher_name = class_teacher_name
        row.semester = semester
        row.admission_year = admission_year
    else:
        row = DepartmentClassProfile(
            department_id=department_id,
            year=year,
            class_number=class_number,
            department_name=department_name,
            class_teacher_name=class_teacher_name,
            semester=semester,
            admission_year=admission_year,
        )
        db.session.add(row)
    db.session.commit()

    profiles = get_department_class_profiles(department_id, year, department_name or "")
    profile = next((p for p in profiles if p["class_number"] == class_number), row.to_dict())
    return profile, []


def department_year_target_count(department_id, year) -> int:
    """Total slot count for a year (HOD setting, else named student count)."""
    try:
        year = int(year)
    except (TypeError, ValueError):
        return 0
    named = list_department_students(department_id, year)
    named_count = len(named)
    effective = get_effective_students_by_year(department_id, {year: named_count})
    target = int(effective.get(year, named_count) or 0)
    if target <= 0:
        return named_count
    return max(target, named_count)


def department_year_slotted_students(department_id, year) -> list[dict]:
    """Named department students with 1-based slot numbers (same order as HOD list)."""
    students = list_department_students(department_id, year)
    return [{**student, "slot": idx + 1} for idx, student in enumerate(students)]


def department_students_for_class(
    department_id, year, class_number, class_count=None, total_slots=None
) -> list[dict]:
    """Named students whose slot falls in the given class range."""
    try:
        year = int(year)
        class_number = int(class_number)
    except (TypeError, ValueError):
        return []

    if class_count is None:
        class_count = get_department_year_class_counts(department_id).get(year, 1)
    if total_slots is None:
        total_slots = department_year_target_count(department_id, year)

    start, end = class_slot_range(class_number, total_slots, class_count)
    if end < start:
        return []

    result = []
    for student in department_year_slotted_students(department_id, year):
        slot = student.get("slot") or 0
        reg = str(student.get("register_number") or "").strip()
        name = str(student.get("full_name") or "").strip()
        if start <= slot <= end and reg and name:
            row = {k: v for k, v in student.items() if k != "slot"}
            result.append(
                {
                    "full_name": name,
                    "register_number": reg,
                    "branch": row.get("branch") or "",
                    "semester": row.get("semester"),
                    "slot": slot,
                }
            )
    return result


def department_students_for_faculty_year(faculty_id, year, semester=None) -> list:
    """HOD-managed department students for faculty's assigned year and class."""
    faculty = User.query.get(faculty_id)
    if not faculty or not faculty.department_id:
        return []
    if not faculty_has_year_assignment(faculty_id, year):
        return []

    try:
        year = int(year)
    except (TypeError, ValueError):
        return []

    department_id = faculty.department_id
    class_count = get_department_year_class_counts(department_id).get(year, 1)
    total_slots = department_year_target_count(department_id, year)
    assigned_classes = faculty_assigned_class_numbers(faculty_id, year)

    seen_regs = set()
    result = []
    for class_number in assigned_classes:
        for student in department_students_for_class(
            department_id, year, class_number, class_count, total_slots
        ):
            reg = str(student.get("register_number") or "").strip().upper()
            if not reg or reg in seen_regs:
                continue
            seen_regs.add(reg)
            result.append(
                {
                    "full_name": student["full_name"],
                    "register_number": student["register_number"],
                    "branch": student.get("branch") or "",
                    "semester": student.get("semester"),
                }
            )

    return sorted(result, key=lambda s: str(s.get("register_number") or ""))


def faculty_hod_roster_entries(faculty_id) -> list:
    """Virtual roster rows from HOD student lists, one per assigned year and class."""
    faculty = User.query.get(faculty_id)
    if not faculty or not faculty.department_id:
        return []

    dept_name = (faculty.department_rel.name if faculty.department_rel else "") or ""
    department_id = faculty.department_id
    seen = set()
    entries = []

    for assignment in CourseAssignment.query.filter_by(faculty_id=faculty_id).all():
        try:
            year = int(assignment.year)
        except (TypeError, ValueError):
            continue
        class_number = int(assignment.class_number or 1)
        key = (year, class_number)
        if key in seen:
            continue
        seen.add(key)

        class_count = get_department_year_class_counts(department_id).get(year, 1)
        total_slots = department_year_target_count(department_id, year)
        students = department_students_for_class(
            department_id, year, class_number, class_count, total_slots
        )
        if not students:
            continue

        semester = int(assignment.semester or 1)
        branch = students[0].get("branch") or "Bachelor of Technology"
        entries.append(
            {
                "id": f"hod-{year}-class-{class_number}",
                "faculty_id": faculty_id,
                "branch": branch,
                "department": dept_name,
                "year": year,
                "semester": semester,
                "class_number": class_number,
                "class_label": f"Class {class_number}",
                "students": [
                    {
                        "full_name": s["full_name"],
                        "register_number": s["register_number"],
                    }
                    for s in students
                ],
                "count": len(students),
                "source": "hod_department",
                "read_only": True,
                "updated_at": None,
            }
        )

    return entries


def faculty_ids_for_department(department_id):
    if not department_id:
        return []
    return [
        u.id
        for u in User.query.filter_by(role="faculty", department_id=department_id).all()
    ]


def faculty_names_for_department_year(department_id, year=None):
    """Active faculty in a department who teach (or roster) for the given year."""
    if not department_id:
        return []

    try:
        year_int = int(year) if year is not None else None
    except (TypeError, ValueError):
        year_int = None

    seen = set()
    names = []

    course_ids = [
        c.id for c in Course.query.filter_by(department_id=department_id).all()
    ]
    if course_ids and year_int:
        assignments = CourseAssignment.query.filter(
            CourseAssignment.course_id.in_(course_ids),
            CourseAssignment.year == year_int,
        ).all()
        for assignment in assignments:
            faculty = assignment.faculty
            if faculty and faculty.id not in seen and faculty.is_active:
                seen.add(faculty.id)
                names.append(faculty.full_name)

    faculty_ids = faculty_ids_for_department(department_id)
    if faculty_ids and year_int:
        rosters = FacultyClassRoster.query.filter(
            FacultyClassRoster.faculty_id.in_(faculty_ids),
            FacultyClassRoster.year == year_int,
        ).all()
        for roster in rosters:
            if roster.faculty_id in seen:
                continue
            faculty = User.query.get(roster.faculty_id)
            if faculty and faculty.is_active:
                seen.add(faculty.id)
                names.append(faculty.full_name)

    if not names and year_int:
        for faculty in (
            User.query.filter_by(role="faculty", department_id=department_id, is_active=True)
            .order_by(User.full_name)
            .all()
        ):
            if faculty.id not in seen:
                seen.add(faculty.id)
                names.append(faculty.full_name)

    return sorted(names)


def department_class_student_stats(department_id):
    """Distinct class groups and student headcount by academic year for HOD dashboard."""
    empty = {
        "class_count": 0,
        "students_by_year": {1: 0, 2: 0, 3: 0, 4: 0},
    }
    department = Department.query.get(department_id) if department_id else None
    if not department:
        return empty

    class_keys = set()
    seen_by_year = {1: set(), 2: set(), 3: set(), 4: set()}
    counts = {1: 0, 2: 0, 3: 0, 4: 0}
    fallback_idx = {1: 0, 2: 0, 3: 0, 4: 0}

    def add_student(year, register_number, full_name):
        try:
            year = int(year)
        except (TypeError, ValueError):
            return
        if year not in counts:
            return
        reg = str(register_number or "").strip().lower()
        name = str(full_name or "").strip().lower()
        key = reg or f"__name__{name}__{fallback_idx[year]}"
        if not reg:
            fallback_idx[year] += 1
        if key in seen_by_year[year]:
            return
        seen_by_year[year].add(key)
        counts[year] += 1

    faculty_ids = faculty_ids_for_department(department_id)
    if faculty_ids:
        rosters = FacultyClassRoster.query.filter(
            FacultyClassRoster.faculty_id.in_(faculty_ids)
        ).all()
        for roster in rosters:
            class_keys.add(
                (int(roster.year), int(roster.semester), str(roster.branch or "").strip())
            )
            for entry in roster.students or []:
                add_student(
                    roster.year,
                    entry.get("register_number"),
                    entry.get("full_name") or entry.get("student_name"),
                )

    dept_name = (department.name or "").strip()
    if dept_name:
        students = Student.query.filter(
            db.func.lower(Student.department) == dept_name.lower()
        ).all()
        for student in students:
            class_keys.add(
                (int(student.year), int(student.semester), str(student.branch or "").strip())
            )
            add_student(student.year, student.register_number, student.full_name)

    return {
        "class_count": len(class_keys),
        "students_by_year": counts,
    }


def list_department_classes(department_id):
    """Class groups in a department for HOD detail view."""
    department = Department.query.get(department_id) if department_id else None
    if not department:
        return []

    classes = []
    seen = set()
    faculty_ids = faculty_ids_for_department(department_id)
    faculty_names = {
        u.id: u.full_name
        for u in User.query.filter(User.id.in_(faculty_ids)).all()
    } if faculty_ids else {}

    if faculty_ids:
        rosters = FacultyClassRoster.query.filter(
            FacultyClassRoster.faculty_id.in_(faculty_ids)
        ).order_by(FacultyClassRoster.year, FacultyClassRoster.semester).all()
        for roster in rosters:
            key = (int(roster.year), int(roster.semester), str(roster.branch or "").strip())
            if key in seen:
                continue
            seen.add(key)
            classes.append(
                {
                    "year": roster.year,
                    "semester": roster.semester,
                    "branch": roster.branch or "",
                    "department": roster.department or department.name,
                    "faculty_name": faculty_names.get(roster.faculty_id, "—"),
                    "student_count": len(roster.students or []),
                    "source": "faculty_roster",
                }
            )

    dept_name = (department.name or "").strip()
    if dept_name:
        students = Student.query.filter(
            db.func.lower(Student.department) == dept_name.lower()
        ).all()
        groups = {}
        for student in students:
            key = (int(student.year), int(student.semester), str(student.branch or "").strip())
            groups[key] = groups.get(key, 0) + 1
        for key, count in sorted(groups.items()):
            if key in seen:
                continue
            seen.add(key)
            classes.append(
                {
                    "year": key[0],
                    "semester": key[1],
                    "branch": key[2],
                    "department": dept_name,
                    "faculty_name": "—",
                    "student_count": count,
                    "source": "database",
                }
            )

    return sorted(classes, key=lambda c: (c["year"], c["semester"], c["branch"]))


def list_department_students(department_id, year=None):
    """Students in department, optionally filtered by year."""
    department = Department.query.get(department_id) if department_id else None
    if not department:
        return []

    dept_name = (department.name or "").strip()
    year_int = None
    if year not in (None, "", "all"):
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            year_int = None

    by_reg = {}
    faculty_ids = faculty_ids_for_department(department_id)
    faculty_names = {
        u.id: u.full_name
        for u in User.query.filter(User.id.in_(faculty_ids)).all()
    } if faculty_ids else {}

    if dept_name:
        query = Student.query.filter(
            db.func.lower(Student.department) == dept_name.lower()
        )
        if year_int:
            query = query.filter_by(year=year_int)
        for student in query.order_by(Student.register_number).all():
            reg = str(student.register_number or "").strip().lower()
            by_reg[reg] = {
                **student.to_dict(),
                "editable": True,
                "source": "database",
                "faculty_name": None,
            }

    if faculty_ids:
        rosters = FacultyClassRoster.query.filter(
            FacultyClassRoster.faculty_id.in_(faculty_ids)
        ).all()
        for roster in rosters:
            if year_int and int(roster.year) != year_int:
                continue
            fname = faculty_names.get(roster.faculty_id, "—")
            for entry in roster.students or []:
                reg = str(entry.get("register_number") or "").strip().lower()
                if not reg:
                    continue
                if reg in by_reg:
                    existing = by_reg[reg].get("faculty_name") or ""
                    if fname not in existing.split(", "):
                        by_reg[reg]["faculty_name"] = (
                            f"{existing}, {fname}".strip(", ")
                            if existing
                            else fname
                        )
                    continue
                by_reg[reg] = {
                    "id": None,
                    "register_number": entry.get("register_number") or "",
                    "full_name": entry.get("full_name") or entry.get("student_name") or "",
                    "branch": roster.branch or "",
                    "department": roster.department or dept_name,
                    "year": roster.year,
                    "semester": roster.semester,
                    "editable": False,
                    "source": "faculty_roster",
                    "faculty_name": fname,
                }

    year_faculty = faculty_names_for_department_year(department_id, year_int)
    year_faculty_label = ", ".join(year_faculty) if year_faculty else None
    for student in by_reg.values():
        if not student.get("faculty_name") and year_faculty_label:
            student["faculty_name"] = year_faculty_label

    return sorted(
        by_reg.values(),
        key=lambda s: str(s.get("register_number") or s.get("full_name") or ""),
    )


def get_department_year_class_counts(department_id):
    """Configured class count per year (1–4), default 1 when not set."""
    counts = {1: 1, 2: 1, 3: 1, 4: 1}
    if not department_id:
        return counts
    from models import DepartmentYearSetting

    rows = DepartmentYearSetting.query.filter_by(department_id=department_id).all()
    for row in rows:
        if row.year in counts and row.class_count and row.class_count >= 1:
            counts[row.year] = int(row.class_count)
    return counts


def get_effective_students_by_year(department_id, computed_by_year=None):
    """Student headcount per year — HOD override when set, else roster/database count."""
    computed = {1: 0, 2: 0, 3: 0, 4: 0}
    if computed_by_year:
        for year in (1, 2, 3, 4):
            computed[year] = int(computed_by_year.get(year, 0) or 0)

    if not department_id:
        return computed

    from models import DepartmentYearSetting

    rows = {
        row.year: row
        for row in DepartmentYearSetting.query.filter_by(department_id=department_id).all()
    }
    effective = {}
    for year in (1, 2, 3, 4):
        row = rows.get(year)
        if row is not None and row.student_count is not None:
            effective[year] = int(row.student_count)
        else:
            effective[year] = computed.get(year, 0)
    return effective


def set_department_year_setting(department_id, year, class_count=None, student_count=None):
    from models import DepartmentYearSetting

    try:
        year = int(year)
    except (TypeError, ValueError):
        return None, ["Valid year is required."]
    if year not in (1, 2, 3, 4):
        return None, ["Year must be between 1 and 4."]
    if class_count is None and student_count is None:
        return None, ["Provide class count and/or student count."]

    parsed_class = None
    parsed_students = None
    if class_count is not None:
        try:
            parsed_class = int(class_count)
        except (TypeError, ValueError):
            return None, ["Class count must be a number."]
        if parsed_class < 1 or parsed_class > 50:
            return None, ["Class count must be between 1 and 50."]
    if student_count is not None:
        try:
            parsed_students = int(student_count)
        except (TypeError, ValueError):
            return None, ["Student count must be a number."]
        if parsed_students < 0 or parsed_students > 10000:
            return None, ["Student count must be between 0 and 10000."]

    row = DepartmentYearSetting.query.filter_by(department_id=department_id, year=year).first()
    if row:
        if parsed_class is not None:
            row.class_count = parsed_class
        if parsed_students is not None:
            row.student_count = parsed_students
    else:
        row = DepartmentYearSetting(
            department_id=department_id,
            year=year,
            class_count=parsed_class if parsed_class is not None else 1,
            student_count=parsed_students,
        )
        db.session.add(row)
    db.session.commit()
    return row, []


def set_department_year_class_count(department_id, year, class_count):
    return set_department_year_setting(department_id, year, class_count=class_count)


def get_department_year_settings(department_id, students_by_year=None):
    """Year settings with student counts and average students per class."""
    roster_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    if students_by_year:
        for year in (1, 2, 3, 4):
            roster_counts[year] = int(students_by_year.get(year, 0) or 0)

    effective = get_effective_students_by_year(department_id, roster_counts)
    class_counts = get_department_year_class_counts(department_id)
    settings = []
    for year in (1, 2, 3, 4):
        student_count = effective.get(year, 0)
        classes = class_counts.get(year, 1)
        per_class = round(student_count / classes, 1) if classes and student_count else 0
        settings.append(
            {
                "year": year,
                "class_count": classes,
                "student_count": student_count,
                "roster_student_count": roster_counts.get(year, 0),
                "students_per_class": per_class,
            }
        )
    return settings


def _hod_stats_from_dept_data(dept_data):
    cs = dept_data.get("class_student_stats") or {}
    roster_by_year = cs.get("students_by_year") or {}
    dept_id = dept_data.get("department_id")
    class_by_year = cs.get("classes_by_year") or get_department_year_class_counts(dept_id)
    by_year = get_effective_students_by_year(dept_id, roster_by_year)
    return {
        "faculty_count": len(dept_data.get("faculty_with_courses") or dept_data["staff"]),
        "courses_count": len(dept_data["courses"]),
        "assignments_count": len(dept_data["assignments"]),
        "class_count": sum(class_by_year.get(y, 1) for y in (1, 2, 3, 4)),
        "students_year_1": by_year.get(1, 0),
        "students_year_2": by_year.get(2, 0),
        "students_year_3": by_year.get(3, 0),
        "students_year_4": by_year.get(4, 0),
        "classes_year_1": class_by_year.get(1, 1),
        "classes_year_2": class_by_year.get(2, 1),
        "classes_year_3": class_by_year.get(3, 1),
        "classes_year_4": class_by_year.get(4, 1),
    }


def sync_marksheet_department(sheet, faculty):
    """Link mark sheet to the faculty member's department (for HOD routing)."""
    if not faculty or not faculty.department_id:
        return False
    sheet.department_id = faculty.department_id
    if faculty.department_rel:
        sheet.department_label = faculty.department_rel.name
    return True


def attach_submission_routing(payload: dict, faculty, hod) -> dict:
    """Stamp department/HOD routing so submissions stay scoped to the creating HOD's dept."""
    if not isinstance(payload, dict):
        return payload
    return {
        **payload,
        "submitted_to_department_id": faculty.department_id if faculty else None,
        "submitted_by_faculty_id": faculty.id if faculty else None,
        "target_hod_id": hod.id if hod else None,
    }


def get_department_hod(department_id):
    """Active HOD for a department (the HOD who manages that department's faculty)."""
    if not department_id:
        return None
    return User.query.filter_by(
        role="hod",
        department_id=department_id,
        is_active=True,
    ).first()


def marksheets_submitted_to_department(department_id):
    """CO submissions visible only to the HOD of the faculty's own department."""
    from models import MarkSheet

    if not department_id:
        return []

    return (
        MarkSheet.query.join(User, MarkSheet.faculty_id == User.id)
        .filter(
            MarkSheet.co_submitted.is_(True),
            User.role == "faculty",
            User.department_id == department_id,
        )
        .order_by(MarkSheet.co_submitted_at.desc())
        .all()
    )


def hod_can_access_submission(hod, sheet):
    if not hod or not hod.department_id or not sheet or not sheet.co_submitted:
        return False
    faculty = User.query.get(sheet.faculty_id)
    if not faculty or faculty.role != "faculty":
        return False
    return faculty.department_id == hod.department_id


def get_department_dashboard_data(department_id, faculty_id=None):
    if not department_id:
        return {
            "department": None,
            "department_detail": None,
            "department_id": None,
            "staff": [],
            "courses": [],
            "assignments": [],
            "connected": False,
        }

    department = Department.query.get(department_id)
    if not department:
        return {
            "department": None,
            "department_detail": None,
            "department_id": department_id,
            "staff": [],
            "courses": [],
            "assignments": [],
            "connected": False,
        }

    faculty_users = (
        User.query.filter_by(role="faculty", department_id=department_id, is_active=True)
        .order_by(User.full_name)
        .all()
    )
    staff = [f.to_dict() for f in faculty_users]

    if faculty_id:
        assigned = assignments_for_faculty(faculty_id)
        course_list = []
        for a in assigned:
            course_list.append(
                {
                    "id": a["course_id"],
                    "assignment_id": a["id"],
                    "course_code": a["course_code"],
                    "name": a["course_name"],
                    "regulation": a["regulation"],
                    "year": a["year"],
                    "semester": a["semester"],
                    "class_number": a.get("class_number", 1),
                    "class_label": a.get("class_label") or f"Class {a.get('class_number', 1)}",
                    "department": department.name,
                    "department_id": department.id,
                    "faculty_name": a["faculty_name"],
                    "staff_display": a["faculty_name"],
                }
            )
    else:
        course_list = courses_with_assignments(department_id)

    faculty_summary = faculty_with_course_summaries(department_id)
    class_student_stats = department_class_student_stats(department_id)
    class_student_stats["classes_by_year"] = get_department_year_class_counts(department_id)
    year_settings = get_department_year_settings(
        department_id, class_student_stats.get("students_by_year")
    )

    return {
        "department": department.name,
        "department_detail": department.to_dict(),
        "department_id": department.id,
        "staff": staff,
        "faculty_with_courses": faculty_summary,
        "courses": course_list,
        "assignments": assignments_for_department(department_id),
        "class_student_stats": class_student_stats,
        "year_settings": year_settings,
        "connected": True,
    }
