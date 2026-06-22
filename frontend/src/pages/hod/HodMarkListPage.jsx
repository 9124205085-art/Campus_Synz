import { useEffect, useMemo, useState } from 'react'
import HodShell from '../../components/hod/HodShell'
import SelectField from '../../components/SelectField'
import { ExcelConsolidatedTable } from '../../components/faculty/ComponentAttainmentPanel'
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
  const [options, setOptions] = useState(null)
  const [filters, setFilters] = useState(emptyFilters)
  const [result, setResult] = useState(null)
  const [attainmentPayload, setAttainmentPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    hodAPI
      .getMarkListFilters()
      .then((res) => setOptions(res.data))
      .catch(() => setError('Could not load filter options.'))
  }, [])

  const filteredCourses = useMemo(() => {
    const courses = options?.courses || []
    return courses.filter((c) => {
      if (filters.year && String(c.year) !== filters.year) return false
      if (filters.semester && String(c.semester) !== filters.semester) return false
      if (filters.class_number && String(c.class_number) !== filters.class_number) return false
      return true
    })
  }, [options, filters.year, filters.semester, filters.class_number])

  const handleSearch = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const params = {}
      if (filters.batch) params.batch = filters.batch
      if (filters.year) params.year = filters.year
      if (filters.semester) params.semester = filters.semester
      if (filters.class_number) params.class_number = filters.class_number
      if (filters.assignment_id) params.assignment_id = filters.assignment_id
      if (filters.component_id) params.component_id = filters.component_id
      const res = await hodAPI.searchMarkList(params)
      setResult(res.data)

      const assignmentId =
        filters.assignment_id || res.data?.course?.assignment_id
      if (filters.component_id && assignmentId) {
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
  }

  const reset = () => {
    setFilters(emptyFilters)
    setResult(null)
    setAttainmentPayload(null)
    setSearched(false)
    setError('')
  }

  const components = result?.components || []
  const students = result?.students || []
  const course = result?.course
  const selectedComponentId = filters.component_id

  const selectedComponentLabel = useMemo(() => {
    if (!selectedComponentId) return ''
    const fromResult = components.find((c) => c.component_id === selectedComponentId)
    if (fromResult) return fromResult.component_label
    const fromOptions = (options?.components || []).find(
      (c) => c.component_id === selectedComponentId,
    )
    return fromOptions?.component_label || selectedComponentId
  }, [selectedComponentId, components, options])

  const detailedReportBundle = useMemo(() => {
    if (!selectedComponentId || !attainmentPayload?.marksheets?.length) return null
    return buildCourseReportFromMarksheets(attainmentPayload.marksheets, 60, {
      componentId: selectedComponentId,
      componentLabel: selectedComponentLabel,
      rosterStudents: students,
    })
  }, [selectedComponentId, attainmentPayload, students])

  const showDetailedView = Boolean(selectedComponentId && detailedReportBundle?.report)

  return (
    <HodShell title="Student Mark List" breadcrumbs={['Dashboard', 'Marks', 'Student Mark List']}>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-800">Filter Marks</h2>
        <form onSubmit={handleSearch} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Batch (Admission year)"
            id="ml_batch"
            value={filters.batch}
            onChange={(e) => setFilters({ ...filters, batch: e.target.value })}
            options={[
              { value: '', label: 'All batches' },
              ...(options?.batches || []).map((b) => ({ value: b, label: b })),
            ]}
          />
          <SelectField
            label="Year"
            id="ml_year"
            value={filters.year}
            onChange={(e) =>
              setFilters({ ...filters, year: e.target.value, assignment_id: '' })
            }
            options={[
              { value: '', label: 'Select year' },
              ...(options?.years || []).map((y) => ({
                value: String(y),
                label: `${YEAR_ROMAN[y] || y} Year`,
              })),
            ]}
          />
          <SelectField
            label="Semester"
            id="ml_sem"
            value={filters.semester}
            onChange={(e) =>
              setFilters({ ...filters, semester: e.target.value, assignment_id: '' })
            }
            options={[
              { value: '', label: 'Select semester' },
              ...(options?.semesters || []).map((s) => ({
                value: String(s),
                label: `${s}${s === 1 ? 'st' : s === 2 ? 'nd' : s === 3 ? 'rd' : 'th'} Semester`,
              })),
            ]}
          />
          <SelectField
            label="Class"
            id="ml_class"
            value={filters.class_number}
            onChange={(e) =>
              setFilters({ ...filters, class_number: e.target.value, assignment_id: '' })
            }
            options={[
              { value: '', label: 'Select class' },
              ...(options?.classes || []).map((c) => ({
                value: String(c),
                label: `Class ${c}`,
              })),
            ]}
          />
          <SelectField
            label="Subject / Course"
            id="ml_course"
            value={filters.assignment_id}
            onChange={(e) => setFilters({ ...filters, assignment_id: e.target.value })}
            options={[
              { value: '', label: 'Select course (optional)' },
              ...filteredCourses.map((c) => ({
                value: String(c.assignment_id),
                label: `${c.course_code} — ${c.course_name}`,
              })),
            ]}
          />
          <SelectField
            label="Component"
            id="ml_component"
            value={filters.component_id}
            onChange={(e) => setFilters({ ...filters, component_id: e.target.value })}
            options={[
              { value: '', label: 'All components' },
              ...(options?.components || []).map((c) => ({
                value: c.component_id,
                label: c.component_label,
              })),
            ]}
          />
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {loading ? 'Searching…' : '🔍 Search Marks'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-violet-200 px-5 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
            >
              ↺ Reset
            </button>
          </div>
        </form>
      </div>

      {searched && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                {showDetailedView ? 'Detailed Mark List' : 'Student Mark List'}
              </h2>
              {course && (
                <p className="mt-1 text-sm text-slate-500">
                  {course.course_code} — {course.course_name} · {course.class_label} · Year{' '}
                  {course.year} · Sem {course.semester}
                  {course.faculty_name ? ` · ${course.faculty_name}` : ''}
                  {course.batch ? ` · Batch ${course.batch}` : ''}
                </p>
              )}
              {showDetailedView && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{selectedComponentLabel}</span>
                  {' · '}
                  {detailedReportBundle.report.studentsWithMarks} student(s) with marks · Question
                  marks, CO/PO per component, and class averages
                </p>
              )}
              {result?.message && (
                <p className="mt-1 text-xs text-amber-700">{result.message}</p>
              )}
              {selectedComponentId && !showDetailedView && searched && !loading && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {attainmentPayload?.marksheets?.length
                    ? `No marks entered yet for ${selectedComponentLabel}. The faculty must save marks in the mark sheet first.`
                    : 'No saved mark sheet found for this course yet.'}
                </p>
              )}
            </div>
          </div>

          {showDetailedView ? (
            <div className="p-4">
              <ExcelConsolidatedTable report={detailedReportBundle.report} />
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">S.No</th>
                  <th className="px-4 py-3">Reg No.</th>
                  <th className="px-4 py-3">Student Name</th>
                  {components.map((c) => (
                    <th key={c.component_id} className="px-4 py-3 text-center">
                      {c.component_label}
                    </th>
                  ))}
                  {components.length === 0 && (
                    <th className="px-4 py-3 text-center">Marks</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + Math.max(components.length, 1)}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No students found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.register_number} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-500">{s.sno}</td>
                      <td className="px-4 py-3 font-mono">{s.register_number}</td>
                      <td className="px-4 py-3 font-medium">{s.full_name}</td>
                      {components.length > 0 ? (
                        components.map((c) => (
                          <td key={c.component_id} className="px-4 py-3 text-center tabular-nums">
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
          )}

          <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
            Showing {students.length} student{students.length === 1 ? '' : 's'}
            {showDetailedView && detailedReportBundle?.report?.studentsWithMarks != null
              ? ` · ${detailedReportBundle.report.studentsWithMarks} with marks in ${selectedComponentLabel}`
              : ''}
          </div>
        </div>
      )}
    </HodShell>
  )
}
