import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Verifying session...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const redirectMap = {
      admin: '/admin/dashboard',
      hod: '/hod/dashboard',
      faculty: '/faculty/dashboard',
    }
    return <Navigate to={redirectMap[user.role] || '/login'} replace />
  }

  return children
}
