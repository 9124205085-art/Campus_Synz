import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  { to: '/hod/dashboard', label: 'Dashboard' },
  { to: '/hod/faculty', label: 'Faculty' },
  { to: '/hod/courses', label: 'Courses' },
  { to: '/hod/assignments', label: 'Assignments' },
  { to: '/hod/classes', label: 'Classes' },
  { type: 'heading', label: 'Students' },
  { to: '/hod/students/1', label: 'Year 1 Students' },
  { to: '/hod/students/2', label: 'Year 2 Students' },
  { to: '/hod/students/3', label: 'Year 3 Students' },
  { to: '/hod/students/4', label: 'Year 4 Students' },
  { to: '/hod/marks', label: 'Marks' },
  { to: '/hod/reports', label: 'Reports' },
  { to: '/hod/settings', label: 'Settings' },
]

function initials(name) {
  if (!name) return 'H'
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function HodShell({ children, title, breadcrumbs = [] }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const dept = user?.department_detail || user?.department_rel

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white">
              CS
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">CampusSynz</p>
              <p className="text-[10px] text-slate-500">CO PO Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV.map((item) =>
              item.type === 'heading' ? (
                <li key={item.label} className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.label}
                </li>
              ) : (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        {dept && (
          <div className="border-t border-slate-100 p-4">
            <div className="rounded-xl bg-violet-50 p-3 text-xs">
              <p className="font-semibold text-violet-900">Department</p>
              <p className="mt-1 text-violet-800">{dept.name || user?.department}</p>
              <p className="mt-2 text-violet-600">Academic Year</p>
              <p className="font-medium text-violet-900">2025-2026</p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg text-slate-400">☰</span>
            <div>
              {breadcrumbs.length > 0 && (
                <p className="text-xs text-slate-500">
                  {breadcrumbs.join(' › ')}
                </p>
              )}
              <h1 className="text-lg font-bold text-slate-900">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">{user?.full_name}</p>
              <p className="text-xs uppercase text-slate-500">HOD</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
              {initials(user?.full_name)}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
