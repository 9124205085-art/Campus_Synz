import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function HeroPanel() {
  return (
    <div className="relative flex min-h-[280px] flex-1 flex-col justify-between overflow-hidden bg-navy p-8 text-white lg:min-h-screen lg:p-12 xl:p-16">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -left-16 top-1/4 h-64 w-64 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -right-20 top-10 h-80 w-80 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute bottom-20 left-1/3 h-48 w-48 rounded-full bg-white/[0.07]" />
      <div className="pointer-events-none absolute -bottom-10 right-1/4 h-56 w-56 rounded-full bg-white/5" />

      <div className="relative z-10 flex items-center gap-4 sm:gap-5">
        <img
          src="/kcg-logo.png"
          alt=""
          aria-hidden
          className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24"
        />
        <div>
          <p className="text-3xl font-black tracking-[0.12em] text-white sm:text-4xl">KCG</p>
          <div className="my-2 h-0.5 w-full max-w-[240px] bg-red-400" />
          <p className="text-base font-black uppercase tracking-wide text-white sm:text-lg">
            College of Technology
          </p>
          <p className="mt-1.5 text-[11px] font-bold text-slate-200 sm:text-xs">
            Affiliated to Anna University | Autonomous
          </p>
        </div>
      </div>

      <div className="relative z-10 my-10 flex flex-1 items-center lg:my-0">
        <div className="max-w-sm rounded-2xl bg-navy-dark/80 px-6 py-5 backdrop-blur-sm ring-1 ring-white/10">
          <p className="text-2xl font-bold leading-snug sm:text-3xl lg:text-4xl">
            Track CO · Measure PO · Achieve Excellence
          </p>
        </div>
      </div>

      <p className="relative z-10 text-xs text-slate-400">
        © {new Date().getFullYear()} KCG College of Technology. All rights reserved.
      </p>
    </div>
  )
}

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    const paths = {
      admin: '/admin/dashboard',
      hod: '/hod/dashboard',
      faculty: '/faculty/dashboard',
    }
    return <Navigate to={paths[user.role] || '/login'} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const redirectPath = await login(email.trim(), password)
      navigate(redirectPath)
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <HeroPanel />

      {/* Login panel */}
      <div className="flex flex-1 flex-col justify-center bg-white px-6 py-10 sm:px-12 lg:px-16 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-bold text-slate-900">Login</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and password to access the CO PO Management Portal
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-600">
                Email or username
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email or username"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-navy focus:ring-2 focus:ring-navy/15"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-600">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3.5 pr-12 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-navy focus:ring-2 focus:ring-navy/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              <div className="mt-2 text-right">
                <button
                  type="button"
                  className="text-sm font-medium text-navy hover:text-navy-dark"
                  onClick={() => alert('Contact your system administrator to reset your password.')}
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-navy py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="mt-10 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Login credentials</p>
            <p className="mt-1.5">Admin: admin@kcgcollege.edu / Admin@123</p>
            <p className="mt-1">HOD (Mech): mechhod@gmail.com / mechhod</p>
            <p className="mt-1">Faculty (Mech): mechstaff1@gmail.com / mechstaff1</p>
            <p className="mt-2 text-slate-400">You can also use your username instead of email.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
