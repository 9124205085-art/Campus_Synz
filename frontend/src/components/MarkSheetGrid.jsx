import { useEffect, useState } from 'react'
import {
  maxMarkForQuestion,
  validateAllMarks,
  validateMarkInput,
} from '../utils/markValidation'

const DEFAULT_CO = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'CO7', 'CO8']

function MarkInput({ value, maxMark, onChange, className = '' }) {
  const [localError, setLocalError] = useState('')
  const handleChange = (e) => onChange(e.target.value)
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
        placeholder={`0–${maxMark}`}
        className={`w-full min-w-[64px] rounded border px-2 py-1.5 text-center focus:outline-none ${
          localError
            ? 'border-red-400 bg-red-50 focus:border-red-500'
            : 'border-slate-200 focus:border-navy'
        } ${className}`}
      />
      {localError && <span className="mt-0.5 block text-[10px] text-red-600">{localError}</span>}
    </div>
  )
}

function LegacyMarkSheetGrid({ marksheet, coOptions, onSave, onBack }) {
  const [questionCos, setQuestionCos] = useState(marksheet.question_cos || [])
  const [rows, setRows] = useState(marksheet.student_rows || [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setQuestionCos(marksheet.question_cos || [])
    setRows(marksheet.student_rows || [])
  }, [marksheet])

  const updateCo = (qIndex, value) => {
    const next = [...questionCos]
    next[qIndex] = value
    setQuestionCos(next)
  }

  const updateName = (rowIndex, value) => {
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, student_name: value } : r)))
  }

  const updateMark = (rowIndex, qIndex, value) => {
    setRows(
      rows.map((r, i) => {
        if (i !== rowIndex) return r
        const marks = [...(r.marks || [])]
        marks[qIndex] = value
        return { ...r, marks }
      }),
    )
  }

  const numQ = marksheet.num_questions
  const legacyQuestionMarks =
    marksheet.question_marks?.length === numQ
      ? marksheet.question_marks
      : Array.from({ length: numQ }, () => '2')

  const handleSave = async () => {
    const qMarks = legacyQuestionMarks
    for (let r = 0; r < rows.length; r++) {
      for (let q = 0; q < numQ; q++) {
        const { error } = validateMarkInput(rows[r].marks?.[q], maxMarkForQuestion(qMarks, q))
        if (error) {
          setMessage(`Row ${r + 1}, Q${q + 1}: ${error}`)
          return
        }
      }
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave({ question_cos: questionCos, student_rows: rows })
      setMessage('Saved successfully.')
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MarkSheetShell
      marksheet={marksheet}
      onBack={onBack}
      onSave={handleSave}
      saving={saving}
      message={message}
      onExport={() => exportLegacyCsv(marksheet, questionCos, rows)}
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th
              rowSpan={2}
              className="sticky left-0 z-10 min-w-[160px] border border-slate-300 bg-slate-200 px-3 py-2 text-left font-semibold"
            >
              Student Name
            </th>
            {Array.from({ length: numQ }, (_, i) => (
              <th
                key={`q-${i}`}
                className="min-w-[100px] border border-slate-300 px-2 py-2 text-center font-semibold text-navy"
              >
                Q{i + 1}
                {legacyQuestionMarks[i] && (
                  <span className="block text-[10px] font-normal text-slate-500">
                    max {legacyQuestionMarks[i]}m
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {Array.from({ length: numQ }, (_, i) => (
              <th key={`co-${i}`} className="border border-slate-300 px-1 py-1.5 text-center font-medium text-slate-700 text-xs">
                {questionCos[i] || 'CO1'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
              <td className="sticky left-0 border border-slate-200 bg-inherit px-2 py-1">
                <input
                  type="text"
                  value={row.student_name || ''}
                  onChange={(e) => updateName(rowIndex, e.target.value)}
                  className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1.5"
                />
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

function exportLegacyCsv(marksheet, questionCos, rows) {
  const lines = buildCourseMeta(marksheet)
  lines.push(['Student Name', ...questionCos.map((co, i) => `Q${i + 1} (${co})`)].join(','))
  rows.forEach((row) => {
    lines.push(
      [
        csvCell(row.student_name),
        ...(row.marks || []).map((m) => csvCell(m)),
      ].join(','),
    )
  })
  downloadCsv(marksheet.course_code, lines)
}

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

function MarkSheetShell({ marksheet, children, onBack, onSave, saving, message, onExport }) {
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
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-navy px-4 py-2 text-sm text-navy"
          >
            Export Excel (CSV)
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Marks'}
          </button>
        </div>
      </div>
      {message && (
        <p
          className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}
        >
          {message}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-inner">
        {children}
      </div>
    </div>
  )
}

export default function MarkSheetGrid({
  marksheet,
  coOptions = DEFAULT_CO,
  markOptions = ['1', '2', '13', '14', '16'],
  onSave,
  onBack,
}) {
  const isLegacy = !(marksheet.assessment_components && marksheet.assessment_components.length > 0)

  if (isLegacy) {
    return (
      <LegacyMarkSheetGrid
        marksheet={marksheet}
        coOptions={coOptions}
        onSave={onSave}
        onBack={onBack}
      />
    )
  }

  const components = marksheet.assessment_components
  const labels = marksheet.assessment_labels || components
  const [activeTab, setActiveTab] = useState(components[0])
  const [questionCos, setQuestionCos] = useState(marksheet.question_cos || [])
  const [questionMarks, setQuestionMarks] = useState(marksheet.question_marks || [])
  const [rows, setRows] = useState(marksheet.student_rows || [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setQuestionCos(marksheet.question_cos || [])
    setQuestionMarks(marksheet.question_marks || [])
    setRows(marksheet.student_rows || [])
    if (marksheet.assessment_components?.length) {
      setActiveTab(marksheet.assessment_components[0])
    }
  }, [marksheet])

  const numQ = marksheet.num_questions

  const updateCo = (qIndex, value) => {
    const next = [...questionCos]
    next[qIndex] = value
    setQuestionCos(next)
  }

  const updateMarkType = (qIndex, value) => {
    const next = [...questionMarks]
    next[qIndex] = value
    setQuestionMarks(next)
  }

  const updateName = (rowIndex, value) => {
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, student_name: value } : r)))
  }

  const updateRegister = (rowIndex, value) => {
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, register_number: value } : r)))
  }

  const updateCell = (rowIndex, assessmentId, qIndex, value) => {
    setRows(
      rows.map((r, i) => {
        if (i !== rowIndex) return r
        const am = { ...(r.assessment_marks || {}) }
        const marks = [...(am[assessmentId] || [])]
        marks[qIndex] = value
        am[assessmentId] = marks
        return { ...r, assessment_marks: am }
      }),
    )
  }

  const handleSave = async () => {
    const err = validateAllMarks(rows, components, numQ, questionMarks)
    if (err) {
      setMessage(err)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await onSave({
        question_cos: questionCos,
        question_marks: questionMarks,
        student_rows: rows,
      })
      setMessage('Saved successfully.')
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const exportExcel = () => {
    const lines = buildCourseMeta(marksheet)
    components.forEach((aid, idx) => {
      const title = labels[idx] || aid
      lines.push('')
      lines.push(`"${title}"`)
      const qHeaders = Array.from({ length: numQ }, (_, i) => {
        const co = questionCos[i] || 'CO1'
        const mk = questionMarks[i] || '2'
        return `"Q${i + 1} (${mk}m / ${co})"`
      })
      lines.push(['Register No', 'Student Name', ...qHeaders].join(','))
      rows.forEach((row) => {
        const marks = row.assessment_marks?.[aid] || []
        lines.push(
          [
            csvCell(row.register_number),
            csvCell(row.student_name),
            ...marks.map((m) => csvCell(m)),
          ].join(','),
        )
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
      onExport={exportExcel}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-2 pt-2">
        <p className="px-2 pb-2 text-xs font-medium text-slate-500">
          Question paper (same for all assessments)
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

      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th className="sticky left-0 z-10 min-w-[100px] border border-slate-300 bg-slate-200 px-2 py-2 text-left text-xs font-semibold">
              Reg. No
            </th>
            <th className="sticky left-[100px] z-10 min-w-[160px] border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold">
              Student Name
            </th>
            {Array.from({ length: numQ }, (_, i) => (
              <th
                key={`q-${i}`}
                className="min-w-[88px] border border-slate-300 px-1 py-2 text-center font-semibold text-navy"
                title={`Max ${questionMarks[i] || '?'} marks`}
              >
                Q{i + 1}
                <span className="block text-[10px] font-normal text-slate-500">
                  max {questionMarks[i]}m
                </span>
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            <th colSpan={2} className="border border-slate-300 px-2 py-1 text-xs text-slate-500">
              CO / Marks
            </th>
            {Array.from({ length: numQ }, (_, i) => (
              <th key={`cfg-${i}`} className="border border-slate-300 px-1 py-1.5 text-center font-medium text-slate-700">
                <div className="text-xs font-semibold text-navy">{questionCos[i] || 'CO1'}</div>
                <div className="text-xs text-slate-500">{questionMarks[i] || '2'}m</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
              <td className="sticky left-0 border border-slate-200 bg-inherit px-2 py-1">
                <input
                  type="text"
                  value={row.register_number || ''}
                  onChange={(e) => updateRegister(rowIndex, e.target.value)}
                  placeholder="Reg. no"
                  className="w-full min-w-[88px] rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </td>
              <td className="sticky left-[100px] border border-slate-200 bg-inherit px-2 py-1">
                <input
                  type="text"
                  value={row.student_name || ''}
                  onChange={(e) => updateName(rowIndex, e.target.value)}
                  placeholder={`Student ${rowIndex + 1}`}
                  className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1.5 font-medium focus:border-navy focus:outline-none"
                />
              </td>
              {Array.from({ length: numQ }, (_, qIndex) => (
                <td key={qIndex} className="border border-slate-200 px-1 py-1">
                  <MarkInput
                    value={row.assessment_marks?.[activeTab]?.[qIndex] ?? ''}
                    maxMark={maxMarkForQuestion(questionMarks, qIndex)}
                    onChange={(v) => updateCell(rowIndex, activeTab, qIndex, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-slate-400">
        Type student names in the name column. For each question, marks must be 0 or from 1 up to
        the max shown (e.g. Q with 2m → 0, 1, or 2 only). Switch tabs for CA, Quiz, model exam,
        etc.
      </p>
    </MarkSheetShell>
  )
}
