/**
 * Validate mark entry.
 * Allowed: empty, 0, or any number from 0 to maxMark (inclusive).
 * Decimals are allowed (e.g. 1.5, 0.5).
 */

import {
  isAssignmentComponent,
  levelQuestionCount,
  padLevelQuestionConfig,
  questionConfigForAssignmentStudent,
} from './assignmentLevels'

export function maxMarkForQuestion(questionMarks, qIndex) {
  const m = parseFloat(questionMarks?.[qIndex])
  return Number.isNaN(m) ? 0 : m
}

export function validateMarkInput(raw, maxMark) {
  if (raw === '' || raw === null || raw === undefined) {
    return { value: '', error: null }
  }
  const trimmed = String(raw).trim()
  if (trimmed === '') return { value: '', error: null }

  const num = Number(trimmed)
  if (Number.isNaN(num)) {
    return { value: trimmed, error: `Enter a number from 0 to ${maxMark}.` }
  }
  if (num < 0 || num > maxMark) {
    return {
      value: trimmed,
      error: `Mark must be between 0 and ${maxMark}.`,
    }
  }
  return { value: String(num), error: null }
}

export function questionMarksForStudentRow(
  componentId,
  studentRow,
  defaultQuestionMarks,
  componentSettings,
  numQuestions,
  label = '',
) {
  if (!isAssignmentComponent(componentId, label)) {
    return defaultQuestionMarks
  }
  const cfg = questionConfigForAssignmentStudent(
    { component_settings: componentSettings, num_questions: numQuestions },
    componentId,
    studentRow,
  )
  const n = levelQuestionCount(cfg) || numQuestions
  const padded = padLevelQuestionConfig(cfg, numQuestions)
  return padded.question_marks
}

export function questionCountForStudentRow(
  componentId,
  studentRow,
  defaultCount,
  componentSettings,
  label = '',
) {
  if (!isAssignmentComponent(componentId, label)) return defaultCount
  const cfg = questionConfigForAssignmentStudent(
    { component_settings: componentSettings },
    componentId,
    studentRow,
  )
  return levelQuestionCount(cfg) || defaultCount
}

export function validateAllMarks(
  rows,
  components,
  numQuestions,
  questionMarks,
  { componentSettings = {}, assessmentLabels = {} } = {},
) {
  for (let r = 0; r < rows.length; r++) {
    for (const aid of components) {
      const label = assessmentLabels[aid] || aid
      const marks = rows[r].assessment_marks?.[aid] || []
      const rowMarks = questionMarksForStudentRow(
        aid,
        rows[r],
        questionMarks,
        componentSettings,
        numQuestions,
        label,
      )
      const qCount = questionCountForStudentRow(
        aid,
        rows[r],
        numQuestions,
        componentSettings,
        label,
      )
      for (let q = 0; q < qCount; q++) {
        const max = maxMarkForQuestion(rowMarks, q)
        const { error } = validateMarkInput(marks[q], max)
        if (error) {
          return `Row ${r + 1}, ${label}: Q${q + 1} — ${error}`
        }
      }
    }
  }
  return null
}

export function validateAssignmentStudentLevels(
  rows,
  assignmentIds,
  { requireWhenMarks = true } = {},
) {
  for (let r = 0; r < rows.length; r++) {
    for (const cid of assignmentIds) {
      const marks = rows[r].assessment_marks?.[cid] || []
      const hasMarks = marks.some((m) => m !== '' && m != null && String(m).trim() !== '')
      const level = (rows[r].assignment_levels?.[cid] || '').toLowerCase()
      if (hasMarks && requireWhenMarks && !['higher', 'middle', 'lower'].includes(level)) {
        return `Row ${r + 1}: select Higher, Middle, or Lower for the assignment before entering marks.`
      }
    }
  }
  return null
}

function isEmptyMark(raw) {
  return raw === '' || raw === null || raw === undefined || String(raw).trim() === ''
}

function studentLabel(row, rowIndex) {
  const name = String(row?.student_name || '').trim()
  const reg = String(row?.register_number || '').trim()
  if (name && reg) return `${name} (${reg})`
  if (name) return name
  if (reg) return reg
  return `Row ${rowIndex + 1}`
}

/**
 * Validate marks before CO Attainment Report.
 * - errors: mark exceeds column max or invalid number (blocks report)
 * - warnings: empty cells (user may continue with confirmation)
 */
export function validateMarksForCoReport(
  rows,
  components,
  numQuestions,
  questionMarks,
  { assessmentLabels = {}, componentSettings = {} } = {},
) {
  const errors = []
  const warnings = []

  for (let r = 0; r < rows.length; r++) {
    const student = studentLabel(rows[r], r)

    for (const aid of components) {
      const compLabel = assessmentLabels[aid] || aid
      const marks = rows[r].assessment_marks?.[aid] || []
      const rowMarks = questionMarksForStudentRow(
        aid,
        rows[r],
        questionMarks,
        componentSettings,
        numQuestions,
        compLabel,
      )
      const qCount = questionCountForStudentRow(
        aid,
        rows[r],
        numQuestions,
        componentSettings,
        compLabel,
      )

      for (let q = 0; q < qCount; q++) {
        const max = maxMarkForQuestion(rowMarks, q)
        const raw = marks[q]

        if (isEmptyMark(raw)) {
          warnings.push(
            `${student} · ${compLabel} · Q${q + 1}: no mark entered (allowed range 0–${max}).`,
          )
          continue
        }

        const { error } = validateMarkInput(raw, max)
        if (error) {
          errors.push(`${student} · ${compLabel} · Q${q + 1}: ${error}`)
        }
      }
    }
  }

  return { errors, warnings, valid: errors.length === 0 }
}

export function validateLegacyMarksForCoReport(rows, numQuestions, questionMarks) {
  const errors = []
  const warnings = []

  for (let r = 0; r < rows.length; r++) {
    const student = studentLabel(rows[r], r)
    const marks = rows[r].marks || []

    for (let q = 0; q < numQuestions; q++) {
      const max = maxMarkForQuestion(questionMarks, q)
      const raw = marks[q]

      if (isEmptyMark(raw)) {
        warnings.push(`${student} · Q${q + 1}: no mark entered (allowed range 0–${max}).`)
        continue
      }

      const { error } = validateMarkInput(raw, max)
      if (error) {
        errors.push(`${student} · Q${q + 1}: ${error}`)
      }
    }
  }

  return { errors, warnings, valid: errors.length === 0 }
}
