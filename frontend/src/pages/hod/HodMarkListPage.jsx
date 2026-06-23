import { useCallback, useEffect, useMemo, useState } from 'react'
import HodShell from '../../components/hod/HodShell'
import SelectField from '../../components/SelectField'
import { ExcelConsolidatedTable } from '../../components/faculty/ComponentAttainmentPanel'
import { useAuth } from '../../context/AuthContext'
import { hodAPI } from '../../services/api'
import { buildCourseReportFromMarksheets } from '../../utils/coPoAttainment'

const YEAR_ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

const emptyFilters = {
  batch: '',
  year: '',
  semester: '',
  class_number: '',
  assignment_id: '',
  component_id: '',
}

export default function HodMarkListPage() {
  const { user } = useAuth()
  const [options, setOptions] = useState(null)
  const [filters, setFilters] = useState(emptyFilters)
  const [result, setResult] = useState(null)
  const [attainmentPayload, setAttainmentPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const departmentName =
    options?.department_name ||
    user?.department_detail?.name ||
    user?.department ||
    'Your department'

  useEffect(() => {
    hodAPI
      .getMarkListFilters()
      .then((res) => setOptions(res.data))
      .catch(() => setError('Could not load filter options.'))
  }, [])

  const profilesForBatch = useMemo(() => {
    const profiles = options?.class_profiles || []
    if (!filters.batch) return profiles
    return profiles.filter((p) => (p.admission_year || '').trim() === filters.batch)
  }, [options, filters.batch])

  const availableYears = useMemo(() => {
    const fromProfiles = [...new Set(profilesForBatch.map((p) => p.year).filter(Boolean))]
    if (filters.batch && fromProfiles.length) {
      return fromProfiles.sort((a, b) => a - b)
    }
    return options?.years || []
  }, [options, filters.batch, profilesForBatch])

  const availableSemesters = useMemo(() => {
    const courses = options?.courses || []
    return [
      ...new Set(
        courses
          .filter((c) => {
            if (filters.year && String(c.year) !== filters.year) return false
            if (filters.class_number && String(c.class_number) !== filters.class_number) return false
            if (filters.batch && profilesForBatch.length) {
              return profilesForBatch.some(
                (p) =>
                  Number(p.year) === Number(c.year) &&
                  Number(p.class_number) === Number(c.class_number || 1),
              )
            }
            return true
          })
          .map((c) => c.semester)
          .filter(Boolean),
      ),
    ].sort((a, b) => a - b)
  }, [options, filters.year, filters.class_number, filters.batch, profilesForBatch])

  const availableClasses = useMemo(() => {
    if (filters.batch && profilesForBatch.length) {
      return [...new Set(profilesForBatch.map((p) => p.class_number).filter(Boolean))].sort(
        (a, b) => a - b,
      )
    }
    return options?.classes || []
  }, [options, filters.batch, profilesForBatch])

  const filteredCourses = useMemo(() => {
    const courses = options?.courses || []
    return courses.filter((c) => {
      if (filters.batch && profilesForBatch.length) {
        const matchesBatch = profilesForBatch.some(
          (p) =>
            Number(p.year) === Number(c.year) &&
            Number(p.class_number) === Number(c.class_number || 1),
        )
        if (!matchesBatch) return false
      }
      if (filters.year && String(c.year) !== filters.year) return false
      if (filters.semester && String(c.semester) !== filters.semester) return false
      if (filters.class_number && String(c.class_number) !== filters.class_number) return false
      return true
    })
  }, [options, filters.batch, filters.year, filters.semester, filters.class_number, profilesForBatch])

  const runSearch = useCallback(async (activeFilters) => {
    if (!activeFilters.batch) {
      setError('Select an admission batch to view students.')
      setSearched(false)
      setResult(null)
      setAttainmentPayload(null)
      return
    }

    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const params = { batch: activeFilters.batch }
      if (activeFilters.year) params.year = activeFilters.year
      if (activeFilters.semester) params.semester = activeFilters.semester
      if (activeFilters.class_number) params.class_number = activeFilters.class_number
      if (activeFilters.assignment_id) params.assignment_id = activeFilters.assignment_id
      if (activeFilters.component_id) params.component_id = activeFilters.component_id

      const res = await hodAPI.searchMarkList(params)
      setResult(res.data)

      const assignmentId =
        activeFilters.assignment_id ||
        res.data?.course?.assignment_id ||
        (res.data?.submitted_courses?.length === 1
          ? res.data.submitted_courses[0].assignment_id
          : null)
      if (assignmentId) {
        const att = await hodAPI.getCourseCoAttainment(assignmentId)
        setAttainmentPayload(att.data)
      } else {
        setAttainmentPayload(null)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed.')
      setResult(null)
      setAttainmentPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!filters.batch) return
    runSearch(filters)
  }, [filters, runSearch])

  const handleSearch = (e) => {
    e?.preventDefault()
    runSearch(filters)
  }

  const reset = () => {
    setFilters(emptyFilters)
    setResult(null)
    setAttainmentPayload(null)
    setSearched(false)
    setError('')
  }

  const students = result?.students || []
  const course = result?.course
  const submittedComponents = result?.components?.length ? result.components : []

  const componentFilterOptions =
    submittedComponents.length > 0 ? submittedComponents : options?.components || []

  const consolidatedReport = useMemo(() => {
    if (!attainmentPayload?.marksheets?.length) return null

    const opts = {
      rosterStudents: students,
      allowEmpty: true,
    }

    if (filters.component_id) {
      const match = componentFilterOptions.find((c) => c.component_id === filters.component_id)
      opts.componentId = filters.component_id
      opts.componentLabel = match?.component_label || ''
    } else if (submittedComponents.length) {
      opts.componentIds = submittedComponents.map((c) => ({
        id: c.component_id,
        label: c.component_label,
      }))
    }

    const bundle = buildCourseReportFromMarksheets(attainmentPayload.marksheets, 60, opts)
    return bundle?.report ?? null
  }, [
    attainmentPayload,
    students,
    filters.component_id,
    submittedComponents,
    componentFilterOptions,
  ])

  const showMarksheets = Boolean(consolidatedReport?.studentRows?.length)

  return (
    <HodShell title="Student Mark List" breadcrumbs={['Dashboard', 'Marks', 'Student Mark List']}>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-800">Filter Marks</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select batch to load {departmentName} students. Submitted components (CA1, CA2,
          Assignment, etc.) appear side by side with an Overall column — same layout as faculty
          submission.
        </p>
        <form onSubmit={handleSearch} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800">
              {departmentName}
            </div>
          </div>
          <SelectField
            label="Batch (Admission year)"
            id="ml_batch"
            value={filters.batch}
            required={false}
            placeholder="Select batch"
            onChange={(e) =>
              setFilters({
                ...emptyFilters,
                batch: e.target.value,
              })
            }
            options={(options?.batches || []).map((b) => ({ value: b, label: b }))}
          />
          <SelectField
            label="Year (optional)"
            id="ml_year"
            value={filters.year}
            required={false}
            placeholder="All years in batch"
            onChange={(e) =>
              setFilters({
                ...filters,
                year: e.target.value,
                semester: '',
                class_number: '',
                assignment_id: '',
              })
            }
            options={availableYears.map((y) => ({
              value: String(y),
              label: `${YEAR_ROMAN[y] || y} Year`,
            }))}
          />
          <SelectField
            label="Semester"
            id="ml_sem"
            value={filters.semester}
            required={false}
            placeholder="All semesters"
            onChange={(e) =>
              setFilters({ ...filters, semester: e.target.value, assignment_id: '' })
            }
            options={availableSemesters.map((s) => ({
              value: String(s),
              label: `${s}${s === 1 ? 'st' : s === 2 ? 'nd' : s === 3 ? 'rd' : 'th'} Semester`,
            }))}
          />
          <SelectField
            label="Class"
            id="ml_class"
            value={filters.class_number}
            required={false}
            placeholder="All classes"
            onChange={(e) =>
              setFilters({ ...filters, class_number: e.target.value, assignment_id: '' })
            }
            options={availableClasses.map((c) => ({
              value: String(c),
              label: `Class ${c}`,
            }))}
          />
          <SelectField
            label="Subject / Course"
            id="ml_course"
            value={filters.assignment_id}
            required={false}
            placeholder="Select course for mark sheet"
            onChange={(e) => setFilters({ ...filters, assignment_id: e.target.value })}
            options={filteredCourses.map((c) => ({
              value: String(c.assignment_id),
              label: `${c.course_code} — ${c.course_name}`,
            }))}
          />
          <SelectField
            label="Component"
            id="ml_component"
            value={filters.component_id}
            required={false}
            placeholder="All submitted components"
            onChange={(e) => setFilters({ ...filters, component_id: e.target.value })}
            options={componentFilterOptions.map((c) => ({
              value: c.component_id,
              label: c.component_label,
            }))}
          />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={loading || !filters.batch}
              className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-violet-200 px-5 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {searched && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-base font-semibold text-slate-800">Submitted Mark Sheets</h2>
            <p className="mt-1 text-sm text-slate-500">
              {departmentName}
              {result?.batch ? ` · Batch ${result.batch}` : ''}
            </p>
            {course && (
              <p className="mt-1 text-sm text-slate-500">
                {course.course_code} — {course.course_name} · {course.class_label} · Year{' '}
                {course.year} · Sem {course.semester}
                {course.faculty_name ? ` · ${course.faculty_name}` : ''}
              </p>
            )}
            {result?.submitted_courses?.length > 1 && !course && (
              <p className="mt-1 text-xs text-slate-500">
                Submitted courses:{' '}
                {result.submitted_courses
                  .map((c) => `${c.course_code} (Y${c.year} S${c.semester})`)
                  .join(', ')}
                {' — select a course above to view its mark sheet.'}
              </p>
            )}
            {result?.message && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {result.message}
              </p>
            )}
            {!showMarksheets && submittedComponents.length > 0 && !course?.assignment_id && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Select a subject/course to load the detailed mark sheet.
              </p>
            )}
          </div>

          {showMarksheets ? (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-semibold text-slate-800">
                  {consolidatedReport.componentMeta?.map((c) => c.label).join(' · ')}
                  {consolidatedReport.showOverall ? ' · Overall' : ''}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {consolidatedReport.studentsWithMarks} student(s) with marks · All submitted
                  components side by side with combined overall
                </p>
              </div>
              <div className="p-4">
                <ExcelConsolidatedTable report={consolidatedReport} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">S.No</th>
                      <th className="px-4 py-3">Reg No.</th>
                      <th className="px-4 py-3">Student Name</th>
                      {!filters.year && <th className="px-4 py-3">Year</th>}
                      {submittedComponents.map((c) => (
                        <th key={c.component_id} className="px-4 py-3 text-center">
                          {c.component_label}
                        </th>
                      ))}
                      {submittedComponents.length === 0 && (
                        <th className="px-4 py-3 text-center">Submitted marks</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.length === 0 ? (
                      <tr>
                        <td
                          colSpan={
                            3 + (filters.year ? 0 : 1) + Math.max(submittedComponents.length, 1)
                          }
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          {result?.message ||
                            'No students found for this batch. Add students under Year settings.'}
                        </td>
                      </tr>
                    ) : (
                      students.map((s) => (
                        <tr key={`${s.register_number}-${s.sno}`} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-slate-500">{s.sno}</td>
                          <td className="px-4 py-3 font-mono">{s.register_number}</td>
                          <td className="px-4 py-3 font-medium">{s.full_name}</td>
                          {!filters.year && (
                            <td className="px-4 py-3 text-slate-500">
                              {YEAR_ROMAN[s.year] || s.year || '—'}
                            </td>
                          )}
                          {submittedComponents.length > 0 ? (
                            submittedComponents.map((c) => (
                              <td
                                key={c.component_id}
                                className="px-4 py-3 text-center tabular-nums"
                              >
                                {s.component_marks?.[c.component_id]?.display ?? '—'}
                              </td>
                            ))
                          ) : (
                            <td className="px-4 py-3 text-center text-slate-400">—</td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
                Showing {students.length} student{students.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      )}
    </HodShell>
  )
}
