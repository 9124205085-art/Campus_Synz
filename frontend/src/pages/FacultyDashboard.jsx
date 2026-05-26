import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CourseTable from '../components/CourseTable'
import DashboardLayout from '../components/DashboardLayout'
import MarkSheetSetupModal from '../components/MarkSheetSetupModal'
import StatCard from '../components/StatCard'
import { dashboardAPI, facultyAPI } from '../services/api'

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [marksheets, setMarksheets] = useState([])
  const [error, setError] = useState('')
  const [showSetup, setShowSetup] = useState(false)

  const load = () => {
    dashboardAPI
      .faculty()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard.'))

    facultyAPI
      .listMarksheets()
      .then((res) => setMarksheets(res.data.marksheets || []))
      .catch(() => setMarksheets([]))
  }

  useEffect(() => {
    load()
  }, [])

  const user = data?.user

  const handleCreateSheet = async (formData) => {
    try {
      const res = await facultyAPI.createMarksheet(formData)
      setShowSetup(false)
      navigate(`/faculty/marksheet/${res.data.marksheet.id}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create mark sheet.')
      throw err
    }
  }

  return (
    <DashboardLayout title="Faculty Dashboard" subtitle="Teaching & mark entry">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-800">{data?.message || 'Loading...'}</h2>
        {user && (
          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p>
              <span className="font-medium text-slate-700">Email:</span> {user.email}
            </p>
            <p>
              <span className="font-medium text-slate-700">Department:</span> {user.department}
            </p>
          </div>
        )}
      </div>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Student Mark Entry</h2>
            <p className="text-sm text-slate-500">
              Open an Excel-style sheet to enter student names, marks (Q1, Q2…), and CO per
              question.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy-dark"
          >
            + New Mark Sheet
          </button>
        </div>

        {marksheets.length === 0 ? (
          <p className="text-sm text-slate-500">No mark sheets yet. Click &quot;New Mark Sheet&quot; to start.</p>
        ) : (
          <ul className="space-y-2">
            {marksheets.map((sheet) => (
              <li key={sheet.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/faculty/marksheet/${sheet.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-4 py-3 text-left hover:border-navy/30 hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-navy">{sheet.course_code}</span>
                    <span className="text-slate-700"> — {sheet.course_name}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {sheet.regulation} · {sheet.department} · {sheet.num_students} students ·{' '}
                      {sheet.num_questions} questions
                    </span>
                  </span>
                  <span className="text-sm text-navy">Open →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Department Courses" value={data?.stats?.courses_count ?? '—'} />
        <StatCard label="Mark Sheets" value={marksheets.length} accent="bg-emerald-600" />
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Courses in Your Department</h2>
        <CourseTable courses={data?.courses} showStaff={false} />
      </section>

      <MarkSheetSetupModal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        onSubmit={handleCreateSheet}
        defaultDepartment={user?.department}
        courses={data?.courses || []}
      />
    </DashboardLayout>
  )
}
