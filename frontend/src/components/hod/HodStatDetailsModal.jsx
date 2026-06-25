import { useCallback, useEffect, useMemo, useState } from 'react'
import { hodAPI } from '../../services/api'

function classSlotRange(classNumber, totalSlots, classCount) {
  if (totalSlots <= 0 || classCount <= 0) return { start: 1, end: 0 }
  const cn = Math.max(1, Math.min(classNumber, classCount))
  const base = Math.floor(totalSlots / classCount)
  const remainder = totalSlots % classCount
  let start
  let end
  if (cn <= remainder) {
    const size = base + 1
    start = (cn - 1) * size + 1
    end = cn * size
  } else {
    const size = base
    start = remainder * (base + 1) + (cn - remainder - 1) * base + 1
    end = start + size - 1
  }
  return { start, end }
}

function emptyClassForm(classNumber, departmentName, academicYear) {
  return {
    class_number: classNumber,
    department_name: departmentName || '',
    class_teacher_name: '',
    semester: '1',
    admission_year: '',
    academic_year: String(academicYear || 1),
  }
}

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

function buildClassRowsFromProfile(
  profile,
  allStudents,
  slotStart,
  slotEnd,
  year,
  yearFacultyLabel = '',
) {
  const roster = profile?.student_roster || []
  const byReg = new Map(
    (allStudents || []).map((s) => [
      String(s.register_number || '').trim().toLowerCase(),
      s,
    ]),
  )
  const rosterBySlot = new Map(roster.map((r) => [Number(r.slot), r]))
  const rows = []

  for (let slot = slotStart; slot <= slotEnd; slot += 1) {
    const classSlot = slot - slotStart + 1
    const rosterEntry = rosterBySlot.get(slot)
    if (rosterEntry?.register_number) {
      const dbStudent =
        byReg.get(String(rosterEntry.register_number).trim().toLowerCase()) ||
        (rosterEntry.student_id
          ? (allStudents || []).find((s) => s.id === rosterEntry.student_id)
          : null)
      if (dbStudent) {
        rows.push({
          ...dbStudent,
          slot,
          classSlot,
          isPlaceholder: false,
        })
        continue
      }
      rows.push({
        id: rosterEntry.student_id || null,
        register_number: rosterEntry.register_number,
        full_name: rosterEntry.full_name || '',
        branch: 'Bachelor of Technology',
        semester: profile?.semester ?? 1,
        year,
        slot,
        classSlot,
        editable: true,
        isPlaceholder: false,
        faculty_name: yearFacultyLabel || null,
      })
      continue
    }
    rows.push({
      id: null,
      slot,
      classSlot,
      register_number: '',
      full_name: '',
      branch: 'Bachelor of Technology',
      semester: profile?.semester ?? 1,
      year,
      editable: true,
      isPlaceholder: true,
      faculty_name: yearFacultyLabel || null,
    })
  }
  return rows
}

