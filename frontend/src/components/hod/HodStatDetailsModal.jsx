import { useCallback, useEffect, useMemo, useState } from 'react'
import { hodAPI } from '../../services/api'

const TYPE_META = {
  faculty: { title: 'Faculty', subtitle: 'Department teaching staff', sectionId: 'hod-faculty-section' },
  courses: { title: 'Courses', subtitle: 'Courses in your department', sectionId: 'hod-faculty-section' },
  assignments: {
    title: 'Course Assignments',
    subtitle: 'Faculty assigned to courses',
    sectionId: 'hod-assignments-section',
  },
  classes: { title: 'Classes', subtitle: 'Class groups by year, semester, and branch' },
  students_year_1: { title: 'Year 1 Students', subtitle: 'Students in year 1', year: 1 },
  students_year_2: { title: 'Year 2 Students', subtitle: 'Students in year 2', year: 2 },
  students_year_3: { title: 'Year 3 Students', subtitle: 'Students in year 3', year: 3 },
  students_year_4: { title: 'Year 4 Students', subtitle: 'Students in year 4', year: 4 },
}

function emptyStudentForm(department = '') {
  return {
    register_number: '',
    full_name: '',
    branch: 'Bachelor of Technology',
    department,
    year: '1',
    semester: '1',
  }
}

function buildStudentDisplayRows(students, targetCount, year, yearFacultyLabel = '') {
  const target = Math.max(0, Number(targetCount) || 0)
  const rows = (students || []).map((s, idx) => ({
    ...s,
    slot: idx + 1,
    isPlaceholder: false,
  }))
  while (rows.length < target) {
    rows.push({
      id: null,
      slot: rows.length + 1,
      register_number: '',
      full_name: '',
      branch: 'Bachelor of Technology',
      semester: 1,
      year,
      editable: true,
      isPlaceholder: true,
      faculty_name: yearFacultyLabel || null,
    })
  }
  return target > 0 ? rows.slice(0, target) : rows
}

function InlineStudentRow({ row, departmentName, year, yearFacultyLabel, saving, onSave, onEdit, onDelete }) {
  const [reg, setReg] = useState(row.register_number || '')
  const [name, setName] = useState(row.full_name || '')

  useEffect(() => {
    setReg(row.register_number || '')
    setName(row.full_name || '')
  }, [row.register_number, row.full_name, row.slot])

  if (row.isPlaceholder) {
    return (
      <tr className="bg-amber-50/40">
        <td className="px-6 py-2 text-xs font-medium text-slate-400">{row.slot}</td>
        <td className="px-4 py-2">
          <input
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            placeholder="Reg. no"
            className="w-full min-w-[88px] rounded border border-slate-200 px-2 py-1 text-sm font-mono"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Student name"
            className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-sm"
          />
        </td>
        <td className="px-4 py-2 text-slate-400">—</td>
        <td className="px-4 py-2 text-slate-400">—</td>
        <td className="px-4 py-2 text-xs text-slate-500">
          {row.faculty_name || yearFacultyLabel || '—'}
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            disabled={saving || !reg.trim() || !name.trim()}
            onClick={() => onSave({ register_number: reg.trim(), full_name: name.trim() })}
            className="text-xs font-medium text-navy hover:underline disabled:opacity-40"
          >
            Save
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-slate-50/80">
      <td className="px-6 py-3 text-xs text-slate-400">{row.slot}</td>
      <td className="px-4 py-3 font-mono">{row.register_number || '—'}</td>
      <td className="px-4 py-3 font-medium">{row.full_name}</td>
      <td className="px-4 py-3 text-slate-600">{row.branch || '—'}</td>
      <td className="px-4 py-3">{row.semester ?? '—'}</td>
      <td className="px-4 py-3 text-slate-500">{row.faculty_name || '—'}</td>
      <td className="px-4 py-3">
        {row.editable ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="text-xs font-medium text-navy hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(row)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Faculty roster only</span>
        )}
      </td>
    </tr>
  )
}

