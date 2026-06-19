"""Helpers for parsing faculty CO/PO submissions."""

import json
import re

from utils.marksheet_constants import LEGACY_ASSESSMENT_LABELS


def parse_submission_data(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}
    return {}


def is_component_summary(data: dict) -> bool:
    if not data:
        return False
    if data.get("reportType") == "component_summary":
        return True
    if data.get("studentSummaries"):
        return True
    return bool(data.get("components"))


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def resolve_component_label(comp) -> str:
    if isinstance(comp, str):
        comp_id = comp.strip()
        if comp_id in LEGACY_ASSESSMENT_LABELS:
            return LEGACY_ASSESSMENT_LABELS[comp_id]
        return comp_id.replace("custom_", "").replace("_", " ")
    if not isinstance(comp, dict):
        return "—"
    label = (comp.get("label") or "").strip()
    comp_id = (comp.get("id") or "").strip()
    if label:
        return label
    if comp_id in LEGACY_ASSESSMENT_LABELS:
        return LEGACY_ASSESSMENT_LABELS[comp_id]
    return comp_id.replace("custom_", "").replace("_", " ") if comp_id else "—"


def components_from_submission(data: dict, sheet=None) -> list[dict]:
    """Resolve component list from stored submission payload."""
    components = data.get("components") or []
    if components:
        return [c if isinstance(c, dict) else {"id": str(c), "label": str(c)} for c in components]

    summaries = data.get("studentSummaries") or []
    if summaries:
        by_comp = summaries[0].get("byComponent") or {}
        if by_comp:
            return [
                {
                    "id": comp_id,
                    "label": (block.get("label") or comp_id) if isinstance(block, dict) else comp_id,
                }
                for comp_id, block in by_comp.items()
            ]

    if sheet is not None:
        ids = sheet.assessment_components or []
        label_map = sheet.assessment_labels if isinstance(sheet.assessment_labels, dict) else {}
        if isinstance(sheet.assessment_labels, list):
            label_map = {
                ids[i]: sheet.assessment_labels[i]
                for i in range(min(len(ids), len(sheet.assessment_labels)))
            }
        return [
            {
                "id": comp_id,
                "label": label_map.get(comp_id) or LEGACY_ASSESSMENT_LABELS.get(comp_id, comp_id),
            }
            for comp_id in ids
        ]

    return []


def _label_keys(*values: str) -> set[str]:
    keys: set[str] = set()
    for value in values:
        if not value:
            continue
        text = str(value).strip()
        keys.add(norm_key(text))
        if text in LEGACY_ASSESSMENT_LABELS:
            keys.add(norm_key(LEGACY_ASSESSMENT_LABELS[text]))
    return keys


def component_matches(item_id: str, item_label: str, comp: dict) -> bool:
    if not isinstance(comp, dict):
        return False
    item_keys = _label_keys(item_id, item_label)
    comp_keys = _label_keys(comp.get("id") or "", comp.get("label") or "")
    return bool(item_keys & comp_keys)


def build_submission_records(sheets, faculty_map: dict) -> list[dict]:
    """Build submission records from component-summary and per-marksheet CO submits."""
    seen_summary: set[tuple] = set()
    seen_sheet: set[int] = set()
    results: list[dict] = []

    for sheet in sheets:
        if not sheet.co_submitted:
            continue

        data = parse_submission_data(sheet.co_submission_data)
        submit_at = sheet.co_submitted_at.isoformat() if sheet.co_submitted_at else None
        course = data.get("course") or {}
        components = components_from_submission(data, sheet)
        if not components:
            continue

        if is_component_summary(data):
            summary_key = (
                sheet.faculty_id,
                submit_at,
                norm_key(sheet.course_code or ""),
            )
            if summary_key in seen_summary:
                continue
            seen_summary.add(summary_key)
        else:
            if sheet.id in seen_sheet:
                continue
            seen_sheet.add(sheet.id)

        results.append(
            {
                "course_code": sheet.course_code or course.get("code") or "",
                "course_name": sheet.course_name or course.get("name") or "",
                "year": sheet.year if sheet.year is not None else course.get("year"),
                "semester": sheet.semester if sheet.semester is not None else course.get("semester"),
                "batch": getattr(sheet, "batch", None) or "",
                "section": getattr(sheet, "section", None) or "",
                "components": components,
                "faculty_id": sheet.faculty_id,
                "faculty_name": faculty_map.get(sheet.faculty_id, ""),
                "submitted_at": submit_at,
                "sheet_id": sheet.id,
                "submission": data,
            }
        )

    return results


def flatten_submission_rows(records: list[dict]) -> list[dict]:
    """One HOD table row per component (CA1, CA2, etc.)."""
    rows: list[dict] = []
    seen_rows: set[tuple] = set()

    for rec in records:
        data = rec.get("submission") or {}
        for idx, comp in enumerate(rec.get("components") or []):
            comp_id = comp.get("id", "") if isinstance(comp, dict) else str(comp)
            comp_label = resolve_component_label(comp)
            row_key = (
                rec.get("faculty_id"),
                rec.get("submitted_at"),
                norm_key(rec.get("course_code") or ""),
                comp_id or comp_label,
                rec.get("sheet_id"),
            )
            if row_key in seen_rows:
                continue
            seen_rows.add(row_key)

            rows.append(
                {
                    "row_id": f"{rec.get('sheet_id')}-{comp_id or idx}",
                    "sheet_id": rec.get("sheet_id"),
                    "course_code": rec.get("course_code") or "",
                    "course_name": rec.get("course_name") or "",
                    "year": rec.get("year"),
                    "semester": rec.get("semester"),
                    "faculty_id": rec.get("faculty_id"),
                    "faculty_name": rec.get("faculty_name") or "",
                    "component_id": comp_id,
                    "component": comp_label,
                    "submitted_at": rec.get("submitted_at"),
                    "submission": data,
                }
            )

    return rows
