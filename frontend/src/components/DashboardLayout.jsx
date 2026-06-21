import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardLayout({ title, subtitle, showLogo = false, fullWidth = false, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className={`mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8 ${fullWidth ? 'max-w-none' : 'max-w-6xl'}`}>
          <div className="flex items-center gap-3 sm:gap-4">
            {showLogo && (
              <>
                <img
                  src="/kcg-logo.png"
                  alt=""
                  aria-hidden
                  className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12"
                />
                <div className="border-r border-slate-200 pr-3 sm:pr-4">
                  <p className="text-base font-black tracking-wide text-navy sm:text-lg">KCG</p>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 sm:text-xs">
                    College of Technology
                  </p>
                </div>
              </>
            )}
            <div>
              <h1 className="text-xl font-bold text-navy">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">{user?.full_name}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 ${fullWidth ? 'max-w-none' : 'max-w-6xl'}`}
      >
        {children}
      </main>
    </div>
  )
}
