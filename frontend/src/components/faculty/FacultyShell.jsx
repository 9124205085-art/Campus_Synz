import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function initials(name) {
  if (!name) return 'F'
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function FacultyShell({ children, semester, onSemesterChange, semesters = [] }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">
              CS
            </div>
            <div>
              <p className="text-sm font-bold text-navy">CampusSynz</p>
              <p className="text-xs text-slate-500">CO Attainment System</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <label className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex">
              SEMESTER
              <select
                value={semester}
                onChange={(e) => onSemesterChange(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800"
              >
                <option value="all">All semesters</option>
                {semesters.map((s) => {
                  const val = s.key || s
                  const lab = s.label || s
                  return (
                    <option key={val} value={val}>
                      {lab}
                    </option>
                  )
                })}
              </select>
            </label>

            <button
              type="button"
              className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
              title="Notifications"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-9.33-5.03M9 17v1a3 3 0 006 0v-1M9 17H4"
                />
              </svg>
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                2
              </span>
            </button>

            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/10 text-xs font-bold text-navy">
                {initials(user?.full_name)}
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-800">{user?.full_name}</p>
                <p className="text-xs capitalize text-slate-500">Faculty</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} CampusSynz — CO Attainment System · Version 1.0.0
      </footer>
    </div>
  )
}
