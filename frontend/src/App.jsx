import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import AdminDashboard from './pages/AdminDashboard'
import HODDashboard from './pages/HODDashboard'
import HodMarkListPage from './pages/hod/HodMarkListPage'
import HodSectionPage, { HodPlaceholderPage } from './pages/hod/HodSectionPage'
import HodStudentYearPage from './pages/hod/HodStudentYearPage'
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
        path="/hod/faculty"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodSectionPage section="faculty" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/courses"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodSectionPage section="courses" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/assignments"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodSectionPage section="assignments" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/classes"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodSectionPage section="classes" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/students/:year"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodStudentYearPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/marks"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodMarkListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/reports"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodPlaceholderPage title="Reports" breadcrumbs={['Dashboard', 'Reports']} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hod/settings"
        element={
          <ProtectedRoute allowedRoles={['hod']}>
            <HodPlaceholderPage title="Settings" breadcrumbs={['Dashboard', 'Settings']} />
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
