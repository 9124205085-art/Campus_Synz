"""One-time: flatten dict question_cos / question_marks to arrays in mark_sheets."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from extensions import db
from models import MarkSheet
from utils.marksheet_service import flatten_question_cos, flatten_question_marks


def run():
    app = create_app()
    with app.app_context():
        updated = 0
        for sheet in MarkSheet.query.all():
            comps = sheet.assessment_components or []
            nq = sheet.num_questions or 0
            if not nq:
                continue
            flat_m = flatten_question_marks(sheet.question_marks, nq, comps)
            flat_c = flatten_question_cos(sheet.question_cos, nq, comps)
            if sheet.question_marks != flat_m or sheet.question_cos != flat_c:
                sheet.question_marks = flat_m
                sheet.question_cos = flat_c
                updated += 1
        db.session.commit()
        print(f"Flattened {updated} mark sheet(s).")


if __name__ == "__main__":
    run()
