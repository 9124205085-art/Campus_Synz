export const ASSIGNMENT_LEVELS = ['higher', 'middle', 'lower']

export const ASSIGNMENT_LEVEL_LABELS = {
  higher: 'Higher',
  middle: 'Middle',
  lower: 'Lower',
}

export const DEFAULT_LEVEL_THRESHOLDS = { lower_max: 50, middle_max: 75 }

export function isAssignmentComponent(componentId, label = '') {
  const cid = String(componentId || '').toLowerCase()
  const name = String(label || '').toLowerCase()
  return name.includes('assignment') || cid.includes('assignment')
}

export function levelQuestionCount(levelCfg) {
  if (!levelCfg) return 0
  if (levelCfg.num_questions) return Number(levelCfg.num_questions) || 0
  return levelCfg.question_cos?.length || 0
}

export function maxQuestionsAcrossLevels(levels = {}) {
  return Math.max(
    1,
    ...ASSIGNMENT_LEVELS.map((level) => levelQuestionCount(levels[level])),
  )
}

export function defaultAssignmentLevelQuestions(numQuestions, coOptions = ['CO1'], markOptions = ['2']) {
  const n = Math.max(1, numQuestions || 5)
  return Array.from({ length: n }, () => ({
    co: coOptions[0] || 'CO1',
    marks: markOptions[0] || '2',
  }))
}

export function buildDefaultAssignmentLevels(numQuestions, coOptions, markOptions) {
  const n = Math.max(1, numQuestions || 5)
  const questions = defaultAssignmentLevelQuestions(n, coOptions, markOptions)
  return Object.fromEntries(
    ASSIGNMENT_LEVELS.map((level) => [
      level,
      {
        num_questions: n,
        question_cos: questions.map((q) => q.co),
        question_marks: questions.map((q) => q.marks),
      },
    ]),
  )
}

export function buildDefaultAssignmentComponentConfig(numQuestions, coOptions, markOptions) {
  return {
    kind: 'assignment',
    reference_components: [],
    level_thresholds: { ...DEFAULT_LEVEL_THRESHOLDS },
    levels: buildDefaultAssignmentLevels(numQuestions, coOptions, markOptions),
  }
}

export function getAssignmentLevelConfig(marksheet, componentId, level) {
  const settings = marksheet?.component_settings?.[componentId]
  const cfg = settings?.levels?.[level]
  if (!cfg) return null
  const n = levelQuestionCount(cfg)
  return {
    num_questions: n,
    question_cos: (cfg.question_cos || []).slice(0, n),
    question_marks: (cfg.question_marks || []).slice(0, n),
  }
}

/** Question CO/marks for a student on an assignment component (uses their assigned level). */
export function questionConfigForAssignmentStudent(marksheet, componentId, studentRow) {
  const level = studentRow?.assignment_levels?.[componentId]
  const levelCfg = level ? getAssignmentLevelConfig(marksheet, componentId, level) : null
  if (levelCfg?.question_cos?.length) {
    return levelCfg
  }
  const fallbackN = marksheet?.num_questions || 0
  return {
    num_questions: fallbackN,
    question_cos: marksheet?.question_cos || [],
    question_marks: marksheet?.question_marks || [],
  }
}

export function assignmentComponents(marksheet) {
  const ids = marksheet?.assessment_components || []
  const labelMap = marksheet?.assessment_label_map || {}
  const labels = marksheet?.assessment_labels || []
  return ids.filter((id, idx) =>
    isAssignmentComponent(id, labelMap[id] || labels[idx] || id),
  )
}

export function questionsFromLevelConfig(levelConfig) {
  const n = levelQuestionCount(levelConfig)
  const cos = levelConfig?.question_cos || []
  const marks = levelConfig?.question_marks || []
  return Array.from({ length: n }, (_, i) => ({
    co: cos[i] || 'CO1',
    marks: marks[i] || '2',
  }))
}

export function levelConfigFromQuestions(questions, numQuestions) {
  const n = numQuestions ?? questions.length
  const qs = questions.slice(0, n)
  while (qs.length < n) {
    qs.push({ co: 'CO1', marks: '2' })
  }
  return {
    num_questions: n,
    question_cos: qs.map((q) => q.co),
    question_marks: qs.map((q) => q.marks),
  }
}

/** Pad level CO/marks to grid column count without losing per-level values. */
export function padLevelQuestionConfig(levelCfg, columnCount) {
  const n = levelQuestionCount(levelCfg)
  const cos = levelCfg?.question_cos || []
  const marks = levelCfg?.question_marks || []
  const cols = Math.max(columnCount || 0, n)
  return {
    num_questions: n,
    question_cos: Array.from({ length: cols }, (_, i) => (i < n ? cos[i] || 'CO1' : '')),
    question_marks: Array.from({ length: cols }, (_, i) =>
      i < n ? String(marks[i] ?? '2') : '0',
    ),
  }
}

export function levelFromPercentage(pct, thresholds = DEFAULT_LEVEL_THRESHOLDS) {
  if (pct == null || Number.isNaN(pct)) return null
  const lowerMax = thresholds.lower_max ?? 50
  const middleMax = thresholds.middle_max ?? 75
  if (pct < lowerMax) return 'lower'
  if (pct < middleMax) return 'middle'
  return 'higher'
}

