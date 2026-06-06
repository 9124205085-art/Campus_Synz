import os

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from extensions import db, jwt
from routes import register_routes


def create_app(config_class=Config):
  app = Flask(__name__)
  app.config.from_object(config_class)

  os.makedirs(os.path.join(os.path.dirname(__file__), "database"), exist_ok=True)

  db.init_app(app)
  jwt.init_app(app)

  # Fix: supports_credentials=True cannot be used with origins="*"
  # Specify the exact frontend origin instead
  CORS(
    app,
    resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
    supports_credentials=True,
  )

  register_routes(app)

  with app.app_context():
    from database.migrate_marksheet_v2 import apply_marksheet_schema_updates

    apply_marksheet_schema_updates()

  @app.route("/api/health", methods=["GET"])
  def health():
    return jsonify({"status": "ok", "message": "College Management System API is running."})

  @jwt.unauthorized_loader
  def unauthorized_callback(reason):
    return jsonify({"message": "Authorization token is missing or invalid."}), 401

  @jwt.invalid_token_loader
  def invalid_token_callback(error):
    return jsonify({"message": "Invalid token."}), 401

  @jwt.expired_token_loader
  def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"message": "Token has expired. Please login again."}), 401

  return app


if __name__ == "__main__":
  application = create_app()
  application.run(debug=True, port=5000)
