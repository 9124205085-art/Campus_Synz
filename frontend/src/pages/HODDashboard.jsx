import { Fragment, useEffect, useState } from 'react'
import AssignmentTable from '../components/AssignmentTable'
import DashboardLayout from '../components/DashboardLayout'
import FacultyCourseTable from '../components/FacultyCourseTable'
import HodChecklistPanel from '../components/hod/HodChecklistPanel'
import HodStatDetailsModal from '../components/hod/HodStatDetailsModal'
import FormField from '../components/FormField'
import SelectField from '../components/SelectField'
import StatCard from '../components/StatCard'
import { dashboardAPI, hodAPI } from '../services/api'
import { semesterAfterYearChange, semesterOptionsForYear } from '../utils/academicTerms'

function classCountForYear(dashboardData, year) {
  const y = parseInt(year, 10)
  if (!y) return 1
  const fromStats = dashboardData?.stats?.[`classes_year_${y}`]
  if (fromStats != null) return Math.max(1, fromStats)
  const setting = (dashboardData?.year_settings || []).find((s) => s.year === y)
  return Math.max(1, setting?.class_count ?? 1)
}

function classOptionsForYear(dashboardData, year) {
  const count = classCountForYear(dashboardData, year)
  return Array.from({ length: count }, (_, i) => ({
    value: String(i + 1),
    label: `Class ${i + 1}`,
  }))
}

