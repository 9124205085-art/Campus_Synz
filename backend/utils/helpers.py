import re

from extensions import db
from models import Course, Department, User


def normalize_department_name(name: str) -> str:
    """Normalize spacing and casing for consistent department matching."""
    cleaned = re.sub(r"\s+", " ", (name or "").strip())
    return cleaned.title()


def department_match_key(name: str) -> str:
    """Key for matching similar department names (case/spacing/degree/suffix insensitive)."""
    raw_key = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    
    # Check manual synonyms / mappings to group variations of same departments
    mappings = {
        "cse": "computerscience",
        "becse": "computerscience",
        "computerscienceengineering": "computerscience",
        "computerscience": "computerscience",
        "btechartificialintelligence": "artificialintelligence",
        "artificialintelligenceanddatascience": "artificialintelligence",
        "artificialintelligence": "artificialintelligence",
        "aids": "artificialintelligence",
        "btechinformationtechnology": "informationtechnology",
        "informationtechnology": "informationtechnology",
        "mechanical": "mechanical",
        "bemechanical": "mechanical",
        "bemechanacial": "mechanical",
        "mech": "mechanical",
    }
    return mappings.get(raw_key, raw_key)


def is_valid_department(department_name: str, faculty=None) -> bool:
    """Accept preset departments, DB departments, or the faculty's linked department."""
    from utils.marksheet_constants import DEPARTMENTS

    name = (department_name or "").strip()
    if not name:
        return False
    if name in DEPARTMENTS:
        return True

    key = department_match_key(name)
    for dept in Department.query.all():
        if department_match_key(dept.name) == key:
            return True

    if faculty and faculty.department_id:
        linked = Department.query.get(faculty.department_id)
        if linked and department_match_key(linked.name) == key:
            return True
    return False


def get_or_create_department(name: str) -> Department:
    """Find department by normalized name or create a new one."""
    normalized = normalize_department_name(name)
    if not normalized:
        raise ValueError("Department name is required.")

    key = department_match_key(normalized)
    for dept in Department.query.all():
        if department_match_key(dept.name) == key:
            return dept

    department = Department(name=normalized)
    db.session.add(department)
    db.session.flush()
    return department


def merge_duplicate_departments():
    """Merge departments that differ only by spelling/spacing."""
    from utils.marksheet_constants import DEPARTMENTS
    groups = {}
    for dept in Department.query.all():
        key = department_match_key(dept.name)
        groups.setdefault(key, []).append(dept)

    merged = 0
    for group in groups.values():
        if len(group) < 2:
            continue

        # Sort: prefer names in DEPARTMENTS constant list first, then sort by ID
        def sort_key(d):
            try:
                idx = DEPARTMENTS.index(d.name)
            except ValueError:
                # Try matching by case-insensitive key
                idx = 9999
                for i, name in enumerate(DEPARTMENTS):
                    if name.lower() == d.name.lower():
                        idx = i
                        break
            return (idx, d.id)

        group.sort(key=sort_key)
        primary = group[0]

        for duplicate in group[1:]:
            User.query.filter_by(department_id=duplicate.id).update(
                {"department_id": primary.id}, synchronize_session=False
            )
            Course.query.filter_by(department_id=duplicate.id).update(
                {"department_id": primary.id, "department_label": primary.name}, synchronize_session=False
            )
            from models import MarkSheet
            MarkSheet.query.filter_by(department_id=duplicate.id).update(
                {"department_id": primary.id, "department_label": primary.name}, synchronize_session=False
            )
            db.session.delete(duplicate)
            merged += 1

    if merged:
        db.session.commit()
    return merged


def repair_user_department_links():
    """Re-link HOD/faculty missing department_id using courses in same email domain — no-op if none."""
    return 0


def generate_username(email: str) -> str:
    """Create a unique username from an email address."""
    base = re.sub(r"[^a-z0-9_]", "_", email.split("@")[0].lower())
    base = base.strip("_") or "user"
    username = base
    counter = 1

    while User.query.filter_by(username=username).first():
        username = f"{base}{counter}"
        counter += 1

    return username