export default function HodStatDetailsModal({
  type,
  onClose,
  dashboardData,
  onNavigateSection,
  onRefresh,
}) {
  const meta = TYPE_META[type]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyStudentForm())
  const [saving, setSaving] = useState(false)
  const [classCount, setClassCount] = useState('1')
  const [studentCountInput, setStudentCountInput] = useState('0')
  const [yearSetting, setYearSetting] = useState(null)
  const [yearFaculty, setYearFaculty] = useState([])

  const isStudentView = type?.startsWith('students_year_')
  const departmentName = dashboardData?.department_detail?.name || dashboardData?.department || ''

  const load = useCallback(async () => {
    if (!meta) return
    setLoading(true)
    setError('')
    try {
      if (type === 'faculty') {
        const list =
          dashboardData?.faculty_with_courses?.length
            ? dashboardData.faculty_with_courses
            : dashboardData?.staff || []
        setItems(list)
      } else if (type === 'courses') {
        setItems(dashboardData?.courses || [])
      } else if (type === 'assignments') {
        setItems(dashboardData?.assignments || [])
      } else if (type === 'classes') {
        const res = await hodAPI.listClasses()
        setItems(res.data.classes || [])
      } else if (isStudentView && meta.year) {
        const [studentsRes, settingsRes] = await Promise.all([
          hodAPI.listStudents(meta.year),
          hodAPI.getYearSettings(),
        ])
        setItems(studentsRes.data.students || [])
        setYearFaculty(studentsRes.data.year_faculty || [])
        const setting = (settingsRes.data.year_settings || []).find((s) => s.year === meta.year)
        setYearSetting(setting || null)
        setClassCount(String(setting?.class_count ?? 1))
        setStudentCountInput(String(setting?.student_count ?? 0))
      } else {
        setItems([])
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load details.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [meta, type, dashboardData, isStudentView])

  useEffect(() => {
    load()
    setEditingId(null)
    setAdding(false)
    setMessage('')
    setForm(emptyStudentForm(departmentName))
  }, [load, departmentName])

  const displayStudentCount = isStudentView
    ? parseInt(studentCountInput, 10) || yearSetting?.student_count || 0
    : 0

  const yearFacultyLabel = yearFaculty.length ? yearFaculty.join(', ') : ''

  const studentDisplayRows = useMemo(() => {
    if (!isStudentView || !meta?.year) return []
    return buildStudentDisplayRows(items, displayStudentCount, meta.year, yearFacultyLabel)
  }, [isStudentView, meta?.year, items, displayStudentCount, yearFacultyLabel])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const source = isStudentView ? studentDisplayRows : items
    if (!q) return source
    return source.filter((item) => JSON.stringify(item).toLowerCase().includes(q))
  }, [items, search, isStudentView, studentDisplayRows])

  const startEdit = (student) => {
    setAdding(false)
    setEditingId(student.id)
    setForm({
      register_number: student.register_number || '',
      full_name: student.full_name || '',
      branch: student.branch || 'Bachelor of Technology',
      department: student.department || departmentName,
      year: String(student.year || meta?.year || 1),
      semester: String(student.semester || 1),
    })
  }

  const handleSaveYearSettings = async () => {
    if (!meta?.year) return
    const classes = parseInt(classCount, 10)
    const students = parseInt(studentCountInput, 10)
    if (!classes || classes < 1) {
      setError('Enter at least 1 class.')
      return
    }
    if (Number.isNaN(students) || students < 0) {
      setError('Enter a valid student count (0 or more).')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await hodAPI.updateYearSetting(meta.year, {
        class_count: classes,
        student_count: students,
      })
      setYearSetting(res.data.setting)
      setMessage(res.data.message || 'Year settings saved.')
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save year settings.')
    } finally {
      setSaving(false)
    }
  }

  const classesNum = parseInt(classCount, 10) || 1
  const perClass =
    displayStudentCount && classesNum
      ? Math.ceil((displayStudentCount / classesNum) * 10) / 10
      : 0
  const rosterCount = yearSetting?.roster_student_count
  const filledCount = items.filter((s) => s.full_name || s.register_number).length

  const handleSavePlaceholderRow = async (payload) => {
    setSaving(true)
    setError('')
    try {
      await hodAPI.addStudent({
        ...payload,
        branch: 'Bachelor of Technology',
        department: departmentName,
        year: meta.year,
        semester: 1,
      })
      setMessage('Student added to list.')
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add student.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveStudent = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        ...form,
        year: parseInt(form.year, 10),
        semester: parseInt(form.semester, 10),
      }
      if (editingId) {
        await hodAPI.updateStudent(editingId, payload)
        setMessage('Student updated.')
      } else {
        await hodAPI.addStudent(payload)
        setMessage('Student added.')
      }
      setEditingId(null)
      setAdding(false)
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save student.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStudent = async (student) => {
    if (!student.id) return
    if (!window.confirm(`Delete ${student.full_name} (${student.register_number})?`)) return
    setSaving(true)
    setError('')
    try {
      await hodAPI.deleteStudent(student.id)
      setMessage('Student deleted.')
      setEditingId(null)
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete student.')
    } finally {
      setSaving(false)
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
            {meta.sectionId && (
              <button
                type="button"
                onClick={() => {
                  onNavigateSection?.(meta.sectionId)
                  onClose()
                }}
                className="rounded-lg border border-navy px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5"
              >
                Manage below
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
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

        {isStudentView && (
          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
            <p className="text-sm font-semibold text-slate-800">Year {meta.year} summary</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Set total students and how many classes to divide them into (e.g. 180 students → 3
              classes ≈ 60 per class).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="font-medium text-slate-600">No. of students</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={studentCountInput}
                  onChange={(e) => setStudentCountInput(e.target.value)}
                  className="mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">No. of classes</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={classCount}
                  onChange={(e) => setClassCount(e.target.value)}
                  className="mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveYearSettings}
                className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {displayStudentCount > 0 && classesNum >= 1 && (
              <p className="mt-2 text-xs text-slate-600">
                ≈ <strong>{perClass}</strong> students per class
              </p>
            )}
            {displayStudentCount > 0 && (
              <p className="mt-2 text-xs font-medium text-navy">
                Name list: {filledCount} filled · {Math.max(0, displayStudentCount - filledCount)}{' '}
                empty slot{displayStudentCount - filledCount === 1 ? '' : 's'} below
              </p>
            )}
            {rosterCount != null && rosterCount !== displayStudentCount && (
              <p className="mt-1 text-xs text-slate-400">
                Named roster records: {rosterCount} (list below)
              </p>
            )}
          </div>
        )}

        {isStudentView && (
          <div className="border-b border-slate-100 px-6 py-3">
            <button
              type="button"
              onClick={() => {
                setAdding(true)
                setEditingId(null)
                setForm({
                  ...emptyStudentForm(departmentName),
                  year: String(meta.year),
                })
              }}
              className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white hover:bg-navy-dark"
            >
              + Add student
            </button>
          </div>
        )}

        {(error || message) && (
          <div className="px-6 pt-3">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {message && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </p>
            )}
          </div>
        )}

        {(adding || editingId) && isStudentView && (
          <div className="mx-6 mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">
              {editingId ? 'Edit student' : 'Add student'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs">
                <span className="font-medium text-slate-600">Reg. No</span>
                <input
                  value={form.register_number}
                  onChange={(e) => setForm({ ...form, register_number: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-medium text-slate-600">Name</span>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Branch</span>
                <input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Year</span>
                <select
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4].map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Semester</span>
                <select
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {[1, 2].map((s) => (
                    <option key={s} value={String(s)}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveStudent}
                className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setEditingId(null)
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <p className="px-6 py-12 text-center text-slate-500">Loading…</p>
          ) : isStudentView && displayStudentCount === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              Enter the number of students above and click Save to open the name list.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-slate-500">No records found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {type === 'faculty' && (
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Courses</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                )}
                {type === 'courses' && (
                  <tr>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Regulation</th>
                    <th className="px-4 py-3">Assigned to</th>
                  </tr>
                )}
                {type === 'assignments' && (
                  <tr>
                    <th className="px-6 py-3">Course</th>
                    <th className="px-4 py-3">Faculty</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Sem</th>
                  </tr>
                )}
                {type === 'classes' && (
                  <tr>
                    <th className="px-6 py-3">Year</th>
                    <th className="px-4 py-3">Sem</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Faculty</th>
                    <th className="px-4 py-3">Students</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                )}
                {isStudentView && (
                  <tr>
                    <th className="px-6 py-3">#</th>
                    <th className="px-4 py-3">Reg. No</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Sem</th>
                    <th className="px-4 py-3">Faculty roster</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {type === 'faculty' &&
                  filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-medium">{f.full_name}</td>
                      <td className="px-4 py-3 text-slate-600">{f.email}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {f.courses_display || f.course_count || 0}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            f.is_active !== false
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {f.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}

                {type === 'courses' &&
                  filtered.map((c) => (
                    <tr key={c.id || c.course_code} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-medium text-navy">{c.course_code}</td>
                      <td className="px-4 py-3">{c.name}</td>
                      <td className="px-4 py-3">{c.regulation}</td>
                      <td className="px-4 py-3 text-slate-600">{c.staff_display || '—'}</td>
                    </tr>
                  ))}

                {type === 'assignments' &&
                  filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3 font-medium">
                        {a.course_code} — {a.course_name}
                      </td>
                      <td className="px-4 py-3">{a.faculty_name}</td>
                      <td className="px-4 py-3">{a.year}</td>
                      <td className="px-4 py-3">
                        {a.class_label || `Class ${a.class_number || 1}`}
                      </td>
                      <td className="px-4 py-3">{a.semester ?? '—'}</td>
                    </tr>
                  ))}

                {type === 'classes' &&
                  filtered.map((c, idx) => (
                    <tr key={`${c.year}-${c.semester}-${c.branch}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="px-6 py-3">Year {c.year}</td>
                      <td className="px-4 py-3">{c.semester}</td>
                      <td className="px-4 py-3">{c.branch || '—'}</td>
                      <td className="px-4 py-3">{c.faculty_name || '—'}</td>
                      <td className="px-4 py-3">{c.student_count}</td>
                      <td className="px-4 py-3 capitalize text-slate-500">{c.source?.replace('_', ' ')}</td>
                    </tr>
                  ))}

                {isStudentView &&
                  filtered.map((s) => (
                    <InlineStudentRow
                      key={s.isPlaceholder ? `slot-${s.slot}` : s.id || `row-${s.slot}`}
                      row={s}
                      departmentName={departmentName}
                      year={meta.year}
                      yearFacultyLabel={yearFacultyLabel}
                      saving={saving}
                      onSave={handleSavePlaceholderRow}
                      onEdit={startEdit}
                      onDelete={handleDeleteStudent}
                    />
                  ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
          {loading
            ? '—'
            : isStudentView
              ? `${filtered.length} row(s) · ${filledCount} named`
              : `${filtered.length} of ${items.length} records`}
        </div>
      </div>
    </div>
  )
}