function CoSubmissionDetail({ submission }) {
  const data = submission.submission || {}
  const usedCOs = data.usedCOs || submission.used_cos || []
  const componentSummaries = data.studentSummaries || []
  const students = data.studentResults || []
  const numQ = data.numQuestions || 0
  const questionCos = data.questionCos || []
  const questionMaxMarks = data.questionMaxMarks || []

  if (componentSummaries.length > 0) {
    const compLabel = submission.component || 'Component'
    return (
      <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-600">
          {compLabel} — {componentSummaries.length} student(s)
        </p>
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1.5 text-left">Reg. No</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Name</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center">CO Overall %</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center">PO Overall %</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center">PO Level</th>
            </tr>
          </thead>
          <tbody>
            {componentSummaries.map((s, idx) => {
              const compId = submission.component_id
              const block =
                s.byComponent?.[compId] ||
                Object.values(s.byComponent || {}).find(
                  (b) => b?.label === submission.component,
                ) ||
                Object.values(s.byComponent || {})[0]
              return (
                <tr key={idx} className={idx % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                  <td className="border border-slate-200 px-2 py-1 font-mono">
                    {s.register_number || '—'}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 font-medium">
                    {s.student_name || '—'}
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    {block?.overallCoPct != null ? `${block.overallCoPct}%` : '—'}
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    {block?.overallPoPct != null ? `${block.overallPoPct}%` : '—'}
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    {block?.poLevel || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  if (students.length > 0) {
    return (
      <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-600">
          {submission.component || 'Component'} — {students.length} student(s)
        </p>
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1.5 text-left">Reg. No</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Name</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center">Overall %</th>
              <th className="border border-slate-300 px-2 py-1.5 text-center">COs Attained</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, idx) => (
              <tr key={idx} className={idx % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                <td className="border border-slate-200 px-2 py-1 font-mono">{s.register_number || '—'}</td>
                <td className="border border-slate-200 px-2 py-1 font-medium">{s.student_name || '—'}</td>
                <td className="border border-slate-200 px-1 py-1 text-center">
                  {s.overallPct != null ? `${s.overallPct}%` : '—'}
                </td>
                <td className="border border-slate-200 px-1 py-1 text-center">
                  {s.evaluatedCount > 0 ? `${s.attainedCount}/${s.evaluatedCount}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!students.length) {
    return <p className="p-4 text-sm text-slate-500">No student data in this submission.</p>
  }

  return (
    <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 p-4">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">Reg. No</th>
            <th className="border border-slate-300 px-2 py-1.5 text-left">Name</th>
            {Array.from({ length: numQ }, (_, i) => (
              <th key={i} className="border border-slate-300 px-1 py-1.5 text-center text-navy">
                Q{i + 1}
                <span className="block text-[10px] font-normal text-slate-500">
                  {questionCos[i]} · {questionMaxMarks[i]}m
                </span>
              </th>
            ))}
            {usedCOs.map((co) => (
              <th key={co} colSpan={3} className="border border-slate-300 px-1 py-1.5 text-center">
                {co}
              </th>
            ))}
            <th colSpan={3} className="border border-slate-300 bg-navy/10 px-1 py-1.5 text-center text-navy">
              Overall
            </th>
          </tr>
          <tr className="bg-slate-50 text-[10px] text-slate-500">
            <th colSpan={2 + numQ} className="border border-slate-200" />
            {usedCOs.map((co) => (
              <Fragment key={co}>
                <th className="border border-slate-300 px-1 py-1">Marks</th>
                <th className="border border-slate-300 px-1 py-1">%</th>
                <th className="border border-slate-300 px-1 py-1">Status</th>
              </Fragment>
            ))}
            <th className="border border-slate-300 px-1 py-1">Avg</th>
            <th className="border border-slate-300 px-1 py-1">COs</th>
            <th className="border border-slate-300 px-1 py-1">Att%</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => (
            <tr key={idx} className={idx % 2 ? 'bg-slate-50/80' : 'bg-white'}>
              <td className="border border-slate-200 px-2 py-1 font-mono">{s.register_number || '—'}</td>
              <td className="border border-slate-200 px-2 py-1 font-medium">{s.student_name || '—'}</td>
              {Array.from({ length: numQ }, (_, qi) => (
                <td key={qi} className="border border-slate-200 px-1 py-1 text-center tabular-nums">
                  {s.questionMarks?.[qi] ?? '—'}
                </td>
              ))}
              {usedCOs.map((co) => {
                const d = s.cos?.[co]
                if (!d?.marksObtained && d?.marksObtained !== 0) {
                  return (
                    <Fragment key={co}>
                      <td className="border border-slate-200 px-1 py-1 text-center">—</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">—</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">—</td>
                    </Fragment>
                  )
                }
                return (
                  <Fragment key={co}>
                    <td className="border border-slate-200 px-1 py-1 text-center tabular-nums">
                      {d.marksObtained}/{d.maxMark}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">{d.pct}%</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <span className={`rounded px-1 py-0.5 font-semibold ${
                        d.attained ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {d.attained ? 'Attained' : 'Not Attained'}
                      </span>
                    </td>
                  </Fragment>
                )
              })}
              <td className="border border-slate-200 px-1 py-1 text-center font-semibold text-navy">
                {s.overallPct != null ? `${s.overallPct}%` : '—'}
              </td>
              <td className="border border-slate-200 px-1 py-1 text-center">
                {s.evaluatedCount > 0 ? `${s.attainedCount}/${s.evaluatedCount}` : '—'}
              </td>
              <td className="border border-slate-200 px-1 py-1 text-center">
                {s.overallAttainmentPct != null ? `${s.overallAttainmentPct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HODDashboard() {
  const [data, setData] = useState(null)
  const [facultyList, setFacultyList] = useState([])
  const [coSubmissions, setCoSubmissions] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [showAddFaculty, setShowAddFaculty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addingFaculty, setAddingFaculty] = useState(false)
  const [togglingId, setTogglingId] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0)
  const [statDetailType, setStatDetailType] = useState(null)
  const [courseForm, setCourseForm] = useState({
    course_code: '',
    name: '',
    regulation: '',
    year: '',
    class_number: '1',
    faculty_id: '',
    semester: '',
  })
  const [facultyForm, setFacultyForm] = useState({
    employee_id: '',
    name: '',
    email: '',
    mobile: '',
    password: '',
  })

  const loadCoSubmissions = () => {
    hodAPI
      .listCoSubmissions()
      .then((res) => setCoSubmissions(res.data.submissions || []))
      .catch(() => setCoSubmissions([]))
  }

  const load = () => {
    dashboardAPI
      .hod()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard.'))

    hodAPI
      .listFaculty()
      .then((res) => setFacultyList(res.data.faculty || []))
      .catch(() => setFacultyList([]))

    loadCoSubmissions()
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (checklistRefreshKey > 0) {
      loadCoSubmissions()
    }
  }, [checklistRefreshKey])

  const handleToggleAccess = async (member) => {
    const nextActive = member.is_active === false
    const action = nextActive ? 'enable' : 'disable'
    if (!window.confirm(`${action === 'enable' ? 'Enable' : 'Disable'} access for ${member.full_name}?`)) {
      return
    }
    setTogglingId(member.id)
    setError('')
    setMessage('')
    try {
      await hodAPI.updateFacultyAccess(member.id, nextActive)
      setMessage(`Access ${nextActive ? 'enabled' : 'disabled'} for ${member.full_name}.`)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update faculty access.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleRemoveAssignment = async (assignment) => {
    if (
      !window.confirm(
        `Remove ${assignment.faculty_name} from ${assignment.course_code} (Year ${assignment.year})?`,
      )
    ) {
      return
    }
    setRemovingId(assignment.id)
    setError('')
    setMessage('')
    try {
      await hodAPI.deleteAssignment(assignment.id)
      setMessage('Course assignment removed.')
      load()
      setChecklistRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove assignment.')
    } finally {
      setRemovingId(null)
    }
  }

  const activeFaculty = facultyList.filter((f) => f.is_active !== false)
  const facultyWithCourses = data?.faculty_with_courses?.length
    ? data.faculty_with_courses
    : facultyList

  const user = data?.user
  const dept = data?.department_detail

  const handleAddFaculty = async (e) => {
    e.preventDefault()
    setAddingFaculty(true)
    setError('')
    setMessage('')
    try {
      const res = await hodAPI.addFaculty({
        employee_id: facultyForm.employee_id,
        name: facultyForm.name,
        email: facultyForm.email,
        mobile: facultyForm.mobile,
        password: facultyForm.password,
        designation: 'faculty',
        is_active: true,
      })
      setMessage(res.data?.message || 'Faculty added successfully.')
      setShowAddFaculty(false)
      setFacultyForm({ employee_id: '', name: '', email: '', mobile: '', password: '' })
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add faculty.')
    } finally {
      setAddingFaculty(false)
    }
  }

  const handleNavigateSection = (sectionId) => {
    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleAddCourse = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      await hodAPI.addCourse({
        course_code: courseForm.course_code,
        name: courseForm.name,
        regulation: courseForm.regulation,
        year: parseInt(courseForm.year, 10),
        class_number: parseInt(courseForm.class_number, 10),
        faculty_id: parseInt(courseForm.faculty_id, 10),
        semester: courseForm.semester ? parseInt(courseForm.semester, 10) : undefined,
      })
      setMessage('Course added and faculty assigned.')
      setShowAddCourse(false)
      setChecklistRefreshKey((k) => k + 1)
      loadCoSubmissions()
      setCourseForm({
        course_code: '',
        name: '',
        regulation: '',
        year: '',
        class_number: '1',
        faculty_id: '',
        semester: '',
      })
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add course.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout title="HOD Dashboard" subtitle="Department management">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          {message}
        </div>
      )}

      {!data?.department_connected && user && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your account is not linked to a department. Ask the admin to assign you under HODs.
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-lg font-semibold text-slate-800">
          {user?.full_name || 'HOD'} — Head of Department
        </h2>
        {dept && (
          <div className="mt-4 grid gap-3 rounded-xl bg-navy/5 p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium text-slate-700">Department:</span> {dept.name}
            </p>
            <p>
              <span className="font-medium text-slate-700">Code:</span> {dept.code || '—'}
            </p>
            <p>
              <span className="font-medium text-slate-700">Degree:</span> {dept.degree}
            </p>
            <p>
              <span className="font-medium text-slate-700">Duration:</span> {dept.duration} years
            </p>
            <p>
              <span className="font-medium text-slate-700">Status:</span>{' '}
              <span
                className={
                  dept.status === 'active' ? 'font-semibold text-emerald-700' : 'text-red-600'
                }
              >
                {dept.status}
              </span>
            </p>
            <p>
              <span className="font-medium text-slate-700">Email:</span> {user?.email}
            </p>
          </div>
        )}
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Faculty"
          value={data?.stats?.faculty_count ?? '—'}
          onClick={() => setStatDetailType('faculty')}
        />
        <StatCard
          label="Courses"
          value={data?.stats?.courses_count ?? '—'}
          accent="bg-emerald-600"
          onClick={() => setStatDetailType('courses')}
        />
        <StatCard
          label="Assignments"
          value={data?.stats?.assignments_count ?? '—'}
          accent="bg-blue-600"
          onClick={() => setStatDetailType('assignments')}
        />
        <StatCard
          label="Classes"
          value={data?.stats?.class_count ?? '—'}
          accent="bg-violet-600"
          onClick={() => setStatDetailType('classes')}
        />
        <StatCard
          label="Year 1 Students"
          value={data?.stats?.students_year_1 ?? '—'}
          sub={`${data?.stats?.classes_year_1 ?? 1} class${(data?.stats?.classes_year_1 ?? 1) === 1 ? '' : 'es'}`}
          accent="bg-amber-500"
          onClick={() => setStatDetailType('students_year_1')}
        />
        <StatCard
          label="Year 2 Students"
          value={data?.stats?.students_year_2 ?? '—'}
          sub={`${data?.stats?.classes_year_2 ?? 1} class${(data?.stats?.classes_year_2 ?? 1) === 1 ? '' : 'es'}`}
          accent="bg-orange-500"
          onClick={() => setStatDetailType('students_year_2')}
        />
        <StatCard
          label="Year 3 Students"
          value={data?.stats?.students_year_3 ?? '—'}
          sub={`${data?.stats?.classes_year_3 ?? 1} class${(data?.stats?.classes_year_3 ?? 1) === 1 ? '' : 'es'}`}
          accent="bg-teal-600"
          onClick={() => setStatDetailType('students_year_3')}
        />
        <StatCard
          label="Year 4 Students"
          value={data?.stats?.students_year_4 ?? '—'}
          sub={`${data?.stats?.classes_year_4 ?? 1} class${(data?.stats?.classes_year_4 ?? 1) === 1 ? '' : 'es'}`}
          accent="bg-indigo-600"
          onClick={() => setStatDetailType('students_year_4')}
        />
      </div>

      {statDetailType && (
        <HodStatDetailsModal
          type={statDetailType}
          dashboardData={data}
          onClose={() => setStatDetailType(null)}
          onNavigateSection={handleNavigateSection}
          onRefresh={load}
        />
      )}

      <section id="hod-faculty-section" className="mb-8 rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-800">Faculty & Course Overview</h2>
          <button
            type="button"
            onClick={() => setShowAddFaculty(true)}
            className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white"
          >
            + Add Faculty
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Add faculty to your department, view their assigned courses and course count. Toggle access to
          enable or disable faculty login.
        </p>
        <FacultyCourseTable
          facultyList={facultyWithCourses}
          onToggleAccess={handleToggleAccess}
          togglingId={togglingId}
        />
      </section>

      <section id="hod-assignments-section" className="mb-8 rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-800">Course Assignments</h2>
          <button
            type="button"
            onClick={() => setShowAddCourse(true)}
            className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white"
          >
            + Assign Course
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Add a course for your department and assign a faculty member for a specific year.
        </p>
        <AssignmentTable
          assignments={data?.assignments}
          onRemove={handleRemoveAssignment}
          removingId={removingId}
        />
      </section>

      <HodChecklistPanel
        onMessage={setMessage}
        onError={setError}
        refreshKey={checklistRefreshKey}
      />

      <section className="mb-8 rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Faculty CO Attainment Submissions</h2>
          <button
            type="button"
            onClick={loadCoSubmissions}
            className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          One row per mark sheet component (e.g. Continuous Assessment 1, Continuous Assessment 2)
          submitted by faculty.
        </p>
        {coSubmissions.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No submissions yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Course Code</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Faculty</th>
                  <th className="pb-2 pr-4">Year / Sem</th>
                  <th className="pb-2 pr-4">Component</th>
                  <th className="pb-2 pr-4">Submitted</th>
                  <th className="pb-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {coSubmissions.map((sub) => (
                  <Fragment key={sub.row_id || sub.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="py-3 pr-4 font-medium text-navy">{sub.course_code || '—'}</td>
                      <td className="py-3 pr-4">{sub.course_name || '—'}</td>
                      <td className="py-3 pr-4">{sub.faculty_name || '—'}</td>
                      <td className="py-3 pr-4">
                        Year {sub.year ?? '—'} · Sem {sub.semester ?? '—'}
                      </td>
                      <td className="py-3 pr-4">{sub.component || '—'}</td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {sub.submitted_at
                          ? new Date(sub.submitted_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === (sub.row_id || sub.id) ? null : sub.row_id || sub.id)
                          }
                          className="text-sm font-medium text-navy hover:underline"
                        >
                          {expandedId === (sub.row_id || sub.id) ? 'Hide' : 'View students'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === (sub.row_id || sub.id) && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <CoSubmissionDetail submission={sub} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-800">Add Faculty</h3>
            {dept && (
              <p className="mt-1 text-sm text-slate-500">
                Department: <span className="font-medium text-slate-700">{dept.name}</span>
              </p>
            )}
            <form onSubmit={handleAddFaculty} className="mt-4 space-y-4">
              <FormField
                label="Employee ID"
                id="hod_faculty_employee_id"
                value={facultyForm.employee_id}
                onChange={(e) =>
                  setFacultyForm({ ...facultyForm, employee_id: e.target.value.toUpperCase() })
                }
                placeholder="e.g. EMP001"
              />
              <FormField
                label="Name"
                id="hod_faculty_name"
                value={facultyForm.name}
                onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
              />
              <FormField
                label="Email"
                id="hod_faculty_email"
                type="email"
                value={facultyForm.email}
                onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value })}
              />
              <FormField
                label="Mobile"
                id="hod_faculty_mobile"
                value={facultyForm.mobile}
                onChange={(e) => setFacultyForm({ ...facultyForm, mobile: e.target.value })}
                placeholder="10-digit mobile number"
              />
              <FormField
                label="Password"
                id="hod_faculty_password"
                type="password"
                value={facultyForm.password}
                onChange={(e) => setFacultyForm({ ...facultyForm, password: e.target.value })}
                placeholder="Min. 6 characters"
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddFaculty(false)}
                  className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingFaculty}
                  className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {addingFaculty ? 'Adding...' : 'Add Faculty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-800">Assign Course to Faculty</h3>
            <form onSubmit={handleAddCourse} className="mt-4 space-y-4">
              <FormField
                label="Course Code"
                id="hod_course_code"
                value={courseForm.course_code}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, course_code: e.target.value.toUpperCase() })
                }
              />
              <FormField
                label="Course Name"
                id="hod_course_name"
                value={courseForm.name}
                onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
              />
              <FormField
                label="Regulation"
                id="hod_regulation"
                value={courseForm.regulation}
                onChange={(e) => setCourseForm({ ...courseForm, regulation: e.target.value })}
              />
              <SelectField
                label="Year"
                id="hod_year"
                value={courseForm.year}
                onChange={(e) => {
                  const year = e.target.value
                  setCourseForm((f) => ({
                    ...f,
                    year,
                    class_number: '1',
                    semester: semesterAfterYearChange(year, f.semester),
                  }))
                }}
                options={[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${y}` }))}
              />
              <SelectField
                label="Class"
                id="hod_class"
                value={courseForm.class_number}
                onChange={(e) => setCourseForm({ ...courseForm, class_number: e.target.value })}
                disabled={!courseForm.year}
                options={
                  courseForm.year
                    ? classOptionsForYear(data, courseForm.year)
                    : [{ value: '', label: 'Select year first' }]
                }
              />
              <SelectField
                label="Faculty"
                id="hod_faculty"
                value={courseForm.faculty_id}
                onChange={(e) => setCourseForm({ ...courseForm, faculty_id: e.target.value })}
                options={activeFaculty.map((f) => ({
                  value: String(f.id),
                  label: `${f.full_name} (${f.employee_id || f.email})`,
                }))}
              />
              <SelectField
                label="Semester"
                id="hod_semester"
                value={courseForm.semester}
                onChange={(e) => setCourseForm({ ...courseForm, semester: e.target.value })}
                disabled={!courseForm.year}
                options={
                  semesterOptionsForYear(courseForm.year).length
                    ? semesterOptionsForYear(courseForm.year)
                    : [{ value: '', label: 'Select year first' }]
                }
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCourse(false)}
                  className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Assign Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
