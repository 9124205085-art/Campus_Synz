from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy import or_

from models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate with email or username and password."""
    data = request.get_json(silent=True) or {}

    login_id = (data.get("email") or data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not login_id or not password:
        return jsonify({"message": "Email and password are required."}), 400

    user = User.query.filter(
        or_(User.email == login_id, User.username == login_id)
    ).first()

    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid email or password."}), 401

    if not user.is_active:
        return jsonify({"message": "Your account is inactive. Contact the administrator."}), 403

    if user.role in ("hod", "faculty") and user.department_rel:
        if not user.department_rel.is_active:
            return jsonify({"message": "Your department is inactive. Contact the administrator."}), 403

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "username": user.username},
    )

    return jsonify(
        {
            "message": "Login successful.",
            "access_token": access_token,
            "user": user.to_dict(),
        }
    ), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return currently authenticated user profile."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user:
        return jsonify({"message": "User not found."}), 404

    return jsonify({"user": user.to_dict()}), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Logout endpoint for client-side token cleanup."""
    return jsonify({"message": "Logged out successfully."}), 200
