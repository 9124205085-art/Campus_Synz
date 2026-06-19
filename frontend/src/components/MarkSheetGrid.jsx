import { useCallback, useEffect, useMemo, useState } from 'react'
import AssignmentLevelConfigTable from './AssignmentLevelConfigTable'
import { facultyAPI } from '../services/api'
import {
  ASSIGNMENT_LEVEL_LABELS,
  ASSIGNMENT_LEVELS,
  autoAssignAssignmentLevels,
  availableReferenceComponents,
  buildDefaultAssignmentComponentConfig,
  isAssignmentComponent,
  levelQuestionCount,
  maxQuestionsAcrossLevels,
  padLevelQuestionConfig,
  questionConfigForAssignmentStudent,
} from '../utils/assignmentLevels'
import {
  maxMarkForQuestion,
  questionCountForStudentRow,
  validateAllMarks,
  validateAssignmentStudentLevels,
  validateLegacyMarksForCoReport,
  validateMarkInput,
  validateMarksForCoReport,
} from '../utils/markValidation'

const DEFAULT_CO = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'CO7', 'CO8']

// ─── MarkInput ────────────────────────────────────────────────────────────────

function MarkInput({ value, maxMark, onChange }) {
  const [localError, setLocalError] = useState('')

  const handleChange = (e) => {
    setLocalError('')
    onChange(e.target.value)
  }

  const handleBlur = (e) => {
    const { value: v, error } = validateMarkInput(e.target.value, maxMark)
    setLocalError(error || '')
    if (v !== e.target.value) onChange(v)
  }

  return (
    <div>
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        title={`0 to ${maxMark} marks`}
        placeholder={maxMark > 0 ? `0–${maxMark}` : '—'}
        className={`w-full min-w-[64px] rounded border px-2 py-1.5 text-center text-sm focus:outline-none ${
          localError
            ? 'border-red-400 bg-red-50 focus:border-red-500'
            : 'border-slate-200 focus:border-navy'
        }`}
      />
      {localError && (
        <span className="mt-0.5 block text-[10px] text-red-600">{localError}</span>
      )}
    </div>
  )
}

// ─── Shell (header bar + wrapper) ────────────────────────────────────────────

function MarkSheetShell({ marksheet, children, onBack, onSave, saving, message, onExport, onDelete, deleting }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-navy/5 p-4">
        <div className="text-sm text-slate-700">
          <p>
            <strong>{marksheet.course_code}</strong> — {marksheet.course_name}
          </p>
          <p>
            {marksheet.regulation} · {marksheet.branch} · {marksheet.department}
          </p>
          {(marksheet.year || marksheet.semester) && (
            <p>
              Year {marksheet.year} · Semester {marksheet.semester}
            </p>
          )}
          <p>
            Students: {marksheet.num_students} · Questions: {marksheet.num_questions}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-navy px-4 py-2 text-sm text-navy hover:bg-navy/5"
          >
            Export Excel (CSV)
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || saving}
              className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete Mark Sheet'}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || deleting}
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-navy-dark"
          >
            {saving ? 'Saving...' : 'Save Marks'}
          </button>
        </div>
      </div>

      {message && (
        <p className={`rounded-lg px-4 py-2 text-sm ${
          message.toLowerCase().includes('success')
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-600'
        }`}>
          {message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-inner">
        {children}
      </div>
    </div>
  )
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function buildCourseMeta(marksheet) {
  return [
    `Course Code,${csvCell(marksheet.course_code)}`,
    `Course Name,${csvCell(marksheet.course_name)}`,
    `Regulation,${csvCell(marksheet.regulation)}`,
    `Branch,${csvCell(marksheet.branch || '')}`,
    `Department,${csvCell(marksheet.department)}`,
    `Year,${marksheet.year ?? ''}`,
    `Semester,${marksheet.semester ?? ''}`,
    '',
  ]
}

function downloadCsv(courseCode, lines) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${courseCode}_marksheet.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Normalise question_marks ─────────────────────────────────────────────────
// The backend sometimes stores question_marks as:
//   - flat array:  ["2","2","13"]           ← correct
//   - object:      {"ca1":["2","2","13"]}   ← legacy bug; grab first value
function normaliseQuestionMarks(raw, numQ) {
  if (Array.isArray(raw) && raw.length === numQ) return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const first = Object.values(raw)[0]
    if (Array.isArray(first) && first.length === numQ) return first
  }
  return Array.from({ length: numQ }, () => '2')
}

function normaliseQuestionCos(raw, numQ) {
  if (Array.isArray(raw) && raw.length === numQ) return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const first = Object.values(raw)[0]
    if (Array.isArray(first) && first.length === numQ) return first
  }
  return Array.from({ length: numQ }, () => 'CO1')
}

