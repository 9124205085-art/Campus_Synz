# CampusSynz — College Management System

A modular, beginner-friendly college management system with **Flask**, **React**, **Tailwind CSS**, **SQLite**, and **JWT authentication**.

## Features

- Secure login with password hashing (Werkzeug)
- JWT access tokens with role claims
- Role-based authorization (Admin, HOD, Faculty)
- Protected API routes and React routes
- Separate dashboards per role
- Split-screen login UI (reference-inspired design)

## Project Structure

```
college-management-system/
├── backend/
│   ├── app.py              # Flask application factory
│   ├── config.py           # Configuration
│   ├── models.py           # SQLAlchemy User model
│   ├── extensions.py       # DB & JWT extensions
│   ├── routes/
│   │   ├── auth.py         # Login, logout, profile
│   │   └── dashboard.py    # Role-protected dashboards
│   ├── utils/
│   │   └── decorators.py   # @role_required decorator
│   └── database/
│       └── init_db.py      # Create DB & seed users
│
└── frontend/
    ├── src/
    │   ├── components/     # ProtectedRoute, DashboardLayout
    │   ├── context/        # AuthContext (JWT state)
    │   ├── pages/          # Login + dashboards
    │   └── services/       # Axios API client
    └── ...
```

## Team Responsibilities

| Member | Focus |
|--------|--------|
| Member 1 | JWT auth, login, route protection |
| Member 2 | SQLite, SQLAlchemy models, seed data |
| Member 3 | React UI, Tailwind, dashboards |
| Member 4 | API testing, docs (`docs/API.md`) |

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python database/init_db.py
python app.py
```

API runs at: `http://localhost:5000`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at: `http://localhost:5173`

## Mark Sheet (Faculty)

1. Faculty dashboard → **Create Mark Entry Sheet**
2. Select components (CA1/2, Assignments, Quizzes, Model exam)
3. Enter course code, name, regulation, branch, department, year, semester
4. Configure questions (count, CO per question, mark weight: 1/2/13/14/16)
5. Students auto-load from the database for the selected class

Seed sample students (bulk):

```bash
cd backend
python database/seed_students.py
```

Add one student (names must match mark sheet filters exactly):

```bash
python database/add_student.py --register 2024CSE099 --name "Your Student Name" ^
  --branch "Bachelor of Technology" --department "Computer Science Engineering" ^
  --year 1 --semester 1
```

**Manual entry (default):** choose “Manual — type names in the sheet”, set number of students, then type each name in the Excel grid.

**Mark rules:** each question has a max mark (1, 2, 13, 14, or 16) set before opening the sheet. Per cell you may enter **0** or any whole number **up to** that max (e.g. 2-mark question → 0, 1, or 2 only).

Students from the database appear only when you choose “Load from database” and filters match.

## Default Login Credentials

| Role    | Username     | Password    |
|---------|--------------|-------------|
| Admin   | `admin@kcgcollege.edu` | `Admin@123` |
| HOD     | `hod.cse@kcgcollege.edu` | `Hod@123`   |
| Faculty | `faculty.cse@kcgcollege.edu` | `Faculty@123` |

## API Endpoints

| Method | Endpoint | Auth | Role |
|--------|----------|------|------|
| GET | `/api/health` | No | — |
| POST | `/api/auth/login` | No | — |
| GET | `/api/auth/me` | JWT | Any |
| POST | `/api/auth/logout` | JWT | Any |
| GET | `/api/dashboard/admin` | JWT | admin |
| GET | `/api/dashboard/hod` | JWT | hod |
| GET | `/api/dashboard/faculty` | JWT | faculty |

See [docs/API.md](docs/API.md) for request/response examples and testing steps.

## Security Notes (Production)

- Change `SECRET_KEY` and `JWT_SECRET_KEY` via environment variables
- Use HTTPS in production
- Consider refresh tokens and token blacklisting for logout
- Never commit `.env` files

## GitHub Setup

```bash
git init
git add .
git commit -m "Initial commit: auth system with JWT and role-based dashboards"
git remote add origin <your-repo-url>
git push -u origin main
```
