import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FormField from '../FormField'
import SelectField from '../SelectField'
import HodCoAttainmentModal from './HodCoAttainmentModal'
import { hodAPI } from '../../services/api'

const YEARS = [1, 2, 3, 4]

function classCountForYear(checklist, year) {
  const y = parseInt(year, 10)
  if (!y) return 1
  const setting = (checklist?.year_settings || []).find((s) => s.year === y)
  if (setting?.class_count != null) return Math.max(1, setting.class_count)
  const courses = checklist?.years?.find((node) => node.year === y)?.courses || []
  const fromCourses = Math.max(0, ...courses.map((c) => c.class_number || 1))
  return Math.max(1, fromCourses)
}

const COMPONENT_PRESETS = [
  { id: 'ca1', label: 'Continuous Assessment 1' },
  { id: 'ca2', label: 'Continuous Assessment 2' },
  { id: 'assignment_1', label: 'Assignment 1' },
  { id: 'assignment_2', label: 'Assignment 2' },
  { id: 'quiz_1', label: 'Quiz 1' },
  { id: 'model_exam', label: 'Model Examination' },
]

function CheckIcon({ done }) {
  if (done) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        title="Submitted"
      >
        ✓
      </span>
    )
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400"
      title="Pending"
    >
      —
    </span>
  )
}

function emptyComponentForm() {
  return {
    component_preset: '',
    component_label: '',
  }
}

