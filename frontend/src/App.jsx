import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/AdminDashboard'
import HODDashboard from './pages/HODDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import FacultyMarkSheetPage from './pages/FacultyMarkSheetPage'
import COAttainmentPage from './pages/COAttainmentPage'

function RootRedirect() {
  const { user, loading, getDashboardPath } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <Navigate to={getDashboardPath(user.role)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/dashboard"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HODDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/dashboard"
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <FacultyDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/marksheet/:sheetId"
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <FacultyMarkSheetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/marksheet/:sheetId/co-attainment"
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <COAttainmentPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
