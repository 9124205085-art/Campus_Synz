import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminAPI } from '../../services/api'

const CONFIG = {
  hod: {
    title: 'HOD Details',
    subtitle: 'All heads of department',
    fetch: () => adminAPI.listHods().then((r) => r.data.hods || []),
  },
  faculty: {
    title: 'Faculty Details',
    subtitle: 'All teaching staff accounts',
    fetch: () => adminAPI.listFaculty().then((r) => r.data.faculty || []),
  },
  department: {
    title: 'Department Details',
    subtitle: 'All registered departments',
    fetch: () => adminAPI.listDepartments().then((r) => r.data.departments || []),
  },
  course: {
    title: 'Course Details',
    subtitle: 'All courses in the system',
    fetch: () => adminAPI.listCourses().then((r) => r.data.courses || []),
  },
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function DeptStatusBadge({ status }) {
  const active = status === 'active'
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        active ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {status || '—'}
    </span>
  )
}

function RowActions({ onView, onDelete, deleting, viewLabel = 'View' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {onView && (
        <button
          type="button"
          onClick={onView}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {viewLabel}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      )}
    </div>
  )
}

export default function AdminStatDetailsModal({
  type,
  onClose,
  onViewUser,
  onViewDepartment,
  onViewCourse,
  onAddDepartment,
  onAddCourse,
  onDelete,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const meta = CONFIG[type]

  const load = useCallback(async () => {
    if (!meta) return
    setLoading(true)
    setError('')
    try {
      const data = await meta.fetch()
      setItems(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load details.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [meta])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items

    return items.filter((item) => {
      if (type === 'department') {
        return [item.name, item.code, item.degree].some((v) =>
          String(v || '').toLowerCase().includes(q)
        )
      }
      if (type === 'course') {
        return [item.course_code, item.name, item.regulation, item.department].some((v) =>
          String(v || '').toLowerCase().includes(q)
        )
      }
      return [item.full_name, item.email, item.employee_id, item.department].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    })
  }, [items, search, type])

  const handleDeleteRow = async (item) => {
    if (!onDelete) return
    setDeletingId(item.id)
    setError('')
    try {
      await onDelete(type, item)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!meta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {type === 'department' && onAddDepartment && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onAddDepartment()
                }}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                + Add Department
              </button>
            )}
            {type === 'course' && onAddCourse && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onAddCourse()
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                + Add Course
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error && (
            <p className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {loading ? (
            <p className="px-6 py-12 text-center text-slate-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-slate-500">No records found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {type === 'department' && (
                  <tr>
                    <th className="px-6 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Degree</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">HODs</th>
                    <th className="px-4 py-3">Faculty</th>
                    <th className="px-4 py-3">Courses</th>
                    <th className="px-4 py-3">Status</th>
                    {(onViewDepartment || onDelete) && <th className="px-4 py-3">Actions</th>}
                  </tr>
                )}
                {type === 'course' && (
                  <tr>
                    <th className="px-6 py-3">ID</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Regulation</th>
                    <th className="px-4 py-3">Department</th>
                    {(onViewCourse || onDelete) && <th className="px-4 py-3">Actions</th>}
                  </tr>
                )}
                {(type === 'hod' || type === 'faculty') && (
                  <tr>
                    <th className="px-6 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Status</th>
                    {(onViewUser || onDelete) && <th className="px-4 py-3">Actions</th>}
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {type === 'department' &&
                  filtered.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-mono text-slate-500">{dept.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{dept.name}</td>
                      <td className="px-4 py-3 text-slate-600">{dept.code || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{dept.degree || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{dept.duration ?? '—'} yrs</td>
                      <td className="px-4 py-3 text-slate-600">{dept.hod_count ?? 0}</td>
                      <td className="px-4 py-3 text-slate-600">{dept.faculty_count ?? 0}</td>
                      <td className="px-4 py-3 text-slate-600">{dept.course_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <DeptStatusBadge status={dept.status} />
                      </td>
                      {(onViewDepartment || onDelete) && (
                        <td className="px-4 py-3">
                          <RowActions
                            onView={onViewDepartment ? () => onViewDepartment(dept) : undefined}
                            onDelete={onDelete ? () => handleDeleteRow(dept) : undefined}
                            deleting={deletingId === dept.id}
                          />
                        </td>
                      )}
                    </tr>
                  ))}

                {type === 'course' &&
                  filtered.map((course) => (
                    <tr key={course.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-mono text-slate-500">{course.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{course.course_code}</td>
                      <td className="px-4 py-3 text-slate-700">{course.name}</td>
                      <td className="px-4 py-3 text-slate-600">{course.regulation}</td>
                      <td className="px-4 py-3 text-slate-600">{course.department || '—'}</td>
                      {(onViewCourse || onDelete) && (
                        <td className="px-4 py-3">
                          <RowActions
                            onView={onViewCourse ? () => onViewCourse(course) : undefined}
                            onDelete={onDelete ? () => handleDeleteRow(course) : undefined}
                            deleting={deletingId === course.id}
                          />
                        </td>
                      )}
                    </tr>
                  ))}

                {(type === 'hod' || type === 'faculty') &&
                  filtered.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-mono text-slate-500">{user.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{user.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{user.email}</td>
                      <td className="px-4 py-3 text-slate-600">{user.employee_id || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{user.department || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge active={user.is_active} />
                      </td>
                      {(onViewUser || onDelete) && (
                        <td className="px-4 py-3">
                          <RowActions
                            onView={
                              onViewUser
                                ? () => onViewUser({ ...user, role: type })
                                : undefined
                            }
                            onDelete={onDelete ? () => handleDeleteRow(user) : undefined}
                            deleting={deletingId === user.id}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
          {loading ? '—' : `${filtered.length} of ${items.length} records`}
        </div>
      </div>
    </div>
  )
}
