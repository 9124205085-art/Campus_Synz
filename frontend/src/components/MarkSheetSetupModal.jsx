import { useEffect, useMemo, useState } from 'react'
import CoPoMappingGrid from './CoPoMappingGrid'
import FormField from './FormField'
import SelectField from './SelectField'
import { facultyAPI } from '../services/api'
import { buildDefaultCoPoMapping } from '../utils/coPoAttainment'

const emptyQuestionConfig = (n) =>
  Array.from({ length: n }, () => ({ co: 'CO1', marks: '2' }))

export default function MarkSheetSetupModal({ open, onClose, onSubmit, defaultDepartment, courses = [] }) {
  const [config, setConfig] = useState(null)
  const [studentCount, setStudentCount] = useState(null)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [form, setForm] = useState({
    student_source: 'manual',
    num_students: '30',
    course_name: '',
    course_code: '',
    regulation: '',
    branch: '',
    department: defaultDepartment || '',
    year: '',
    semester: '',
    num_questions: '5',
    assessment_components: [],
  })
  const [questions, setQuestions] = useState(emptyQuestionConfig(5))
  const [coPoMapping, setCoPoMapping] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const usedCos = useMemo(
    () => [...new Set(questions.map((q) => q.co))].sort(),
    [questions],
  )

  useEffect(() => {
    if (!open) return
    facultyAPI
      .marksheetConfig()
      .then((res) => setConfig(res.data))
      .catch(() => setError('Could not load mark sheet options.'))
  }, [open])

  const numQ = parseInt(form.num_questions, 10) || 0

  useEffect(() => {
    if (!open || numQ < 1 || numQ > 50) return
    setQuestions((prev) => {
      if (prev.length === numQ) return prev
      const next = emptyQuestionConfig(numQ)
      for (let i = 0; i < Math.min(prev.length, numQ); i++) {
        next[i] = prev[i]
      }
      return next
    })
  }, [numQ, open])

  useEffect(() => {
    if (!open || !usedCos.length) return
    setCoPoMapping((prev) => {
      const next = { ...prev }
      let changed = false
      for (const co of usedCos) {
        if (!next[co]) {
          next[co] = buildDefaultCoPoMapping([co])[co]
          changed = true
        }
      }
      for (const co of Object.keys(next)) {
        if (!usedCos.includes(co)) {
          delete next[co]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [usedCos, open])

  useEffect(() => {
    if (!open || !config || form.student_source !== 'database') {
      setStudentCount(null)
      return
    }
    const { branch, department, year, semester } = form
    if (!branch || !department || !year || !semester) {
      setStudentCount(null)
      return
    }
    setLoadingStudents(true)
    facultyAPI
      .previewStudents({ branch, department, year, semester })
      .then((res) => setStudentCount(res.data.count))
      .catch(() => setStudentCount(0))
      .finally(() => setLoadingStudents(false))
  }, [
    form.branch,
    form.department,
    form.year,
    form.semester,
    form.student_source,
    open,
    config,
  ])

  const toggleAssessment = (id) => {
    setForm((f) => {
      const has = f.assessment_components.includes(id)
      return {
        ...f,
        assessment_components: has
          ? f.assessment_components.filter((x) => x !== id)
          : [...f.assessment_components, id],
      }
    })
  }

  const fillFromCourse = (course) => {
    setForm((f) => ({
      ...f,
      course_name: course.name,
      course_code: course.course_code,
      regulation: course.regulation,
    }))
  }

  const numStudents = parseInt(form.num_students, 10) || 0

  const canSubmit = useMemo(() => {
    const base =
      form.assessment_components.length > 0 &&
      form.course_name.trim() &&
      form.course_code.trim() &&
      form.regulation.trim() &&
      form.branch &&
      form.department &&
      form.year &&
      form.semester &&
      numQ >= 1
    if (form.student_source === 'database') {
      return base && studentCount > 0
    }
    return base && numStudents >= 1 && numStudents <= 200
  }, [form, numQ, studentCount, numStudents])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) {
      setError(
        form.student_source === 'database'
          ? 'Complete all fields and ensure students exist in the database for this class.'
          : 'Complete all fields and enter a valid number of students (1–200).',
      )
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        student_source: form.student_source,
        num_students: form.student_source === 'manual' ? numStudents : undefined,
        course_name: form.course_name.trim(),
        course_code: form.course_code.trim(),
        regulation: form.regulation.trim(),
        branch: form.branch,
        department: form.department,
        year: parseInt(form.year, 10),
        semester: parseInt(form.semester, 10),
        num_questions: numQ,
        assessment_components: form.assessment_components,
        question_cos: questions.map((q) => q.co),
        question_marks: questions.map((q) => q.marks),
        co_po_mapping: coPoMapping,
      })
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create mark sheet.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  const assessments = config?.assessment_components || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-800">Create Mark Entry Sheet</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set question COs and max marks first. Then open the sheet and type student names manually,
          or load names from the database.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {courses.length > 0 && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Fill from your department course (optional)
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                const c = courses.find((x) => String(x.id) === e.target.value)
                if (c) fillFromCourse(c)
              }}
            >
              <option value="">— Select course —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">
              Mark sheet components
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {assessments.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={form.assessment_components.includes(a.id)}
                    onChange={() => toggleAssessment(a.id)}
                    className="rounded border-slate-300 text-navy focus:ring-navy"
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">
              Students
            </h3>
            <div className="mb-4 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="student_source"
                  checked={form.student_source === 'manual'}
                  onChange={() => setForm({ ...form, student_source: 'manual' })}
                />
                Manual — type names in the sheet
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="student_source"
                  checked={form.student_source === 'database'}
                  onChange={() => setForm({ ...form, student_source: 'database' })}
                />
                Load from database
              </label>
            </div>
            {form.student_source === 'manual' ? (
              <FormField
                label="Number of Students (empty name rows)"
                id="num_students"
                type="number"
                value={form.num_students}
                onChange={(e) => setForm({ ...form, num_students: e.target.value })}
                placeholder="e.g. 60"
              />
            ) : null}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy">
              Course details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Course Code"
                id="course_code"
                value={form.course_code}
                onChange={(e) => setForm({ ...form, course_code: e.target.value.toUpperCase() })}
                placeholder="e.g. CS101"
              />
              <FormField
                label="Course Name"
                id="course_name"
                value={form.course_name}
                onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                placeholder="e.g. Data Structures"
              />
              <FormField
                label="Regulation"
                id="regulation"
                value={form.regulation}
                onChange={(e) => setForm({ ...form, regulation: e.target.value })}
                placeholder="e.g. 2021"
              />
              <SelectField
                label="Branch"
                id="branch"
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                options={(config?.branches || []).map((b) => ({ value: b, label: b }))}
              />
              <SelectField
                label="Department"
                id="department"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                options={(config?.departments || []).map((d) => ({ value: d, label: d }))}
              />
              <SelectField
                label="Year"
                id="year"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                options={(config?.years || []).map((y) => ({ value: String(y), label: `Year ${y}` }))}
              />
              <SelectField
                label="Semester"
                id="semester"
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                options={(config?.semesters || []).map((s) => ({
                  value: String(s),
                  label: `Semester ${s}`,
                }))}
              />
            </div>
            {form.student_source === 'database' && (
              <p className="mt-2 text-sm text-slate-600">
                {loadingStudents && 'Checking students…'}
                {!loadingStudents && studentCount !== null && (
                  <span
                    className={
                      studentCount > 0
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-amber-700'
                    }
                  >
                    {studentCount > 0
                      ? `${studentCount} student(s) will be loaded from the database.`
                      : 'No students found for this selection.'}
                  </span>
                )}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy">
              Question paper
            </h3>
            <FormField
              label="Number of Questions"
              id="num_questions"
              type="number"
              value={form.num_questions}
              onChange={(e) => setForm({ ...form, num_questions: e.target.value })}
              placeholder="e.g. 10"
            />
            {numQ >= 1 && numQ <= 50 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Question</th>
                      <th className="px-3 py-2 text-left">CO</th>
                      <th className="px-3 py-2 text-left">Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-navy">Q{i + 1}</td>
                        <td className="px-3 py-2">
                          <select
                            value={q.co}
                            onChange={(e) => {
                              const next = [...questions]
                              next[i] = { ...next[i], co: e.target.value }
                              setQuestions(next)
                            }}
                            className="w-full rounded border border-slate-200 px-2 py-1"
                          >
                            {(config?.co_options || ['CO1']).map((co) => (
                              <option key={co} value={co}>
                                {co}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={q.marks}
                            onChange={(e) => {
                              const next = [...questions]
                              next[i] = { ...next[i], marks: e.target.value }
                              setQuestions(next)
                            }}
                            className="w-full rounded border border-slate-200 px-2 py-1"
                          >
                            {(config?.mark_options || ['2']).map((m) => (
                              <option key={m} value={m}>
                                {m} mark{m !== '1' ? 's' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-violet-800">
              CO–PO Mapping
            </h3>
            <CoPoMappingGrid
              usedCos={usedCos}
              mapping={coPoMapping}
              onChange={(co, po, val) => {
                setCoPoMapping((prev) => ({
                  ...prev,
                  [co]: { ...(prev[co] || {}), [po]: val },
                }))
              }}
            />
          </section>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Opening...' : 'Open Mark Sheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