function normaliseQuestionMarksArray(raw, numQ) {
  if (Array.isArray(raw) && raw.length >= numQ) return raw
  if (Array.isArray(raw)) {
    return Array.from({ length: numQ }, (_, i) => raw[i] ?? '2')
  }
  return Array.from({ length: numQ }, () => '2')
}

function normalizeReg(reg) {
  return String(reg || '').trim().toLowerCase().replace(/\s+/g, '')
}

function studentKey(row) {
  const reg = normalizeReg(row?.register_number)
  if (reg) return `reg:${reg}`
  const name = String(row?.student_name || '').trim().toLowerCase()
  return name ? `name:${name}` : ''
}

function findStudentInSheet(sheet, row) {
  const reg = normalizeReg(row?.register_number)
  const rows = sheet.student_rows || []

  if (reg) {
    const byReg = rows.find((s) => normalizeReg(s.register_number) === reg)
    if (byReg) return byReg
  }

  const name = String(row?.student_name || '').trim().toLowerCase()
  if (name) {
    return rows.find((s) => String(s.student_name || '').trim().toLowerCase() === name) || null
  }

  return null
}

function componentHasAnyMarks(marks) {
  if (!marks?.length) return false
  return marks.some((m) => m !== '' && m != null && String(m).trim() !== '')
}

function resolveReferenceMarks(refStudent, sheet, componentId) {
  let marks = refStudent?.assessment_marks?.[componentId]
  if (componentHasAnyMarks(marks)) return marks

  const components = sheet.assessment_components || []
  if (components.length === 1) {
    marks = refStudent?.assessment_marks?.[components[0]]
    if (componentHasAnyMarks(marks)) return marks
  }

  if (componentHasAnyMarks(refStudent?.marks)) {
    return refStudent.marks
  }

  return []
}

/** Percentage obtained for one component on a reference mark sheet (0–100). */
export function componentPercentageForStudent(sheet, componentId, studentRow) {
  const refStudent = findStudentInSheet(sheet, studentRow)
  if (!refStudent) return null

  const marks = resolveReferenceMarks(refStudent, sheet, componentId)
  const numQ = sheet.num_questions || marks.length || 0
  if (!numQ) return null
  const qMarks = normaliseQuestionMarksArray(sheet.question_marks, numQ)

  let obtained = 0
  let max = 0
  let hasAny = false

  for (let i = 0; i < numQ; i++) {
    const raw = marks[i]
    if (raw === '' || raw == null || String(raw).trim() === '') continue
    const maxM = parseFloat(qMarks[i]) || 0
    if (maxM <= 0) continue
    obtained += parseFloat(raw) || 0
    max += maxM
    hasAny = true
  }

  if (!hasAny || max <= 0) return null
  return Math.round((obtained / max) * 10000) / 100
}

/** Average % across selected reference components for one student. */
export function referenceAveragePercentage(studentRow, referenceComponents, refMarksheets) {
  if (!referenceComponents?.length || !refMarksheets?.length) return null

  let total = 0
  let count = 0

  for (const ref of referenceComponents) {
    const sheet = refMarksheets.find(
      (s) => Number(s.id) === Number(ref.marksheet_id),
    )
    if (!sheet) continue
    const pct = componentPercentageForStudent(sheet, ref.component_id, studentRow)
    if (pct != null) {
      total += pct
      count += 1
    }
  }

  return count ? Math.round((total / count) * 100) / 100 : null
}

/** Auto-assign Higher / Middle / Lower from reference mark sheets. Returns { rows, assignedCount }. */
export function autoAssignAssignmentLevels(rows, assignmentComponentId, componentConfig, refMarksheets) {
  const refs = componentConfig?.reference_components || []
  if (!refs.length || !refMarksheets?.length) {
    return { rows, assignedCount: 0 }
  }

  const thresholds = componentConfig.level_thresholds || DEFAULT_LEVEL_THRESHOLDS
  let assignedCount = 0

  const nextRows = rows.map((row) => {
    const pct = referenceAveragePercentage(row, refs, refMarksheets)
    const level = levelFromPercentage(pct, thresholds)
    if (!level) return row
    assignedCount += 1
    return {
      ...row,
      assignment_levels: {
        ...(row.assignment_levels || {}),
        [assignmentComponentId]: level,
      },
    }
  })

  return { rows: nextRows, assignedCount }
}

/** Saved non-assignment components from other mark sheets for the same course. */
export function availableReferenceComponents(savedMarksheets, courseCode, year, semester) {
  if (!savedMarksheets?.length || !courseCode) return []

  const refs = []
  for (const sheet of savedMarksheets) {
    if (!sheet.is_saved) continue
    if (String(sheet.course_code || '').toUpperCase() !== String(courseCode).toUpperCase()) continue
    if (String(sheet.year) !== String(year)) continue
    if (String(sheet.semester) !== String(semester)) continue

    const ids = sheet.assessment_components || []
    const labelMap = sheet.assessment_label_map || {}
    const labels = Array.isArray(sheet.assessment_labels)
      ? sheet.assessment_labels
      : Object.values(labelMap)

    ids.forEach((cid, i) => {
      const label = labelMap[cid] || labels[i] || cid
      if (isAssignmentComponent(cid, label)) return
      refs.push({
        marksheet_id: sheet.id,
        component_id: cid,
        label,
        display: `${label} (${sheet.course_code})`,
      })
    })
  }

  return refs
}

export function referenceComponentKey(ref) {
  return `${ref.marksheet_id}:${ref.component_id}`
}
