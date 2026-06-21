"""Create in-app notifications for faculty."""

from models import Notification


def notify_faculty_checklist_assignment(*, faculty_id, hod_user, checklist_item, assignment):
    """Notify the faculty assigned to this course only."""
    if not faculty_id:
        return None

    label = (checklist_item.component_label or checklist_item.component_id or "Component").strip()
    course_label = f"{checklist_item.course_code} — {checklist_item.course_name}".strip(" —")
    sem_text = f" · Sem {checklist_item.semester}" if checklist_item.semester else ""
    hod_name = hod_user.full_name if hod_user else "Your HOD"

    notification = Notification(
        user_id=faculty_id,
        type="checklist_assignment",
        title="New checklist component assigned",
        message=(
            f'{hod_name} assigned "{label}" for {course_label} '
            f"(Year {checklist_item.year}{sem_text})."
        ),
        checklist_item_id=checklist_item.id,
        course_assignment_id=assignment.id if assignment else checklist_item.course_assignment_id,
        course_code=checklist_item.course_code or "",
        component_label=label,
        created_by=hod_user.id if hod_user else None,
    )
    return notification
