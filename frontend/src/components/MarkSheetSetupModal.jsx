import { useEffect, useMemo, useState } from 'react'
import AssignmentLevelConfigTable from './AssignmentLevelConfigTable'
import CoPoMappingGrid from './CoPoMappingGrid'
import FormField from './FormField'
import SelectField from './SelectField'
import { facultyAPI } from '../services/api'
import {
  availableReferenceComponents,
  buildDefaultAssignmentComponentConfig,
  buildDefaultAssignmentLevels,
  isAssignmentComponent,
  levelConfigFromQuestions,
  maxQuestionsAcrossLevels,
  questionsFromLevelConfig,
} from '../utils/assignmentLevels'
import { buildDefaultCoPoMapping } from '../utils/coPoAttainment'
import { semesterAfterYearChange, semesterOptionsForYear } from '../utils/academicTerms'

const emptyQuestionConfig = (n) =>
  Array.from({ length: n }, () => ({ co: 'CO1', marks: '2' }))

function slugifyCustomComponent(label) {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  if (!slug) return null
  return `custom_${slug.slice(0, 40)}`
}

function matchDepartmentName(name, departments = []) {
  if (!name) return ''
  if (departments.includes(name)) return name
  const lower = name.toLowerCase()
  return departments.find((d) => d.toLowerCase() === lower) || name
}

function branchFromDegree(degree, branches = []) {
  if (degree === 'B.E' && branches.includes('Bachelor of Engineering')) {
    return 'Bachelor of Engineering'
  }
  if (branches.includes('Bachelor of Technology')) {
    return 'Bachelor of Technology'
  }
  return branches[0] || ''
}

/** Unique key per HOD course assignment (not just course id). */
function courseOptionKey(course) {
  if (!course) return ''
  return String(course.assignment_id ?? course.id ?? '')
}

function findCourseByKey(courses, key) {
  if (!key) return null
  return courses.find((c) => courseOptionKey(c) === key) || null
}

