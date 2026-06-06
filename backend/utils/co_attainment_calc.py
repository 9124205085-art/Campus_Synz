"""CO attainment calculations for faculty dashboard and reports."""

from utils.marksheet_service import flatten_question_cos, flatten_question_marks


def _has_entered_marks(sheet) -> bool:
    components = sheet.assessment_components or []
    for row in sheet.student_rows or []:
        for aid in components:
            marks = (row.get("assessment_marks") or {}).get(aid) or []
            if any(str(m).strip() != "" for m in marks):
                return True
    return False


def _attainment_level(pct: float) -> int:
    if pct >= 75:
        return 3
    if pct >= 60:
        return 2
    if pct >= 40:
        return 1
    return 0


def _default_weightages(components: list[str]) -> dict[str, float]:
    if not components:
        return {}
    share = 100.0 / len(components)
    return {c: share for c in components}


def calculate_attainment_for_sheet(sheet, threshold: float = 60.0, weightages: dict | None = None):
    """Return component CO results and average CO attainment % for a mark sheet."""
    if not _has_entered_marks(sheet):
        return None

    components = sheet.assessment_components or []
    num_q = sheet.num_questions or 0
    if not components or not num_q:
        return None

    question_cos = flatten_question_cos(sheet.question_cos, num_q, components)
    question_marks = flatten_question_marks(sheet.question_marks, num_q, components)
    weightages = weightages or _default_weightages(components)

    used_cos = sorted(set(question_cos))
    component_results = {}

    for aid in components:
        co_attainment = {}
        for co in used_cos:
            q_indices = [i for i, c in enumerate(question_cos) if c == co]
            if not q_indices:
                continue
            max_mark = sum(float(question_marks[i]) for i in q_indices)
            pass_score = (threshold / 100.0) * max_mark
            attained = 0
            total = 0
            for row in sheet.student_rows or []:
                marks = (row.get("assessment_marks") or {}).get(aid)
                if not marks:
                    continue
                total += 1
                score = sum(float(marks[i] or 0) for i in q_indices)
                if score >= pass_score:
                    attained += 1
            pct = (attained / total * 100) if total else 0.0
            co_attainment[co] = {
                "attained": attained,
                "total": total,
                "pct": round(pct, 2),
                "level": _attainment_level(pct),
            }
        component_results[aid] = co_attainment

    active = [c for c in components if (weightages.get(c) or 0) > 0]
    co_pcts = []
    for co in used_cos:
        pcts_for_co = []
        for aid in active:
            entry = component_results.get(aid, {}).get(co)
            if entry:
                pcts_for_co.append(entry["pct"])
        if pcts_for_co:
            co_pcts.append(sum(pcts_for_co) / len(pcts_for_co))

    course_avg = round(sum(co_pcts) / len(co_pcts), 2) if co_pcts else None

    return {
        "used_cos": used_cos,
        "component_results": component_results,
        "course_avg_pct": course_avg,
        "co_count": len(used_cos),
    }


def course_status(avg_pct: float | None, target: float = 70.0) -> str:
    if avg_pct is None:
        return "pending"
    if avg_pct >= target:
        return "met"
    if avg_pct >= 50:
        return "moderate"
    return "low"


def build_faculty_dashboard_stats(sheets, target: float = 70.0) -> dict:
    """Aggregate analytics from saved mark sheets for one faculty member."""
    course_rows = []
    co_pct_sums: dict[str, list[float]] = {}
    total_students = 0

    for sheet in sheets:
        total_students += sheet.num_students or 0
        threshold = getattr(sheet, "passing_threshold", 60.0) or 60.0
        weightages = getattr(sheet, "component_weightages", None) or {}
        if isinstance(weightages, dict) and weightages:
            weightages = {k: float(v) for k, v in weightages.items()}
        else:
            weightages = _default_weightages(sheet.assessment_components or [])

        calc = calculate_attainment_for_sheet(sheet, threshold, weightages)
        avg_pct = calc["course_avg_pct"] if calc else None
        status = course_status(avg_pct, target)

        co_breakdown = []
        if calc:
            primary = (sheet.assessment_components or [None])[0]
            for co, data in calc["component_results"].get(primary, {}).items():
                co_breakdown.append({"co": co, "pct": data["pct"]})

        course_rows.append(
            {
                "id": sheet.id,
                "course_code": sheet.course_code,
                "course_name": sheet.course_name,
                "regulation": sheet.regulation,
                "semester": sheet.semester,
                "year": sheet.year,
                "co_count": calc["co_count"] if calc else len(set(flatten_question_cos(
                    sheet.question_cos, sheet.num_questions or 0, sheet.assessment_components or []
                ))),
                "avg_attainment": avg_pct,
                "status": status,
                "co_breakdown": co_breakdown,
            }
        )

        if calc:
            primary = (sheet.assessment_components or [None])[0]
            for co, data in calc["component_results"].get(primary, {}).items():
                co_pct_sums.setdefault(co, []).append(data["pct"])

    co_overview = [
        {
            "co": co,
            "pct": round(sum(vals) / len(vals), 2),
        }
        for co, vals in sorted(co_pct_sums.items())
    ]

    with_avg = [r for r in course_rows if r["avg_attainment"] is not None]
    avg_all = (
        round(sum(r["avg_attainment"] for r in with_avg) / len(with_avg), 2)
        if with_avg
        else None
    )
    met = sum(1 for r in with_avg if r["avg_attainment"] >= target)
    moderate = sum(1 for r in with_avg if 50 <= r["avg_attainment"] < target)
    low = sum(1 for r in with_avg if r["avg_attainment"] < 50)

    semesters = sorted(
        {
            f"Year {s.year} · Sem {s.semester}"
            for s in sheets
            if s.year and s.semester
        },
        reverse=True,
    )

    return {
        "stats": {
            "courses_count": len(sheets),
            "students_count": total_students,
            "avg_co_attainment": avg_all,
            "courses_met_target": met,
            "courses_total_with_data": len(with_avg),
            "target_pct": target,
        },
        "co_overview": co_overview,
        "distribution": {
            "met": met,
            "moderate": moderate,
            "low": low,
            "total": len(with_avg),
        },
        "recent_courses": sorted(
            course_rows,
            key=lambda r: r["avg_attainment"] if r["avg_attainment"] is not None else -1,
            reverse=True,
        ),
        "semesters": semesters or ["All semesters"],
    }
