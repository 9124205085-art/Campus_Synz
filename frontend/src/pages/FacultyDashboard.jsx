import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ComponentAttainmentPanel from '../components/faculty/ComponentAttainmentPanel'
import FacultyShell from '../components/faculty/FacultyShell'
import MarkSheetSetupModal from '../components/MarkSheetSetupModal'
import StudentRosterModal, { branchFromDegree } from '../components/StudentRosterModal'
import { dashboardAPI, facultyAPI } from '../services/api'
import { formatSheetComponentsDisplay } from '../utils/coPoAttainment'

function StatCard({ icon, label, value, sub, onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-2xl bg-white p-5 shadow-md text-left w-full ${
        onClick ? 'cursor-pointer transition hover:shadow-lg hover:ring-2 hover:ring-navy/20' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className="rounded-xl bg-navy/5 p-3 text-navy">{icon}</div>
      </div>
    </Wrapper>
  )
}

function StatusBadge({ status }) {
  const styles = {
    met: 'bg-emerald-100 text-emerald-800',
    moderate: 'bg-amber-100 text-amber-800',
    low: 'bg-red-100 text-red-800',
    pending: 'bg-slate-100 text-slate-600',
  }
  const labels = {
    met: 'Met Target',
    moderate: 'Moderate',
    low: 'Low',
    pending: 'Pending',
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] || styles.pending}`}
    >
      {labels[status] || status}
    </span>
  )
}


export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [deptData, setDeptData] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [semester, setSemester] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [prefillCourse, setPrefillCourse] = useState(null)
  const [showRoster, setShowRoster] = useState(false)
  const [marksheetConfig, setMarksheetConfig] = useState(null)
  const [panelRefresh, setPanelRefresh] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    const params = semester !== 'all' ? { semester } : {}

    Promise.all([
      dashboardAPI.faculty(),
      facultyAPI.dashboardStats(params),
    ])
      .then(([deptRes, statsRes]) => {
        setDeptData(deptRes.data)
        setAnalytics(statsRes.data.analytics)
        setError('')
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load dashboard.')
      })
      .finally(() => {
        setLoading(false)
        setPanelRefresh((n) => n + 1)
      })
  }, [semester])

  useEffect(() => {
    facultyAPI.marksheetConfig().then((res) => setMarksheetConfig(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const user = deptData?.user
  const deptDetail = deptData?.department_detail || user?.department_detail
  const departmentName = deptDetail?.name || user?.department || ''
  const assignedCourses = deptData?.assigned_courses || deptData?.courses || []
  const stats = analytics?.stats || {}
  const recent = analytics?.recent_courses || []

  const semesterOptions = useMemo(() => {
    const fromSheets = (analytics?.recent_courses || [])
      .filter((c) => c.year && c.semester)
      .map((c) => ({
        key: `${c.year}-${c.semester}`,
        label: `Year ${c.year} · Semester ${c.semester}`,
      }))
    const seen = new Set()
    return fromSheets.filter((s) => {
      if (seen.has(s.key)) return false
      seen.add(s.key)
      return true
    })
  }, [analytics])

  const handleCreateSheet = async (formData) => {
    const res = await facultyAPI.createMarksheet(formData)
    setShowSetup(false)
    setPrefillCourse(null)
    navigate(`/faculty/marksheet/${res.data.marksheet.id}`)
  }

  const avgDisplay =
    stats.avg_co_attainment != null ? `${stats.avg_co_attainment}%` : '—'
  const metDisplay =
    stats.courses_total_with_data > 0
      ? `${stats.courses_met_target}/${stats.courses_total_with_data}`
      : '0/0'

  const defaultRosterBranch = branchFromDegree(
    deptDetail?.degree,
    marksheetConfig?.branches || [],
  )
  const defaultRosterCourse = assignedCourses[0]
  const defaultRosterYear = defaultRosterCourse?.year
  const defaultRosterSemester = defaultRosterCourse?.semester ?? undefined

  return (
    <FacultyShell
      semester={semester}
      onSemesterChange={setSemester}
      semesters={semesterOptions}
    >
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-slate-600">
            Welcome back, {user?.full_name || 'Faculty'}! 👋
          </p>
          {departmentName && (
            <p className="mt-1 text-sm font-medium text-navy">{departmentName}</p>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 sm:hidden">
            Semester
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              {semesterOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setPrefillCourse(null)
            setShowSetup(true)
          }}
          className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-navy-dark"
        >
          + New Mark Sheet
        </button>
      </div>

      {(deptDetail || departmentName) && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-base font-semibold text-slate-800">My Department</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <span className="text-slate-500">Department:</span>{' '}
              <strong>{deptDetail?.name || departmentName}</strong>
            </p>
            <p>
              <span className="text-slate-500">Code:</span> {deptDetail?.code || '—'}
            </p>
            <p>
              <span className="text-slate-500">Degree:</span> {deptDetail?.degree || '—'}
            </p>
            <p>
              <span className="text-slate-500">Duration:</span>{' '}
              {deptDetail?.duration ? `${deptDetail.duration} years` : '—'}
            </p>
          </div>
        </div>
      )}

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-md">
        <h2 className="mb-3 text-base font-semibold text-slate-800">My Assigned Courses</h2>
        {assignedCourses.length === 0 ? (
          <p className="text-sm text-slate-500">
            No courses assigned yet. Your HOD will assign courses for your department and year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Course</th>
                  <th className="pb-2 pr-4">Year</th>
                  <th className="pb-2 pr-4">Regulation</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignedCourses.map((c) => (
                  <tr key={c.assignment_id || c.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-navy">{c.course_code}</td>
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4">Year {c.year || '—'}</td>
                    <td className="py-2 pr-4">{c.regulation}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPrefillCourse(c)
                          setShowSetup(true)
                        }}
                        className="text-xs font-medium text-navy hover:underline"
                      >
                        Create Mark Sheet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loading ? (
        <p className="text-center text-slate-500">Loading dashboard…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Courses"
              value={stats.courses_count ?? 0}
              sub="Saved mark sheets"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              }
            />
            <StatCard
              label="Students"
              value={stats.roster_students_count ?? stats.students_count ?? 0}
              sub="Saved class list — click to manage"
              onClick={() => setShowRoster(true)}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
            <StatCard
              label="Avg CO Attainment"
              value={avgDisplay}
              sub="All courses (saved)"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="Attainment ≥ 70%"
              value={metDisplay}
              sub="Courses met target"
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
          </div>

          <ComponentAttainmentPanel refreshKey={panelRefresh} assignedCourses={assignedCourses} />

          <section id="recent-results" className="mb-6 rounded-2xl bg-white p-5 shadow-md sm:p-6">
              <h3 className="mb-4 text-base font-semibold text-slate-800">
                Recent CO Attainment Results
              </h3>
              {recent.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No saved mark sheets yet. Create a sheet, enter marks, save, then results appear
                  here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                        <th className="pb-3 pr-4">Course Code</th>
                        <th className="pb-3 pr-4">Course Name</th>
                        <th className="pb-3 pr-4">Component</th>
                        <th className="pb-3 pr-4">COs</th>
                        <th className="pb-3 pr-4">Avg Attainment</th>
                        <th className="pb-3 pr-4">Status</th>
                        <th className="pb-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.slice(0, 8).map((row) => (
                        <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="py-3 pr-4 font-medium text-navy">{row.course_code}</td>
                          <td className="py-3 pr-4 text-slate-700">{row.course_name}</td>
                          <td className="py-3 pr-4 text-slate-600">
                            {row.components_display ||
                              formatSheetComponentsDisplay(row)}
                          </td>
                          <td className="py-3 pr-4">{row.co_count}</td>
                          <td className="py-3 pr-4 font-medium">
                            {row.avg_attainment != null ? `${row.avg_attainment}%` : '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => navigate(`/faculty/marksheet/${row.id}`)}
                                className="text-sm font-medium text-navy hover:underline"
                              >
                                Open Sheet
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/faculty/marksheet/${row.id}/co-attainment`)
                                }
                                className="text-sm font-medium text-slate-600 hover:underline"
                              >
                                CO Report
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </>
      )}

      <StudentRosterModal
        open={showRoster}
        onClose={() => setShowRoster(false)}
        onSaved={load}
        defaultDepartment={deptDetail?.name || user?.department}
        defaultBranch={defaultRosterBranch}
        defaultYear={defaultRosterYear}
        defaultSemester={defaultRosterSemester}
        config={marksheetConfig}
      />

      <MarkSheetSetupModal
        open={showSetup}
        onClose={() => {
          setShowSetup(false)
          setPrefillCourse(null)
        }}
        onSubmit={handleCreateSheet}
        defaultDepartment={deptDetail?.name || user?.department}
        facultyUser={user}
        departmentDetail={deptDetail}
        courses={assignedCourses.length ? assignedCourses : deptData?.courses || []}
        prefillCourse={prefillCourse}
      />
    </FacultyShell>
  )
}
