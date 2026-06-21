import { useCallback, useEffect, useState } from 'react'
import AdminDetailPanel from '../components/AdminDetailPanel'
import AdminStatCard from '../components/admin/AdminStatCard'
import AdminStatDetailsModal from '../components/admin/AdminStatDetailsModal'
import AdminUserManagement from '../components/admin/AdminUserManagement'
import DashboardLayout from '../components/DashboardLayout'
import { adminAPI, dashboardAPI } from '../services/api'

function userTypeForRole(role) {
  if (role === 'faculty') return 'Faculty'
  if (role === 'admin') return 'Admin'
  return 'HOD'
}

function formFromUser(user) {
  return {
    ...user,
    name: user.full_name,
    password: '',
    department_id: user.department_id || '',
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [addRole, setAddRole] = useState('hod')
  const [form, setForm] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [statDetailType, setStatDetailType] = useState(null)
  const [deptPanelMode, setDeptPanelMode] = useState(null)
  const [selectedDept, setSelectedDept] = useState(null)
  const [deptForm, setDeptForm] = useState({})
  const [coursePanelMode, setCoursePanelMode] = useState(null)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [courseForm, setCourseForm] = useState({})
  const [statModalKey, setStatModalKey] = useState(0)

  const loadStats = useCallback(async () => {
    const res = await dashboardAPI.admin()
    setStats(res.data.stats)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats, refreshKey])

  const bumpRefresh = () => setRefreshKey((n) => n + 1)

  const openAddUser = () => {
    setSelected(null)
    setPanelMode('add')
    setAddRole('hod')
    setError('')
    setForm({
      employee_id: '',
      name: '',
      email: '',
      mobile: '',
      designation: 'hod',
      is_active: true,
      password: '',
      department_id: '',
      department: '',
    })
  }

  const openViewUser = (user) => {
    setStatDetailType(null)
    setSelected(user)
    setPanelMode('view')
    setForm(formFromUser(user))
    setError('')
  }

  const closePanel = () => {
    setPanelMode(null)
    setSelected(null)
    setError('')
  }

  const emptyDeptForm = () => ({
    name: '',
    code: '',
    degree: 'B.Tech',
    duration: '4',
    status: 'active',
  })

  const openAddDepartment = () => {
    setStatDetailType(null)
    setSelectedDept(null)
    setDeptPanelMode('add')
    setDeptForm(emptyDeptForm())
    setError('')
  }

  const openViewDepartment = (dept) => {
    setStatDetailType(null)
    setSelectedDept(dept)
    setDeptPanelMode('view')
    setDeptForm({
      ...dept,
      duration: String(dept.duration ?? 4),
    })
    setError('')
  }

  const closeDeptPanel = () => {
    setDeptPanelMode(null)
    setSelectedDept(null)
    setError('')
  }

  const handleSaveDepartment = async () => {
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const payload = {
        name: (deptForm.name || '').trim(),
        code: (deptForm.code || '').trim(),
        degree: deptForm.degree || 'B.Tech',
        duration: parseInt(deptForm.duration, 10) || 4,
        status: deptForm.status || 'active',
      }

      if (!payload.name || !payload.code) {
        setError('Department name and code are required.')
        setSubmitting(false)
        return
      }

      if (deptPanelMode === 'add') {
        await adminAPI.addDepartment(payload)
        setMessage('Department added successfully.')
      } else {
        await adminAPI.updateDepartment(selectedDept.id, payload)
        setMessage('Department updated successfully.')
      }

      closeDeptPanel()
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save department.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteDepartment = async (dept) => {
    const target = dept || selectedDept
    if (!target?.id) return
    if (
      !window.confirm(
        `Delete department "${target.name}"? All HODs, faculty, and courses in this department will also be removed.`,
      )
    ) {
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await adminAPI.deleteDepartment(target.id)
      setMessage('Department deleted successfully.')
      closeDeptPanel()
      setStatModalKey((k) => k + 1)
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  const emptyCourseForm = () => ({
    course_code: '',
    name: '',
    regulation: '',
    department_id: '',
    department: '',
  })

  const openAddCourse = () => {
    setStatDetailType(null)
    setSelectedCourse(null)
    setCoursePanelMode('add')
    setCourseForm(emptyCourseForm())
    setError('')
  }

  const openViewCourse = (course) => {
    setStatDetailType(null)
    setSelectedCourse(course)
    setCoursePanelMode('view')
    setCourseForm({
      ...course,
      department_id: course.department_id || '',
    })
    setError('')
  }

  const closeCoursePanel = () => {
    setCoursePanelMode(null)
    setSelectedCourse(null)
    setError('')
  }

  const handleSaveCourse = async () => {
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const payload = {
        course_code: (courseForm.course_code || '').trim(),
        name: (courseForm.name || '').trim(),
        regulation: (courseForm.regulation || '').trim(),
        department_id: courseForm.department_id ? Number(courseForm.department_id) : undefined,
        department: courseForm.department,
      }

      if (!payload.course_code || !payload.name || !payload.regulation) {
        setError('Course code, name, and regulation are required.')
        setSubmitting(false)
        return
      }
      if (!payload.department_id && !payload.department?.trim()) {
        setError('Please select a department.')
        setSubmitting(false)
        return
      }

      if (coursePanelMode === 'add') {
        await adminAPI.addCourse(payload)
        setMessage('Course added successfully.')
      } else {
        await adminAPI.updateCourse(selectedCourse.id, payload)
        setMessage('Course updated successfully.')
      }

      closeCoursePanel()
      setStatModalKey((k) => k + 1)
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save course.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteCourse = async (course) => {
    const target = course || selectedCourse
    if (!target?.id) return
    if (!window.confirm(`Delete course "${target.course_code} — ${target.name}"? This cannot be undone.`)) {
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await adminAPI.deleteCourse(target.id)
      setMessage('Course deleted successfully.')
      closeCoursePanel()
      setStatModalKey((k) => k + 1)
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (user) => {
    const target = user || selected
    if (!target?.id) return
    if (target.role === 'admin') {
      setError('Admin accounts cannot be deleted.')
      return
    }
    if (!window.confirm(`Delete ${target.full_name}? This cannot be undone.`)) return

    setSubmitting(true)
    setError('')
    try {
      if (target.role === 'hod') await adminAPI.deleteHod(target.id)
      else if (target.role === 'faculty') await adminAPI.deleteFaculty(target.id)
      else {
        setError('This account cannot be deleted.')
        setSubmitting(false)
        return
      }
      setMessage('User deleted successfully.')
      closePanel()
      setStatModalKey((k) => k + 1)
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatDelete = async (type, item) => {
    if (type === 'department') await handleDeleteDepartment(item)
    else if (type === 'course') await handleDeleteCourse(item)
    else if (type === 'hod' || type === 'faculty') await handleDeleteUser({ ...item, role: type })
  }

  const handleSaveUser = async () => {
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const payload = { ...form }
      if (payload.name && !payload.full_name) payload.full_name = payload.name

      if (!payload.department_id && !payload.department?.trim()) {
        setError('Please select a department.')
        setSubmitting(false)
        return
      }
      if (payload.department_id) {
        payload.department_id = Number(payload.department_id)
      }

      const role = panelMode === 'add' ? addRole : selected?.role
      if (role === 'hod') {
        if (panelMode === 'add') await adminAPI.addHod(payload)
        else await adminAPI.updateHod(selected.id, payload)
      } else if (role === 'faculty') {
        if (panelMode === 'add') await adminAPI.addFaculty(payload)
        else await adminAPI.updateFaculty(selected.id, payload)
      } else {
        setError('Only HOD and Faculty accounts can be added here.')
        setSubmitting(false)
        return
      }

      setMessage(panelMode === 'add' ? 'User added successfully.' : 'User updated successfully.')
      closePanel()
      bumpRefresh()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Operation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const panelType = selected ? userTypeForRole(selected.role) : addRole === 'faculty' ? 'Faculty' : 'HOD'

  return (
    <DashboardLayout title="Admin Dashboard" showLogo fullWidth>
      <div className="mb-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            label="Total Users"
            value={stats?.total_users ?? '—'}
            subtitle="All registered users"
            icon="users"
            iconBg="bg-blue-500"
          />
          <AdminStatCard
            label="Active Users"
            value={stats?.active_users ?? '—'}
            subtitle="Active and verified users"
            icon="active"
            iconBg="bg-emerald-500"
            subtitleClass="text-emerald-600"
          />
          <AdminStatCard
            label="Inactive Users"
            value={stats?.inactive_users ?? '—'}
            subtitle="Inactive users"
            icon="inactive"
            iconBg="bg-amber-500"
            subtitleClass="text-amber-600"
          />
          <AdminStatCard
            label="Admins"
            value={stats?.total_admins ?? '—'}
            subtitle="System administrators"
            icon="admin"
            iconBg="bg-violet-500"
            subtitleClass="text-violet-600"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            label="HODs"
            value={stats?.total_hods ?? '—'}
            subtitle="Heads of department — click to view"
            icon="hod"
            iconBg="bg-slate-700"
            onClick={() => setStatDetailType('hod')}
          />
          <AdminStatCard
            label="Faculty"
            value={stats?.total_faculty ?? '—'}
            subtitle="Teaching staff accounts — click to view"
            icon="faculty"
            iconBg="bg-sky-600"
            subtitleClass="text-sky-600"
            onClick={() => setStatDetailType('faculty')}
          />
          <AdminStatCard
            label="Departments"
            value={stats?.departments ?? '—'}
            subtitle="Registered departments — click to view"
            icon="department"
            iconBg="bg-teal-600"
            subtitleClass="text-teal-600"
            onClick={() => setStatDetailType('department')}
          />
          <AdminStatCard
            label="Courses"
            value={stats?.total_courses ?? '—'}
            subtitle="Courses in the system — click to view"
            icon="course"
            iconBg="bg-indigo-600"
            subtitleClass="text-indigo-600"
            onClick={() => setStatDetailType('course')}
          />
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          {message}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">Setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Start by creating a department, then assign an HOD to that department.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openAddDepartment}
            className="rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Add Department
          </button>
          <button
            type="button"
            onClick={openAddUser}
            className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-dark"
          >
            + Add HOD / Faculty
          </button>
        </div>
      </div>

      <AdminUserManagement
        refreshKey={refreshKey}
        onView={openViewUser}
        onAddUser={openAddUser}
        onDelete={handleDeleteUser}
      />

      {statDetailType && (
        <AdminStatDetailsModal
          key={statModalKey}
          type={statDetailType}
          onClose={() => setStatDetailType(null)}
          onViewUser={statDetailType === 'hod' || statDetailType === 'faculty' ? openViewUser : undefined}
          onViewDepartment={statDetailType === 'department' ? openViewDepartment : undefined}
          onViewCourse={statDetailType === 'course' ? openViewCourse : undefined}
          onAddDepartment={statDetailType === 'department' ? openAddDepartment : undefined}
          onAddCourse={statDetailType === 'course' ? openAddCourse : undefined}
          onDelete={handleStatDelete}
        />
      )}

      {coursePanelMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto">
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                {error}
              </div>
            )}
            <AdminDetailPanel
              type="Course"
              mode={coursePanelMode === 'add' ? 'add' : coursePanelMode}
              form={courseForm}
              setForm={setCourseForm}
              submitting={submitting}
              onSubmit={(action) => {
                if (action === 'edit') setCoursePanelMode('edit')
                else if (action === 'delete') handleDeleteCourse()
                else handleSaveCourse()
              }}
              onDelete={() => handleDeleteCourse()}
              onCancel={closeCoursePanel}
            />
          </div>
        </div>
      )}

      {deptPanelMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto">
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                {error}
              </div>
            )}
            <AdminDetailPanel
              type="Department"
              mode={deptPanelMode === 'add' ? 'add' : deptPanelMode}
              form={deptForm}
              setForm={setDeptForm}
              submitting={submitting}
              onSubmit={(action) => {
                if (action === 'edit') setDeptPanelMode('edit')
                else if (action === 'delete') handleDeleteDepartment()
                else handleSaveDepartment()
              }}
              onDelete={() => handleDeleteDepartment()}
              onCancel={closeDeptPanel}
            />
          </div>
        </div>
      )}

      {panelMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto">
            {panelMode === 'add' && (
              <div className="mb-3 rounded-2xl bg-white p-4 shadow-md">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  User role
                </p>
                <div className="flex gap-2">
                  {['hod', 'faculty'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setAddRole(role)
                        setForm((f) => ({
                          ...f,
                          designation: role,
                        }))
                      }}
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize ${
                        addRole === role
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {role === 'hod' ? 'HOD' : 'Faculty'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                {error}
              </div>
            )}

            <AdminDetailPanel
              type={panelType}
              mode={panelMode}
              form={form}
              setForm={setForm}
              submitting={submitting}
              onSubmit={(action) => {
                if (action === 'edit') setPanelMode('edit')
                else if (action === 'delete') handleDeleteUser()
                else handleSaveUser()
              }}
              onDelete={() => handleDeleteUser()}
              onCancel={closePanel}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