function InlineStudentRow({
  row,
  departmentName,
  year,
  yearFacultyLabel,
  saving,
  draftReg,
  draftName,
  onDraftChange,
  onSave,
  onEdit,
  onDelete,
}) {
  const [reg, setReg] = useState(row.register_number || draftReg || '')
  const [name, setName] = useState(row.full_name || draftName || '')

  useEffect(() => {
    setReg(row.register_number || draftReg || '')
    setName(row.full_name || draftName || '')
  }, [row.register_number, row.full_name, row.slot, draftReg, draftName])

  if (row.isPlaceholder) {
    return (
      <tr className="bg-amber-50/40">
        <td className="px-6 py-2 text-xs font-medium text-slate-400">{row.classSlot ?? row.slot}</td>
        <td className="px-4 py-2">
          <input
            value={reg}
            onChange={(e) => {
              setReg(e.target.value)
              onDraftChange?.(row.slot, 'register_number', e.target.value)
            }}
            placeholder="Reg. no"
            className="w-full min-w-[88px] rounded border border-slate-200 px-2 py-1 text-sm font-mono"
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              onDraftChange?.(row.slot, 'full_name', e.target.value)
            }}
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
            onClick={() =>
              onSave({
                slot: row.slot,
                register_number: reg.trim(),
                full_name: name.trim(),
              })
            }
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
      <td className="px-6 py-3 text-xs text-slate-400">{row.classSlot ?? row.slot}</td>
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
  embedded = false,
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
  const [classProfiles, setClassProfiles] = useState([])
  const [activeClass, setActiveClass] = useState(1)
  const [classForm, setClassForm] = useState(emptyClassForm(1, ''))
  const [savingClassProfile, setSavingClassProfile] = useState(false)
  const [rowDrafts, setRowDrafts] = useState({})

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
        setClassProfiles(studentsRes.data.class_profiles || [])
        const setting = (settingsRes.data.year_settings || []).find((s) => s.year === meta.year)
        setYearSetting(setting || null)
        setClassCount(String(setting?.class_count ?? studentsRes.data.class_count ?? 1))
        setStudentCountInput(String(setting?.student_count ?? 0))
      } else {
        setItems([])
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load details.')
      setItems([])
    } finally {
      setLoading(false)
      setRowDrafts({})
    }
  }, [meta, type, dashboardData, isStudentView])

  useEffect(() => {
    load()
    setEditingId(null)
    setAdding(false)
    setMessage('')
    setActiveClass(1)
    setForm(emptyStudentForm(departmentName))
  }, [load, departmentName])

  const classesNum = parseInt(classCount, 10) || 1

  const activeProfile = useMemo(
    () => classProfiles.find((p) => p.class_number === activeClass),
    [classProfiles, activeClass],
  )

  useEffect(() => {
    if (!isStudentView || !meta?.year) return
    if (activeProfile) {
      setClassForm({
        class_number: activeProfile.class_number,
        department_name: activeProfile.department_name || departmentName,
        class_teacher_name: activeProfile.class_teacher_name || '',
        semester: String(activeProfile.semester ?? 1),
        admission_year: activeProfile.admission_year || '',
        academic_year: String(meta.year),
      })
    } else {
      setClassForm(emptyClassForm(activeClass, departmentName, meta.year))
    }
  }, [activeProfile, activeClass, departmentName, isStudentView, meta?.year])

  useEffect(() => {
    if (activeClass > classesNum) setActiveClass(1)
  }, [activeClass, classesNum])

  const displayStudentCount = isStudentView
    ? parseInt(studentCountInput, 10) || yearSetting?.student_count || 0
    : 0

  const yearFacultyLabel = yearFaculty.length ? yearFaculty.join(', ') : ''

  const studentDisplayRows = useMemo(() => {
    if (!isStudentView || !meta?.year) return []
    return buildStudentDisplayRows(items, displayStudentCount, meta.year, yearFacultyLabel)
  }, [isStudentView, meta?.year, items, displayStudentCount, yearFacultyLabel])

  const classStudentRows = useMemo(() => {
    if (!isStudentView) return studentDisplayRows
    const profile = activeProfile
    let start = 1
    let end = displayStudentCount
    if (profile?.slot_start != null && profile?.slot_end != null) {
      start = profile.slot_start
      end = profile.slot_end
    } else if (displayStudentCount > 0 && classesNum >= 1) {
      const range = classSlotRange(activeClass, displayStudentCount, classesNum)
      start = range.start
      end = range.end
    }

    if (profile?.student_roster?.length) {
      return buildClassRowsFromProfile(
        profile,
        items,
        start,
        end,
        meta?.year,
        yearFacultyLabel,
      )
    }

    return studentDisplayRows
      .filter((row) => row.slot >= start && row.slot <= end)
      .map((row, idx) => ({ ...row, classSlot: idx + 1 }))
  }, [
    isStudentView,
    studentDisplayRows,
    activeProfile,
    activeClass,
    displayStudentCount,
    classesNum,
    items,
    meta?.year,
    yearFacultyLabel,
  ])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const source = isStudentView ? classStudentRows : items
    if (!q) return source
    return source.filter((item) => JSON.stringify(item).toLowerCase().includes(q))
  }, [items, search, isStudentView, classStudentRows])

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
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save year settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveClassProfile = async () => {
    if (!meta?.year) return
    setSavingClassProfile(true)
    setError('')
    setMessage('')
    try {
      const res = await hodAPI.updateClassProfile(meta.year, activeClass, {
        department_name: classForm.department_name.trim(),
        class_teacher_name: classForm.class_teacher_name.trim(),
        semester: parseInt(classForm.semester, 10) || 1,
        admission_year: classForm.admission_year.trim(),
      })
      setClassProfiles(res.data.class_profiles || [])
      setMessage(res.data.message || `Class ${activeClass} details saved.`)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save class details.')
    } finally {
      setSavingClassProfile(false)
    }
  }

  const draftKey = (slot) => `c${activeClass}-s${slot}`

  const handleDraftChange = (slot, field, value) => {
    const key = draftKey(slot)
    setRowDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const collectDraftEntriesForClass = () => {
    return classStudentRows
      .filter((row) => row.isPlaceholder)
      .map((row) => {
        const draft = rowDrafts[draftKey(row.slot)] || {}
        return {
          slot: row.slot,
          register_number: (draft.register_number || '').trim(),
          full_name: (draft.full_name || '').trim(),
        }
      })
      .filter((entry) => entry.register_number && entry.full_name)
  }

  const filledDraftCount = collectDraftEntriesForClass().length

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
      const res = await hodAPI.addStudentsBulk({
        year: meta.year,
        semester: parseInt(classForm.semester, 10) || 1,
        class_number: activeClass,
        branch: 'Bachelor of Technology',
        students: [
          {
            slot: payload.slot,
            register_number: payload.register_number,
            full_name: payload.full_name,
          },
        ],
      })
      if (res.data.class_profiles?.length) {
        setClassProfiles(res.data.class_profiles)
      }
      setMessage(res.data.message || 'Student added to list.')
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add student.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAllClassNames = async () => {
    const entries = collectDraftEntriesForClass()
    if (!entries.length) {
      setError('Enter at least one register number and student name, then save the list.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await hodAPI.addStudentsBulk({
        year: meta.year,
        semester: parseInt(classForm.semester, 10) || 1,
        class_number: activeClass,
        branch: 'Bachelor of Technology',
        students: entries,
      })
      if (res.data.class_profiles?.length) {
        setClassProfiles(res.data.class_profiles)
      }
      setMessage(res.data.message || `Saved ${entries.length} student(s).`)
      setRowDrafts({})
      await load()
      onRefresh?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save student list.')
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

  const footerText = loading
    ? '—'
    : isStudentView
      ? `Class ${activeClass}: ${filtered.length} row(s) · ${filtered.filter((s) => !s.isPlaceholder && (s.full_name || s.register_number)).length} named in this class`
      : `${filtered.length} of ${items.length} records`

  const scrollWrapClass = embedded
    ? ''
    : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'

  if (embedded) {
    return (
      <div className="w-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-6 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {renderBody()}
        <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
          {footerText}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
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

        <div className={scrollWrapClass}>
          <div className="border-b border-slate-100 px-6 py-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {renderBody()}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
          {footerText}
        </div>
      </div>
    </div>
  )

  function renderBody() {
    return (
      <>

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
                Name list: {filledCount} saved · {Math.max(0, displayStudentCount - filledCount)}{' '}
                empty slot{displayStudentCount - filledCount === 1 ? '' : 's'} below
              </p>
            )}
            {displayStudentCount > 0 && (
              <p className="mt-1 text-xs text-amber-800">
                Saving student count above only opens empty rows. Enter names below, then click{' '}
                <strong>Save all names in this class</strong>. Register numbers must be unique
                across all departments (e.g. FT26001, not 1).
              </p>
            )}
            {rosterCount != null && rosterCount !== displayStudentCount && (
              <p className="mt-1 text-xs text-slate-400">
                Named roster records: {rosterCount} (list below)
              </p>
            )}
          </div>
        )}

        {isStudentView && displayStudentCount > 0 && classesNum >= 1 && (
          <div className="border-b border-slate-100 bg-white px-6 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                View class
              </span>
              {Array.from({ length: classesNum }, (_, i) => i + 1).map((cls) => {
                const profile = classProfiles.find((p) => p.class_number === cls)
                const countInClass = studentDisplayRows.filter((row) => {
                  const start = profile?.slot_start ?? classSlotRange(cls, displayStudentCount, classesNum).start
                  const end = profile?.slot_end ?? classSlotRange(cls, displayStudentCount, classesNum).end
                  return row.slot >= start && row.slot <= end && (row.full_name || row.register_number)
                }).length
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
                    <span className="ml-1.5 text-xs font-normal opacity-80">
                      ({countInClass} named)
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="text-sm font-semibold text-slate-800">
              Class {activeClass} details
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Enter department, class teacher, semester, and admission year manually for this class.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs">
                <span className="font-medium text-slate-600">Department name</span>
                <input
                  value={classForm.department_name}
                  onChange={(e) =>
                    setClassForm({ ...classForm, department_name: e.target.value })
                  }
                  placeholder="e.g. B.E. Mechanical"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Class teacher name</span>
                <input
                  value={classForm.class_teacher_name}
                  onChange={(e) =>
                    setClassForm({ ...classForm, class_teacher_name: e.target.value })
                  }
                  placeholder="e.g. Dr. Kumar"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Year</span>
                <input
                  value={classForm.academic_year}
                  readOnly
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-medium text-slate-600">Semester</span>
                <select
                  value={classForm.semester}
                  onChange={(e) => setClassForm({ ...classForm, semester: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={String(s)}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-medium text-slate-600">Year of admission</span>
                <input
                  value={classForm.admission_year}
                  onChange={(e) =>
                    setClassForm({ ...classForm, admission_year: e.target.value })
                  }
                  placeholder="e.g. 2026-2027"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={savingClassProfile}
                onClick={handleSaveClassProfile}
                className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingClassProfile ? 'Saving…' : `Save Class ${activeClass} details`}
              </button>
              {activeProfile && (
                <p className="text-xs text-slate-500">
                  Students in this class: slots {activeProfile.slot_start}–{activeProfile.slot_end}{' '}
                  (≈ {activeProfile.student_capacity} slots)
                </p>
              )}
            </div>
          </div>
        )}

        {isStudentView && displayStudentCount > 0 && (
          <div className="border-b border-slate-100 px-6 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Class {activeClass} student list
              {classForm.admission_year ? ` · Admission ${classForm.admission_year}` : ''}
              {classForm.class_teacher_name
                ? ` · Teacher: ${classForm.class_teacher_name}`
                : ''}
            </p>
          </div>
        )}

        {isStudentView && displayStudentCount > 0 && (
          <div className="border-b border-slate-100 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
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
              {filledDraftCount > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveAllClassNames}
                  className="rounded-lg border border-navy px-4 py-2 text-xs font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : `Save all names in this class (${filledDraftCount})`}
                </button>
              )}
            </div>
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

        <div>
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
                      draftReg={rowDrafts[draftKey(s.slot)]?.register_number}
                      draftName={rowDrafts[draftKey(s.slot)]?.full_name}
                      onDraftChange={s.isPlaceholder ? handleDraftChange : undefined}
                      onSave={handleSavePlaceholderRow}
                      onEdit={startEdit}
                      onDelete={handleDeleteStudent}
                    />
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    )
  }
}