function computeDefaultForm({
  config,
  facultyUser,
  departmentDetail,
  courses,
  rosters,
  marksheets,
  prefillCourse,
}) {
  const departments = config?.departments || []
  const branches = config?.branches || []
  const deptName =
    departmentDetail?.name ||
    facultyUser?.department ||
    matchDepartmentName(facultyUser?.department, departments) ||
    ''
  const defaultBranch = branchFromDegree(departmentDetail?.degree, branches)

  const base = {
    student_source: 'roster',
    num_students: '30',
    course_name: '',
    course_code: '',
    regulation: '',
    branch: defaultBranch,
    department: deptName,
    year: '',
    semester: '',
    num_questions: '5',
    assessment_components: [],
  }

  const applyCourse = (course) => {
    if (!course) return base
    const year = course.year ? String(course.year) : ''
    const semester = course.semester
      ? String(course.semester)
      : semesterAfterYearChange(year, '')
    return {
      ...base,
      course_name: course.name || course.course_name || '',
      course_code: course.course_code || '',
      regulation: course.regulation || '',
      department: deptName,
      year,
      semester,
    }
  }

  const courseToUse =
    prefillCourse || (courses.length > 0 ? courses[0] : null)
  if (courseToUse) {
    return {
      form: applyCourse(courseToUse),
      selectedCourseId: courseOptionKey(courseToUse),
    }
  }

  const lastSheet = marksheets[0]
  if (lastSheet && courses.length === 0) {
    const year = lastSheet.year ? String(lastSheet.year) : ''
    return {
      form: {
        ...base,
        course_name: lastSheet.course_name || '',
        course_code: lastSheet.course_code || '',
        regulation: lastSheet.regulation || '',
        branch: lastSheet.branch || defaultBranch,
        department: matchDepartmentName(lastSheet.department, departments) || deptName,
        year,
        semester: lastSheet.semester
          ? String(lastSheet.semester)
          : semesterAfterYearChange(year, ''),
      },
      selectedCourseId: '',
    }
  }

  const lastRoster = [...rosters].sort(
    (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
  )[0]
  if (lastRoster) {
    const year = lastRoster.year ? String(lastRoster.year) : '1'
    return {
      form: {
        ...base,
        branch: lastRoster.branch || defaultBranch,
        department: matchDepartmentName(lastRoster.department, departments) || deptName,
        year,
        semester: lastRoster.semester
          ? String(lastRoster.semester)
          : semesterAfterYearChange(year, ''),
      },
      selectedCourseId: '',
    }
  }

  return {
    form: {
      ...base,
      year: '1',
      semester: '1',
    },
    selectedCourseId: '',
  }
}

export default function MarkSheetSetupModal({
  open,
  onClose,
  onSubmit,
  defaultDepartment,
  facultyUser,
  departmentDetail,
  courses = [],
  prefillCourse = null,
}) {
  const [config, setConfig] = useState(null)
  const [studentCount, setStudentCount] = useState(null)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [form, setForm] = useState({
    student_source: 'roster',
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
  const [customComponents, setCustomComponents] = useState([])
  const [newCustomName, setNewCustomName] = useState('')
  const [coPoMapping, setCoPoMapping] = useState({})
  const [assignmentLevelConfig, setAssignmentLevelConfig] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [savedMarksheets, setSavedMarksheets] = useState([])

  const numQ = parseInt(form.num_questions, 10) || 0

  const usedCos = useMemo(() => {
    const cos = new Set(questions.map((q) => q.co))
    for (const c of customComponents) {
      if (!form.assessment_components.includes(c.id)) continue
      if (!isAssignmentComponent(c.id, c.label)) continue
      const levels = assignmentLevelConfig[c.id]?.levels
      if (!levels) continue
      for (const levelCfg of Object.values(levels)) {
        ;(levelCfg?.question_cos || []).forEach((co) => cos.add(co))
      }
    }
    return [...cos].sort()
  }, [questions, customComponents, form.assessment_components, assignmentLevelConfig])

  const selectedAssignmentComponents = useMemo(
    () =>
      customComponents.filter(
        (c) =>
          form.assessment_components.includes(c.id) &&
          isAssignmentComponent(c.id, c.label),
      ),
    [customComponents, form.assessment_components],
  )

  const selectedNonAssignmentCount = useMemo(
    () =>
      customComponents.filter(
        (c) =>
          form.assessment_components.includes(c.id) &&
          !isAssignmentComponent(c.id, c.label),
      ).length,
    [customComponents, form.assessment_components],
  )

  const assignmentOnlySelected =
    selectedAssignmentComponents.length > 0 && selectedNonAssignmentCount === 0

  const effectiveNumQ = useMemo(() => {
    if (assignmentOnlySelected) {
      let max = 5
      for (const c of selectedAssignmentComponents) {
        const levels = assignmentLevelConfig[c.id]?.levels || {}
        max = Math.max(max, maxQuestionsAcrossLevels(levels))
      }
      return max
    }
    return numQ
  }, [assignmentOnlySelected, selectedAssignmentComponents, assignmentLevelConfig, numQ])

  const availableRefs = useMemo(
    () =>
      availableReferenceComponents(
        savedMarksheets,
        form.course_code,
        form.year,
        form.semester,
      ),
    [savedMarksheets, form.course_code, form.year, form.semester],
  )

  const semesterOptions = useMemo(
    () => semesterOptionsForYear(form.year),
    [form.year],
  )

  const departmentOptions = useMemo(() => {
    const list = [...(config?.departments || [])]
    const name = departmentDetail?.name || form.department
    if (name && !list.includes(name)) {
      list.unshift(name)
    }
    return list.map((d) => ({ value: d, label: d }))
  }, [config?.departments, departmentDetail?.name, form.department])

  useEffect(() => {
    if (!open) {
      setCustomComponents([])
      setNewCustomName('')
      setSelectedCourseId('')
      setAssignmentLevelConfig({})
      setForm((f) => ({ ...f, assessment_components: [] }))
      return
    }

    let cancelled = false
    setLoadingDefaults(true)
    setError('')

    Promise.all([
      facultyAPI.marksheetConfig(),
      facultyAPI.rosterSummary().catch(() => ({ data: { rosters: [] } })),
      facultyAPI.listMarksheets().catch(() => ({ data: { marksheets: [] } })),
    ])
      .then(([configRes, rosterRes, sheetsRes]) => {
        if (cancelled) return
        const cfg = configRes.data
        setConfig(cfg)

        const user = facultyUser || (defaultDepartment ? { department: defaultDepartment } : null)
        const { form: defaults, selectedCourseId: courseId } = computeDefaultForm({
          config: cfg,
          facultyUser: user,
          departmentDetail,
          courses,
          rosters: rosterRes.data.rosters || [],
          marksheets: sheetsRes.data.marksheets || [],
          prefillCourse,
        })

        setForm(defaults)
        setSelectedCourseId(courseId)
        setSavedMarksheets(sheetsRes.data.marksheets || [])
        setQuestions(emptyQuestionConfig(parseInt(defaults.num_questions, 10) || 5))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load mark sheet options.')
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, facultyUser, departmentDetail, courses, defaultDepartment, prefillCourse])

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
    if (!open || numQ < 1 || numQ > 50) return
    const coOpts = config?.co_options || ['CO1']
    const markOpts = config?.mark_options || ['2']
    setAssignmentLevelConfig((prev) => {
      if (!Object.keys(prev).length) return prev
      let changed = false
      const next = { ...prev }
      for (const [cid, cfg] of Object.entries(prev)) {
        if (!cfg?.levels) continue
        const resizedLevels = {}
        for (const [level, levelCfg] of Object.entries(cfg.levels)) {
          const qs = questionsFromLevelConfig(levelCfg)
          const padded = Array.from({ length: numQ }, (_, i) => {
            const d = { co: coOpts[0] || 'CO1', marks: markOpts[0] || '2' }
            return qs[i] ? { ...qs[i] } : d
          })
          resizedLevels[level] = levelConfigFromQuestions(padded)
        }
        next[cid] = { ...cfg, levels: resizedLevels }
        changed = true
      }
      return changed ? next : prev
    })
  }, [numQ, open, config?.co_options, config?.mark_options])

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
    if (!open || !config) {
      setStudentCount(null)
      return
    }
    const { branch, department, year, semester } = form
    if (!branch || !department || !year || !semester) {
      setStudentCount(null)
      return
    }
    if (form.student_source === 'database') {
      setLoadingStudents(true)
      facultyAPI
        .previewStudents({ branch, department, year, semester })
        .then((res) => setStudentCount(res.data.count))
        .catch(() => setStudentCount(0))
        .finally(() => setLoadingStudents(false))
      return
    }
    if (form.student_source === 'roster') {
      setLoadingStudents(true)
      facultyAPI
        .getStudentRoster({ branch, department, year, semester })
        .then((res) => {
          const count = res.data.count || 0
          setStudentCount(count)
          if (count > 0) {
            setForm((f) => ({
              ...f,
              num_students: String(Math.min(parseInt(f.num_students, 10) || count, count) || count),
            }))
          }
        })
        .catch(() => setStudentCount(0))
        .finally(() => setLoadingStudents(false))
      return
    }
    setStudentCount(null)
  }, [
    form.branch,
    form.department,
    form.year,
    form.semester,
    form.student_source,
    open,
    config,
  ])

  const addCustomComponent = () => {
    const label = newCustomName.trim()
    if (!label) {
      setError('Enter a name for the mark sheet component.')
      return
    }
    if (label.length > 120) {
      setError('Component name is too long (max 120 characters).')
      return
    }
    const id = slugifyCustomComponent(label)
    if (!id) {
      setError('Enter a valid component name.')
      return
    }
    const existingLabels = customComponents.map((c) => c.label.toLowerCase())
    if (existingLabels.includes(label.toLowerCase())) {
      setError('A component with this name already exists.')
      return
    }
    if (customComponents.some((c) => c.id === id)) {
      setError('This component name is too similar to one already added.')
      return
    }
    setCustomComponents((prev) => [...prev, { id, label }])
    if (isAssignmentComponent(id, label)) {
      const coOpts = config?.co_options || ['CO1']
      const markOpts = config?.mark_options || ['2']
      setAssignmentLevelConfig((prev) => ({
        ...prev,
        [id]: buildDefaultAssignmentComponentConfig(numQ || 5, coOpts, markOpts),
      }))
    }
    setForm((f) => ({
      ...f,
      assessment_components: f.assessment_components.includes(id)
        ? f.assessment_components
        : [...f.assessment_components, id],
    }))
    setNewCustomName('')
    setError('')
  }

  const toggleComponentSelection = (id) => {
    setForm((f) => {
      const selected = f.assessment_components.includes(id)
      return {
        ...f,
        assessment_components: selected
          ? f.assessment_components.filter((x) => x !== id)
          : [...f.assessment_components, id],
      }
    })
  }

  const removeCustomComponent = (id) => {
    setCustomComponents((prev) => prev.filter((c) => c.id !== id))
    setAssignmentLevelConfig((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setForm((f) => ({
      ...f,
      assessment_components: f.assessment_components.filter((x) => x !== id),
    }))
  }

  const fillFromCourse = (course) => {
    if (!course) return
    const year = course.year ? String(course.year) : ''
    setSelectedCourseId(courseOptionKey(course))
    setForm((f) => ({
      ...f,
      course_name: course.name || course.course_name || '',
      course_code: course.course_code || '',
      regulation: course.regulation || '',
      department: departmentDetail?.name || f.department,
      year,
      semester: course.semester
        ? String(course.semester)
        : semesterAfterYearChange(year, f.semester),
    }))
  }

  const numStudents = parseInt(form.num_students, 10) || 0

  const canSubmit = useMemo(() => {
    const courseSelected =
      courses.length === 0 || Boolean(findCourseByKey(courses, selectedCourseId))
    const base =
      courseSelected &&
      customComponents.length > 0 &&
      form.course_name.trim() &&
      form.course_code.trim() &&
      form.regulation.trim() &&
      form.branch &&
      form.department &&
      form.year &&
      form.semester &&
      (assignmentOnlySelected ? effectiveNumQ >= 1 : numQ >= 1)
    if (form.student_source === 'database') {
      return base && studentCount > 0
    }
    if (form.student_source === 'roster') {
      return base && studentCount > 0 && numStudents >= 1 && numStudents <= studentCount
    }
    return base && numStudents >= 1 && numStudents <= 200
  }, [form, numQ, effectiveNumQ, assignmentOnlySelected, studentCount, numStudents, courses, selectedCourseId])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) {
      setError(
        courses.length > 0 && !findCourseByKey(courses, selectedCourseId)
          ? 'Select your assigned course from the dropdown above.'
          : customComponents.length === 0
          ? 'Add at least one mark sheet component (e.g. CA1, Quiz 1, Internal Test).'
          : form.assessment_components.length === 0
            ? 'Select at least one component using the checkboxes below.'
            : form.student_source === 'database'
          ? 'Complete all fields and ensure students exist in the database for this class.'
          : form.student_source === 'roster'
            ? 'Complete all fields and save a class list from the Students card on your dashboard.'
            : 'Complete all fields and enter a valid number of students (1–200).',
      )
      return
    }
    setSubmitting(true)
    try {
      const selectedCourse = findCourseByKey(courses, selectedCourseId)
      const component_settings = {}
      for (const c of selectedAssignmentComponents) {
        component_settings[c.id] = assignmentLevelConfig[c.id] || buildDefaultAssignmentComponentConfig(
          effectiveNumQ,
          config?.co_options || ['CO1'],
          config?.mark_options || ['2'],
        )
      }
      await onSubmit({
        student_source: form.student_source,
        num_students:
          form.student_source === 'manual' || form.student_source === 'roster'
            ? numStudents
            : undefined,
        course_name: form.course_name.trim(),
        course_code: form.course_code.trim(),
        regulation: form.regulation.trim(),
        branch: form.branch,
        department: form.department,
        department_id: selectedCourse?.department_id || departmentDetail?.id,
        year: parseInt(form.year, 10),
        semester: parseInt(form.semester, 10),
        num_questions: effectiveNumQ,
        assessment_components: customComponents.map((c) => c.id),
        assessment_component_labels: Object.fromEntries(
          customComponents.map((c) => [c.id, c.label]),
        ),
        question_cos: assignmentOnlySelected
          ? (assignmentLevelConfig[selectedAssignmentComponents[0]?.id]?.levels?.higher?.question_cos ||
              questions.map((q) => q.co))
          : questions.map((q) => q.co),
        question_marks: assignmentOnlySelected
          ? (assignmentLevelConfig[selectedAssignmentComponents[0]?.id]?.levels?.higher?.question_marks ||
              questions.map((q) => q.marks))
          : questions.map((q) => q.marks),
        co_po_mapping: coPoMapping,
        component_settings,
      })
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create mark sheet.')
      throw err
    } finally {
      setSubmitting(false)
    }
  }

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
              Your assigned course (pre-filled below)
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={selectedCourseId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedCourseId(id)
                const c = findCourseByKey(courses, id)
                if (c) fillFromCourse(c)
              }}
            >
              <option value="">— Select course —</option>
              {courses.map((c) => (
                <option key={courseOptionKey(c)} value={courseOptionKey(c)}>
                  {c.course_code} — {c.name}
                  {c.year ? ` (Year ${c.year}${c.semester ? ` / Sem ${c.semester}` : ''})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {loadingDefaults && (
          <p className="mt-3 text-sm text-slate-500">Loading your course details…</p>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const tag = e.target?.tagName?.toLowerCase()
            const type = e.target?.type?.toLowerCase()
            if (tag === 'textarea' || type === 'submit') return
            if (e.target?.id === 'custom_component_name') return
            e.preventDefault()
          }}
          className="mt-6 space-y-6"
        >
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">
              Mark sheet components
            </h3>
            <p className="mb-3 text-sm text-slate-500">
              Add assessment types for this course, then select which ones to include in this mark
              sheet.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="custom_component_name" className="mb-1 block text-xs font-medium text-slate-600">
                  Component name
                </label>
                <input
                  id="custom_component_name"
                  type="text"
                  value={newCustomName}
                  onChange={(e) => setNewCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomComponent()
                    }
                  }}
                  placeholder="e.g. Continuous Assessment 1, Quiz 1, Model Examination"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={addCustomComponent}
                className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90"
              >
                Add component
              </button>
            </div>
            {customComponents.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No components yet. Add assessment types above, then select them below.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Select components for this mark sheet
                  {form.assessment_components.length > 0 && (
                    <span className="ml-2 normal-case text-navy">
                      ({form.assessment_components.length} selected)
                    </span>
                  )}
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {customComponents.map((c) => {
                    const selected = form.assessment_components.includes(c.id)
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${
                            selected
                              ? 'border-navy/30 bg-navy/5'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleComponentSelection(c.id)}
                            className="rounded border-slate-300 text-navy focus:ring-navy"
                          />
                          <span className="flex-1 font-medium text-slate-800">{c.label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              removeCustomComponent(c.id)
                            }}
                            className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          {selectedAssignmentComponents.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-violet-800">
                Assignment levels (Higher / Middle / Lower)
              </h3>
              <p className="mb-4 text-sm text-slate-500">
                Set the number of questions and CO for each level. Then select saved CA / quiz
                mark sheets — student levels will be assigned automatically (&lt;50% Lower, 50–74%
                Middle, ≥75% Higher).
              </p>
              <div className="space-y-6">
                {selectedAssignmentComponents.map((c) => (
                  <AssignmentLevelConfigTable
                    key={c.id}
                    title={c.label}
                    levels={assignmentLevelConfig[c.id]?.levels || {}}
                    coOptions={config?.co_options || ['CO1']}
                    markOptions={config?.mark_options || ['2']}
                    availableReferences={availableRefs}
                    referenceComponents={assignmentLevelConfig[c.id]?.reference_components || []}
                    levelThresholds={assignmentLevelConfig[c.id]?.level_thresholds}
                    onReferenceChange={(refs) => {
                      setAssignmentLevelConfig((prev) => ({
                        ...prev,
                        [c.id]: {
                          ...(prev[c.id] || buildDefaultAssignmentComponentConfig(5)),
                          reference_components: refs,
                        },
                      }))
                    }}
                    onThresholdsChange={(thresholds) => {
                      setAssignmentLevelConfig((prev) => ({
                        ...prev,
                        [c.id]: {
                          ...(prev[c.id] || buildDefaultAssignmentComponentConfig(5)),
                          level_thresholds: thresholds,
                        },
                      }))
                    }}
                    onChange={(level, levelCfg) => {
                      setAssignmentLevelConfig((prev) => ({
                        ...prev,
                        [c.id]: {
                          ...(prev[c.id] || buildDefaultAssignmentComponentConfig(5)),
                          levels: {
                            ...(prev[c.id]?.levels || {}),
                            [level]: levelCfg,
                          },
                        },
                      }))
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">
              Students
            </h3>
            <div className="mb-4 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="student_source"
                  checked={form.student_source === 'roster'}
                  onChange={() => setForm({ ...form, student_source: 'roster' })}
                />
                My saved class list (recommended)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="student_source"
                  checked={form.student_source === 'manual'}
                  onChange={() => setForm({ ...form, student_source: 'manual' })}
                />
                Manual — empty name rows
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
            {form.student_source === 'roster' ? (
              <>
                <FormField
                  label="Number of Students (from saved list)"
                  id="num_students_roster"
                  type="number"
                  value={form.num_students}
                  onChange={(e) => setForm({ ...form, num_students: e.target.value })}
                  placeholder="e.g. 30 or 50"
                />
                {loadingStudents && (
                  <p className="text-sm text-slate-500">Checking saved class list…</p>
                )}
                {!loadingStudents && studentCount !== null && (
                  <p
                    className={`text-sm ${
                      studentCount > 0 ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'
                    }`}
                  >
                    {studentCount > 0
                      ? `${studentCount} student(s) saved for this class. Names will auto-fill in the mark sheet.`
                      : 'No saved list for this class. Click Students on the dashboard to add names first.'}
                  </p>
                )}
              </>
            ) : form.student_source === 'manual' ? (
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
                options={departmentOptions}
              />
              <SelectField
                label="Year"
                id="year"
                value={form.year}
                onChange={(e) => {
                  const year = e.target.value
                  setForm((f) => ({
                    ...f,
                    year,
                    semester: semesterAfterYearChange(year, f.semester),
                  }))
                }}
                options={(config?.years || []).map((y) => ({ value: String(y), label: `Year ${y}` }))}
              />
              <SelectField
                label="Semester"
                id="semester"
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                disabled={!form.year}
                options={
                  semesterOptions.length
                    ? semesterOptions
                    : [{ value: '', label: 'Select year first' }]
                }
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

          {!assignmentOnlySelected && (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-navy">
              Question paper
            </h3>
            <p className="mb-3 text-sm text-slate-500">
              Default CO and marks for non-assignment components (CA, quiz, etc.).
            </p>
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
          )}

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