// ─── Legacy grid (marksheets without assessment_components) ───────────────────

function LegacyMarkSheetGrid({ marksheet, coOptions, onSave, onBack, onDelete, deleting, validateRef }) {
  const numQ = marksheet.num_questions
  const [questionCos, setQuestionCos] = useState(marksheet.question_cos || [])
  const [rows, setRows] = useState(marksheet.student_rows || [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const legacyQuestionMarks = normaliseQuestionMarks(marksheet.question_marks, numQ)

  useEffect(() => {
    setQuestionCos(marksheet.question_cos || [])
    setRows(marksheet.student_rows || [])
  }, [marksheet])

  useEffect(() => {
    if (!validateRef) return
    validateRef.current = {
      validateForCoReport: () =>
        validateLegacyMarksForCoReport(rows, numQ, legacyQuestionMarks),
    }
    return () => {
      validateRef.current = null
    }
  }, [validateRef, rows, numQ, legacyQuestionMarks])

  const updateName = (rowIndex, value) =>
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, student_name: value } : r)))

  const updateMark = (rowIndex, qIndex, value) =>
    setRows(rows.map((r, i) => {
      if (i !== rowIndex) return r
      const marks = [...(r.marks || [])]
      marks[qIndex] = value
      return { ...r, marks }
    }))

  const handleSave = async () => {
    for (let r = 0; r < rows.length; r++) {
      for (let q = 0; q < numQ; q++) {
        const { error } = validateMarkInput(
          rows[r].marks?.[q],
          maxMarkForQuestion(legacyQuestionMarks, q),
        )
        if (error) { setMessage(`Row ${r + 1}, Q${q + 1}: ${error}`); return }
      }
    }
    setSaving(true); setMessage('')
    try {
      await onSave({ question_cos: questionCos, student_rows: rows })
      setMessage('Saved successfully.')
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save.')
    } finally { setSaving(false) }
  }

  const exportCsv = () => {
    const lines = buildCourseMeta(marksheet)
    lines.push(['Student Name', ...questionCos.map((co, i) => `Q${i + 1} (${co})`)].join(','))
    rows.forEach((row) =>
      lines.push([csvCell(row.student_name), ...(row.marks || []).map(csvCell)].join(',')),
    )
    downloadCsv(marksheet.course_code, lines)
  }

  return (
    <MarkSheetShell
      marksheet={marksheet}
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      message={message}
      onExport={exportCsv}
      onDelete={onDelete}
      deleting={deleting}
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th rowSpan={2} className="sticky left-0 z-10 min-w-[160px] border border-slate-300 bg-slate-200 px-3 py-2 text-left font-semibold">
              Student Name
            </th>
            {Array.from({ length: activeIsAssignment ? assignmentColumnCount : numQ }, (_, i) => (
              <th key={i} className="min-w-[100px] border border-slate-300 px-2 py-2 text-center font-semibold text-navy">
                Q{i + 1}
                <span className="block text-[10px] font-normal text-slate-500">
                  max {legacyQuestionMarks[i]}m
                </span>
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {Array.from({ length: activeIsAssignment ? assignmentColumnCount : numQ }, (_, i) => (
              <th key={i} className="border border-slate-300 px-1 py-1.5 text-center text-xs font-medium text-slate-700">
                {questionCos[i] || 'CO1'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
              <td className="sticky left-0 border border-slate-200 bg-inherit px-2 py-1">
                <input type="text" value={row.student_name || ''} onChange={(e) => updateName(rowIndex, e.target.value)}
                  className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1.5" />
              </td>
              {Array.from({ length: numQ }, (_, qIndex) => (
                <td key={qIndex} className="border border-slate-200 px-1 py-1">
                  <MarkInput
                    value={row.marks?.[qIndex] ?? ''}
                    maxMark={maxMarkForQuestion(legacyQuestionMarks, qIndex)}
                    onChange={(v) => updateMark(rowIndex, qIndex, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </MarkSheetShell>
  )
}

// ─── Main multi-component grid ────────────────────────────────────────────────

export default function MarkSheetGrid({
  marksheet,
  coOptions = DEFAULT_CO,
  markOptions = ['1', '2', '13', '14', '16'],
  onSave,
  onBack,
  onDelete,
  deleting = false,
  validateRef,
}) {
  const isLegacy = !(marksheet.assessment_components?.length > 0)

  const components = isLegacy ? [] : marksheet.assessment_components
  const labels = marksheet.assessment_labels || components
  const labelMap = useMemo(
    () => Object.fromEntries(components.map((aid, i) => [aid, labels[i] || aid])),
    [components, labels],
  )
  const numQ = marksheet.num_questions

  // ── ALL hooks must be at top level — no conditionals above them ──
  const [activeTab, setActiveTab] = useState(components[0] || '')
  const [questionCos] = useState(() => normaliseQuestionCos(marksheet.question_cos, numQ))
  const [questionMarks] = useState(() => normaliseQuestionMarks(marksheet.question_marks, numQ))
  const [componentSettings, setComponentSettings] = useState(marksheet.component_settings || {})
  const [rows, setRows] = useState(marksheet.student_rows || [])
  const [refMarksheets, setRefMarksheets] = useState([])
  const [savedMarksheets, setSavedMarksheets] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const referenceKey = useMemo(
    () => JSON.stringify(componentSettings[activeTab]?.reference_components || []),
    [activeTab, componentSettings],
  )

  const assignmentIds = useMemo(
    () => components.filter((id) => isAssignmentComponent(id, labelMap[id])),
    [components, labelMap],
  )
  const activeIsAssignment = isAssignmentComponent(activeTab, labelMap[activeTab])

  const assignmentColumnCount = useMemo(() => {
    if (!activeIsAssignment) return numQ
    const levels = componentSettings[activeTab]?.levels || {}
    return Math.max(numQ, maxQuestionsAcrossLevels(levels))
  }, [activeIsAssignment, activeTab, componentSettings, numQ])

  const availableRefs = useMemo(
    () =>
      availableReferenceComponents(
        savedMarksheets,
        marksheet.course_code,
        marksheet.year,
        marksheet.semester,
      ),
    [savedMarksheets, marksheet.course_code, marksheet.year, marksheet.semester],
  )

  useEffect(() => {
    facultyAPI.listMarksheets().then((res) => {
      setSavedMarksheets(res.data.marksheets || [])
    }).catch(() => setSavedMarksheets([]))
  }, [])

  useEffect(() => {
    if (!activeIsAssignment) {
      setRefMarksheets([])
      return
    }
    const cfg = componentSettings[activeTab]
    const refs = cfg?.reference_components || []
    const ids = [...new Set(refs.map((r) => r.marksheet_id).filter(Boolean))]
    if (!ids.length) {
      setRefMarksheets([])
      return
    }

    let cancelled = false
    Promise.all(
      ids.map((id) => facultyAPI.getMarksheet(id).then((res) => res.data.marksheet)),
    )
      .then((sheets) => {
        if (cancelled) return
        setRefMarksheets(sheets)
        if (cfg?.reference_components?.length && sheets.length) {
          setRows((prev) => {
            const { rows: next, assignedCount } = autoAssignAssignmentLevels(
              prev,
              activeTab,
              cfg,
              sheets,
            )
            if (assignedCount > 0) {
              setMessage(
                `Levels auto-assigned for ${assignedCount} student(s) from selected mark sheet(s).`,
              )
            }
            return next
          })
        }
      })
      .catch(() => {
        if (!cancelled) setRefMarksheets([])
      })

    return () => {
      cancelled = true
    }
  }, [activeIsAssignment, activeTab, referenceKey, componentSettings])

  const runAutoAssignLevels = useCallback(
    (silent = false) => {
      const cfg = componentSettings[activeTab]
      if (!cfg?.reference_components?.length) {
        if (!silent) {
          setMessage(
            'Select Continuous Assessment 1 (or CA2) above, then save CA marks first.',
          )
        }
        return
      }
      if (!refMarksheets.length) {
        if (!silent) {
          setMessage('Loading reference mark sheets… Select CA1 again in a moment.')
        }
        return
      }
      const { rows: next, assignedCount } = autoAssignAssignmentLevels(
        rows,
        activeTab,
        cfg,
        refMarksheets,
      )
      setRows(next)
      if (!silent) {
        if (assignedCount > 0) {
          setMessage(`Levels auto-assigned for ${assignedCount} student(s).`)
        } else {
          setMessage(
            'Could not assign levels — check register numbers match CA1 and CA1 marks are saved.',
          )
        }
      }
    },
    [activeTab, componentSettings, refMarksheets, rows],
  )

  useEffect(() => {
    if (isLegacy || !assignmentIds.length) return
    setComponentSettings((prev) => {
      let changed = false
      const next = { ...prev }
      for (const cid of assignmentIds) {
        if (next[cid]?.levels?.higher?.question_cos?.length) continue
        changed = true
        next[cid] = buildDefaultAssignmentComponentConfig(numQ, coOptions, markOptions)
        next[cid].levels = Object.fromEntries(
          ASSIGNMENT_LEVELS.map((level) => [
            level,
            {
              num_questions: numQ,
              question_cos: [...questionCos],
              question_marks: [...questionMarks],
            },
          ]),
        )
      }
      return changed ? next : prev
    })
  }, [isLegacy, assignmentIds, numQ, questionCos, questionMarks, coOptions, markOptions])

  useEffect(() => {
    setRows(marksheet.student_rows || [])
    setComponentSettings(marksheet.component_settings || {})
    if (marksheet.assessment_components?.length) {
      setActiveTab(marksheet.assessment_components[0])
    }
  }, [marksheet])

  useEffect(() => {
    if (!validateRef || isLegacy) return
    validateRef.current = {
      validateForCoReport: () =>
        validateMarksForCoReport(rows, components, numQ, questionMarks, {
          assessmentLabels: labelMap,
          componentSettings,
        }),
    }
    return () => {
      validateRef.current = null
    }
  }, [validateRef, isLegacy, rows, components, numQ, questionMarks, labelMap, componentSettings])

  // Delegate to legacy grid AFTER hooks
  if (isLegacy) {
    return (
      <LegacyMarkSheetGrid
        marksheet={marksheet}
        coOptions={coOptions}
        onSave={onSave}
        onBack={onBack}
        onDelete={onDelete}
        deleting={deleting}
        validateRef={validateRef}
      />
    )
  }

  const updateCell = (rowIndex, assessmentId, qIndex, value) =>
    setRows(rows.map((r, i) => {
      if (i !== rowIndex) return r
      const am = { ...(r.assessment_marks || {}) }
      const marks = [...(am[assessmentId] || [])]
      marks[qIndex] = value
      am[assessmentId] = marks
      return { ...r, assessment_marks: am }
    }))

  const updateName = (rowIndex, value) =>
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, student_name: value } : r)))

  const updateRegister = (rowIndex, value) =>
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, register_number: value } : r)))

  const updateStudentLevel = (rowIndex, componentId, level) =>
    setRows(rows.map((r, i) => {
      if (i !== rowIndex) return r
      return {
        ...r,
        assignment_levels: {
          ...(r.assignment_levels || {}),
          [componentId]: level,
        },
      }
    }))

  const updateAssignmentLevelConfig = (componentId, level, levelCfg) => {
    setComponentSettings((prev) => ({
      ...prev,
      [componentId]: {
        ...(prev[componentId] || buildDefaultAssignmentComponentConfig(numQ, coOptions, markOptions)),
        kind: 'assignment',
        levels: {
          ...(prev[componentId]?.levels || {}),
          [level]: levelCfg,
        },
      },
    }))
  }

  const updateAssignmentReferences = (componentId, refs) => {
    setComponentSettings((prev) => ({
      ...prev,
      [componentId]: {
        ...(prev[componentId] || buildDefaultAssignmentComponentConfig(numQ, coOptions, markOptions)),
        reference_components: refs,
      },
    }))
    if (refs.length) {
      setMessage('Loading CA marks and assigning levels…')
    }
  }

  const updateAssignmentThresholds = (componentId, thresholds) => {
    setComponentSettings((prev) => ({
      ...prev,
      [componentId]: {
        ...(prev[componentId] || buildDefaultAssignmentComponentConfig(numQ, coOptions, markOptions)),
        level_thresholds: thresholds,
      },
    }))
  }

  const handleSave = async () => {
    const levelErr = validateAssignmentStudentLevels(rows, assignmentIds)
    if (levelErr) {
      setMessage(levelErr)
      return
    }
    const err = validateAllMarks(rows, components, numQ, questionMarks, {
      componentSettings,
      assessmentLabels: labelMap,
    })
    if (err) {
      setMessage(err)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave({
        student_rows: rows,
        component_settings: componentSettings,
      })
      setMessage('Saved successfully.')
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const lines = buildCourseMeta(marksheet)
    components.forEach((aid, idx) => {
      const title = labels[idx] || aid
      const isAssign = isAssignmentComponent(aid, title)
      const colCount = isAssign
        ? Math.max(numQ, maxQuestionsAcrossLevels(componentSettings[aid]?.levels || {}))
        : numQ
      lines.push('')
      lines.push(`"${title}"`)
      const qHeaders = Array.from({ length: colCount }, (_, i) => `"Q${i + 1}"`)
      const levelHeader = isAssign ? ['Level'] : []
      lines.push(['Register No', 'Student Name', ...levelHeader, ...qHeaders].join(','))
      rows.forEach((row) => {
        const marks = row.assessment_marks?.[aid] || []
        const levelCell = isAssign
          ? [csvCell(ASSIGNMENT_LEVEL_LABELS[row.assignment_levels?.[aid]] || '')]
          : []
        lines.push([
          csvCell(row.register_number),
          csvCell(row.student_name),
          ...levelCell,
          ...marks.slice(0, colCount).map(csvCell),
        ].join(','))
      })
    })
    downloadCsv(marksheet.course_code, lines)
  }

  const activeLabel = labels[components.indexOf(activeTab)] || activeTab

  return (
    <MarkSheetShell
      marksheet={marksheet}
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      message={message}
      onExport={exportCsv}
      onDelete={onDelete}
      deleting={deleting}
    >
      {/* Tabs */}
      <div className="border-b border-slate-200 bg-slate-50 px-2 pt-2">
        <p className="px-2 pb-2 text-xs font-medium text-slate-500">
          {activeIsAssignment
            ? 'Assignment: configure CO/marks per level below, then assign each student to one level.'
            : 'Question paper (same for all assessments)'}
        </p>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {components.map((aid, i) => (
            <button
              key={aid}
              type="button"
              onClick={() => setActiveTab(aid)}
              className={`rounded-t-lg px-3 py-2 text-xs font-semibold sm:text-sm ${
                activeTab === aid
                  ? 'bg-white text-navy shadow-sm'
                  : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              {labels[i] || aid}
            </button>
          ))}
        </div>
      </div>

      <p className="bg-white px-4 py-2 text-sm font-medium text-navy">{activeLabel}</p>

      {activeIsAssignment && (
        <div className="border-b border-slate-200 bg-violet-50/40 px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">
              Levels auto-set from CA1/CA2: &lt;50% Lower · 50–74% Middle · ≥75% Higher
            </p>
            <button
              type="button"
              onClick={() => runAutoAssignLevels(false)}
              className="rounded-full border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50"
            >
              Re-assign levels from mark sheets
            </button>
          </div>
          <AssignmentLevelConfigTable
            title={`${activeLabel} — CO by level`}
            levels={componentSettings[activeTab]?.levels || {}}
            coOptions={coOptions}
            markOptions={markOptions}
            availableReferences={availableRefs}
            referenceComponents={componentSettings[activeTab]?.reference_components || []}
            levelThresholds={componentSettings[activeTab]?.level_thresholds}
            onReferenceChange={(refs) => updateAssignmentReferences(activeTab, refs)}
            onThresholdsChange={(t) => updateAssignmentThresholds(activeTab, t)}
            onChange={(level, levelCfg) => updateAssignmentLevelConfig(activeTab, level, levelCfg)}
          />
        </div>
      )}

      {/* Grid */}
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th className="sticky left-0 z-10 min-w-[100px] border border-slate-300 bg-slate-200 px-2 py-2 text-left text-xs font-semibold">
              Reg. No
            </th>
            <th className="sticky left-[100px] z-10 min-w-[160px] border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold">
              Student Name
            </th>
            {activeIsAssignment && (
              <th className="sticky left-[260px] z-10 min-w-[110px] border border-slate-300 bg-violet-100 px-2 py-2 text-left text-xs font-semibold text-violet-900">
                Level
              </th>
            )}
            {Array.from({ length: activeIsAssignment ? assignmentColumnCount : numQ }, (_, i) => (
              <th key={i} className="min-w-[88px] border border-slate-300 px-1 py-2 text-center font-semibold text-navy">
                Q{i + 1}
                {!activeIsAssignment && (
                  <span className="block text-[10px] font-normal text-slate-500">
                    max {questionMarks[i] ?? '?'}m
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            <th
              colSpan={activeIsAssignment ? 3 : 2}
              className="border border-slate-300 px-2 py-1 text-xs text-slate-500"
            >
              {activeIsAssignment ? 'CO / max marks shown per student cell' : 'CO / Marks'}
            </th>
            {Array.from({ length: activeIsAssignment ? assignmentColumnCount : numQ }, (_, i) => (
              <th key={i} className="border border-slate-300 px-1 py-1.5 text-center text-xs text-slate-400">
                {activeIsAssignment ? `Q${i + 1}` : (
                  <>
                    <div className="font-semibold text-navy">{questionCos[i] || 'CO1'}</div>
                    <div className="text-slate-500">{questionMarks[i] || '2'}m</div>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowQConfig = activeIsAssignment
              ? questionConfigForAssignmentStudent(
                  { ...marksheet, component_settings: componentSettings },
                  activeTab,
                  row,
                )
              : { question_cos: questionCos, question_marks: questionMarks }
            const rowQCount = activeIsAssignment
              ? levelQuestionCount(rowQConfig) || numQ
              : numQ
            const padded = activeIsAssignment
              ? padLevelQuestionConfig(rowQConfig, assignmentColumnCount)
              : {
                  question_cos: normaliseQuestionCos(rowQConfig.question_cos, numQ),
                  question_marks: normaliseQuestionMarks(rowQConfig.question_marks, numQ),
                }
            const rowQuestionMarks = padded.question_marks
            const rowQuestionCos = padded.question_cos
            const studentLevel = row.assignment_levels?.[activeTab] || ''

            return (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
              <td className="sticky left-0 border border-slate-200 bg-inherit px-2 py-1">
                <input
                  type="text"
                  value={row.register_number || ''}
                  onChange={(e) => updateRegister(rowIndex, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  placeholder="Reg. no"
                  className="w-full min-w-[88px] rounded border border-slate-200 px-2 py-1 text-xs focus:border-navy focus:outline-none"
                />
              </td>
              <td className="sticky left-[100px] border border-slate-200 bg-inherit px-2 py-1">
                <input
                  type="text"
                  value={row.student_name || ''}
                  onChange={(e) => updateName(rowIndex, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  placeholder={`Student ${rowIndex + 1}`}
                  className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1.5 font-medium focus:border-navy focus:outline-none"
                />
              </td>
              {activeIsAssignment && (
                <td className="sticky left-[260px] border border-slate-200 bg-inherit px-2 py-1">
                  <select
                    value={studentLevel}
                    onChange={(e) => updateStudentLevel(rowIndex, activeTab, e.target.value)}
                    className="w-full min-w-[100px] rounded border border-violet-200 bg-white px-2 py-1.5 text-xs font-medium text-violet-900 focus:border-violet-500 focus:outline-none"
                  >
                    <option value="">— Select —</option>
                    {ASSIGNMENT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {ASSIGNMENT_LEVEL_LABELS[level]}
                      </option>
                    ))}
                  </select>
                  {studentLevel && (
                    <span className="mt-0.5 block text-[10px] text-violet-600">
                      {ASSIGNMENT_LEVEL_LABELS[studentLevel]}
                    </span>
                  )}
                </td>
              )}
              {Array.from({ length: activeIsAssignment ? assignmentColumnCount : numQ }, (_, qIndex) => {
                if (activeIsAssignment && qIndex >= rowQCount) {
                  return (
                    <td key={qIndex} className="border border-slate-100 bg-slate-50/50 px-1 py-1 text-center text-xs text-slate-300">
                      —
                    </td>
                  )
                }
                const maxMark = maxMarkForQuestion(rowQuestionMarks, qIndex)
                return (
                  <td key={qIndex} className="border border-slate-200 px-1 py-1">
                    {activeIsAssignment && studentLevel && (
                      <div className="mb-0.5 text-center text-[9px] text-slate-400">
                        {rowQuestionCos[qIndex]} · {maxMark}m
                      </div>
                    )}
                    <MarkInput
                      value={row.assessment_marks?.[activeTab]?.[qIndex] ?? ''}
                      maxMark={maxMark}
                      onChange={(v) => updateCell(rowIndex, activeTab, qIndex, v)}
                    />
                  </td>
                )
              })}
            </tr>
            )
          })}
        </tbody>
      </table>

      <p className="px-4 py-3 text-xs text-slate-400">
        {activeIsAssignment
          ? 'Reg. No, Name, Level, and marks are shown below. Levels are auto-assigned from saved CA1/CA2 marks (<50% Lower, 50–74% Middle, ≥75% Higher). You can override Level manually. Save before CO Attainment.'
          : 'Type marks manually (decimals allowed). Each cell: 0 up to the max shown (e.g. 2m → 0, 1, 1.5, or 2). Save before CO Attainment.'}
      </p>
    </MarkSheetShell>
  )
}
