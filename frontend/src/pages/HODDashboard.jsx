import { useEffect, useState } from 'react'
import CourseTable from '../components/CourseTable'
import DashboardLayout from '../components/DashboardLayout'
import StatCard from '../components/StatCard'
import { dashboardAPI } from '../services/api'

export default function HODDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    dashboardAPI
      .hod()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard.'))
  }, [])

  const user = data?.user
  const deptName = data?.department || user?.department

  return (
    <DashboardLayout title="HOD Dashboard" subtitle="Department overview">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {!data?.department_connected && user && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          Your account is not linked to a department. Ask the admin to assign you a department
          from the HODs section.
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-800">{data?.message || 'Loading...'}</h2>
        {deptName && (
          <p className="mt-2 rounded-lg bg-navy/5 px-3 py-2 text-sm text-navy">
            Connected department: <strong>{deptName}</strong> — showing staff and courses
            registered under this department.
          </p>
        )}
        {user && (
          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p>
              <span className="font-medium text-slate-700">Email:</span> {user.email}
            </p>
            <p>
              <span className="font-medium text-slate-700">Department ID:</span>{' '}
              {user.department_id ?? 'Not set'}
            </p>
          </div>
        )}
      </div>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <StatCard label="Faculty Staff (same department)" value={data?.stats?.faculty_count ?? '—'} />
        <StatCard
          label="Courses (same department)"
          value={data?.stats?.courses_count ?? '—'}
          accent="bg-emerald-600"
        />
      </div>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Faculty Staff — {deptName || 'Your Department'}
        </h2>
        {!data?.staff?.length ? (
          <p className="text-sm text-slate-500">
            No faculty in this department yet. Admin must add faculty with department &quot;
            {deptName}&quot;.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.staff.map((member) => (
              <li
                key={member.id}
                className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <p className="font-medium text-slate-800">{member.full_name}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Courses — {deptName || 'Your Department'}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Courses added by admin for department &quot;{deptName}&quot;, with faculty staff from the
          same department.
        </p>
        <CourseTable courses={data?.courses} showStaff />
      </section>
    </DashboardLayout>
  )
}
