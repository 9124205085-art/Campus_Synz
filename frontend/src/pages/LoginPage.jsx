import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      {/* Left branding panel */}
      <div className="flex flex-1 flex-col justify-between bg-navy p-8 text-white lg:p-16">
        <div>
          <h1 className="text-3xl font-bold leading-tight lg:text-4xl">
            College Management System
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-200 lg:text-base">
            Official Campus Management Portal of KCG College of Technology. Secure access
            for administrators, heads of department, and faculty members.
          </p>
        </div>
        <p className="mt-12 text-xs text-slate-400">
          © {new Date().getFullYear()} KCG COLLEGE OF TECHNOLOGY. All rights reserved.
        </p>
      </div>

      {/* Right login panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12 lg:px-16">
        {/* Logo badge */}
        <div className="absolute right-6 top-6 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-md lg:right-12 lg:top-12">
          <span className="text-lg font-bold text-navy">KCG</span>
        </div>

        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl lg:p-12">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800">Login to Continue</h2>
            <p className="mt-2 text-sm text-slate-500">For authorized users only</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20"
              />
              <div className="mt-2 text-right">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-navy"
                  onClick={() => alert('Contact your system administrator to reset your password.')}
                >
                  Forgot your password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-navy py-3.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <div className="mt-8 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Demo admin login</p>
            <p className="mt-2">admin@kcgcollege.edu / Admin@123</p>
            <p className="mt-2 text-slate-400">
              HOD and Faculty use the email and password set by the admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