export default function HodChecklistPanel({ onMessage, onError, refreshKey = 0 }) {
  const [checklist, setChecklist] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeYear, setActiveYear] = useState(1)
  const [activeClass, setActiveClass] = useState(1)
  const [assignTarget, setAssignTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [form, setForm] = useState(emptyComponentForm())
  const [attainmentView, setAttainmentView] = useState(null)
  const hasLoadedRef = useRef(false)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const fetchChecklist = useCallback((options = {}) => {
    const { silent = false } = options
    if (!hasLoadedRef.current && !silent) {
      setInitialLoading(true)
    } else if (hasLoadedRef.current) {
      setRefreshing(true)
    }

    return hodAPI
      .getChecklist()
      .then((res) => {
        setChecklist(res.data)
        hasLoadedRef.current = true
        const years = (res.data?.years || []).map((y) => y.year)
        if (years.length) {
          setActiveYear((current) => (years.includes(current) ? current : years[0]))
        }
      })
      .catch((err) =>
        onErrorRef.current?.(err.response?.data?.message || 'Failed to load checklist.'),
      )
      .finally(() => {
        setInitialLoading(false)
        setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    fetchChecklist()
  }, [fetchChecklist, refreshKey])

  const yearNode = useMemo(() => {
    if (!checklist?.years?.length) return { year: activeYear, courses: [] }
    return checklist.years.find((y) => y.year === activeYear) || { year: activeYear, courses: [] }
  }, [checklist, activeYear])

  const classCount = useMemo(
    () => classCountForYear(checklist, activeYear),
    [checklist, activeYear],
  )

  const classOptions = useMemo(
    () => Array.from({ length: classCount }, (_, i) => i + 1),
    [classCount],
  )

  useEffect(() => {
    setActiveClass(1)
  }, [activeYear])

  useEffect(() => {
    if (activeClass > classCount) {
      setActiveClass(1)
    }
  }, [activeClass, classCount])

  const handleAssignComponent = async (e) => {
    e.preventDefault()
    if (!assignTarget) return
    setSubmitting(true)
    onErrorRef.current?.('')
    try {
      const preset = COMPONENT_PRESETS.find((p) => p.id === form.component_preset)
      const componentLabel = form.component_label.trim() || preset?.label || ''
      const componentId = preset?.id || form.component_preset || componentLabel.toLowerCase().replace(/\s+/g, '_')

      await hodAPI.addChecklistItem({
        course_assignment_id: assignTarget.assignment_id,
        component_id: componentId,
        component_label: componentLabel,
      })
      onMessage?.(`Component assigned to ${assignTarget.course_code}.`)
      setAssignTarget(null)
      setForm(emptyComponentForm())
      await fetchChecklist({ silent: true })
    } catch (err) {
      onErrorRef.current?.(err.response?.data?.message || 'Could not assign component.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (item, courseCode) => {
    if (!window.confirm(`Remove ${item.component_label || item.component_id} from ${courseCode}?`)) {
      return
    }
    setRemovingId(item.id)
    onErrorRef.current?.('')
    try {
      await hodAPI.deleteChecklistItem(item.id)
      onMessage?.('Component removed from checklist.')
      await fetchChecklist({ silent: true })
    } catch (err) {
      onErrorRef.current?.(err.response?.data?.message || 'Could not remove component.')
    } finally {
      setRemovingId(null)
    }
  }

  const summary = checklist?.summary || {
    total_courses: 0,
    total: 0,
    completed: 0,
    pending: 0,
  }
  const courses = yearNode?.courses || []
  const classCourses = useMemo(
    () => courses.filter((c) => (c.class_number || 1) === activeClass),
    [courses, activeClass],
  )

  const yearSemester = useMemo(() => {
    const sems = [...new Set(classCourses.map((c) => c.semester).filter((s) => s != null))]
    return sems.length === 1 ? sems[0] : null
  }, [classCourses])

  return (
    <section className="mb-8 rounded-2xl bg-white p-6 shadow-md">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Component Submission Checklist</h2>
          <p className="mt-1 text-sm text-slate-500">
            Courses appear here automatically when you assign faculty under{' '}
            <strong>Course Assignments</strong>. Then assign mark sheet components for each course —
            items auto-tick when the assigned faculty submit matching CO/PO reports.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchChecklist({ silent: true })}
          disabled={refreshing}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
          Courses: <strong>{summary.total_courses}</strong>
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          Components: <strong>{summary.total}</strong>
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
          Completed: <strong>{summary.completed}</strong>
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
          Pending: <strong>{summary.pending}</strong>
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setActiveYear(y)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeYear === y
                ? 'bg-navy text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Year {y}
          </button>
        ))}
        {courses.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setAttainmentView({
                mode: 'year',
                year: activeYear,
                semester: yearSemester,
                classNumber: activeClass,
              })
            }
            className="ml-auto rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            CO / PO Attainment — Year {activeYear}
            {yearSemester != null ? ` · Sem ${yearSemester}` : ''}
            {classCount > 1 ? ` · Class ${activeClass}` : ''}
          </button>
        )}
      </div>

      {classCount > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Class — Year {activeYear}
          </span>
          {classOptions.map((cls) => {
            const countInClass = courses.filter((c) => (c.class_number || 1) === cls).length
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setActiveClass(cls)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeClass === cls
                    ? 'bg-teal-700 text-white'
                    : 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 hover:bg-teal-100'
                }`}
              >
                Class {cls}
                {countInClass > 0 ? (
                  <span className="ml-1.5 text-xs font-normal opacity-80">
                    ({countInClass} course{countInClass === 1 ? '' : 's'})
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      {initialLoading && !checklist ? (
        <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Loading checklist…
        </p>
      ) : classCourses.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {courses.length === 0 ? (
            <>
              No courses assigned for Year {activeYear}. Use <strong>+ Assign Course</strong> above
              to add a course and faculty — it will appear here automatically.
            </>
          ) : (
            <>
              No courses assigned for Year {activeYear} · Class {activeClass}. Assign faculty to
              this class under <strong>Course Assignments</strong>.
            </>
          )}
        </p>
      ) : (
        <div className={`space-y-4 ${refreshing ? 'opacity-70' : ''}`}>
          {classCourses.map((course) => (
            <div
              key={course.assignment_id}
              className="overflow-hidden rounded-xl border border-slate-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-navy">
                      {course.course_code}
                      <span className="ml-2 font-normal text-slate-600">{course.course_name}</span>
                    </p>
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                      {course.class_label || `Class ${course.class_number || 1}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Faculty: {course.faculty_name || '—'} · Year {course.year ?? activeYear} · Sem{' '}
                    {course.semester ?? '—'}
                    {course.regulation ? ` · ${course.regulation}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAttainmentView({ mode: 'course', course })
                    }
                    className="rounded-full bg-navy px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy-dark"
                  >
                    CO / PO Attainment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignTarget(course)
                      setForm(emptyComponentForm())
                    }}
                    className="rounded-full border border-navy px-4 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5"
                  >
                    + Assign component
                  </button>
                </div>
              </div>

              {course.components.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500">
                  No components assigned yet. Click <strong>Assign component</strong> to track CA1,
                  CA2, Assignment, etc.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Component</th>
                      <th className="px-4 py-2">Submitted by</th>
                      <th className="px-4 py-2">Submitted at</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {course.components.map((item) => (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                        <td className="px-4 py-2.5">
                          <CheckIcon done={item.completed} />
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {item.component_label || item.component_id}
                        </td>
                        <td className="px-4 py-2.5">{item.submitted_by || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => handleRemove(item, course.course_code)}
                            disabled={removingId === item.id}
                            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            {removingId === item.id ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      <HodCoAttainmentModal
        open={Boolean(attainmentView)}
        onClose={() => setAttainmentView(null)}
        mode={attainmentView?.mode}
        course={attainmentView?.course}
        year={attainmentView?.year}
        semester={attainmentView?.semester}
      />

      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-800">Assign component</h3>
            <p className="mt-1 text-sm text-slate-500">
              {assignTarget.course_code} — {assignTarget.course_name} · Year {assignTarget.year} ·
              {assignTarget.class_label || `Class ${assignTarget.class_number || 1}`} · Sem{' '}
              {assignTarget.semester ?? '—'} · {assignTarget.faculty_name}
            </p>
            <form onSubmit={handleAssignComponent} className="mt-4 space-y-4">
              <SelectField
                label="Mark sheet component"
                id="cl_component"
                value={form.component_preset}
                onChange={(e) => {
                  const preset = COMPONENT_PRESETS.find((p) => p.id === e.target.value)
                  setForm({
                    ...form,
                    component_preset: e.target.value,
                    component_label: preset?.label || '',
                  })
                }}
                options={[
                  { value: '', label: 'Select component' },
                  ...COMPONENT_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                  { value: 'custom', label: 'Custom (type below)' },
                ]}
              />
              {form.component_preset === 'custom' && (
                <FormField
                  label="Custom component name"
                  id="cl_component_custom"
                  value={form.component_label}
                  onChange={(e) => setForm({ ...form, component_label: e.target.value })}
                  placeholder="e.g. Continuous Assessment -1"
                />
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignTarget(null)}
                  className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.component_preset}
                  className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Assign component'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
