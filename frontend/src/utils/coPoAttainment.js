import * as XLSX from 'xlsx'
import {
  ASSIGNMENT_LEVEL_LABELS,
  ASSIGNMENT_LEVELS,
  isAssignmentComponent,
  levelQuestionCount,
  padLevelQuestionConfig,
  questionConfigForAssignmentStudent,
} from './assignmentLevels'

export const PO_OPTIONS = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`)

export const MAPPING_LEVEL_OPTIONS = [
  { value: 0, label: '0 — No mapping' },
  { value: 1, label: '1 — Low' },
  { value: 2, label: '2 — Medium' },
  { value: 3, label: '3 — High' },
]

const DEFAULT_CO_PO_TEMPLATES = {
  CO1: { PO1: 3, PO2: 2, PO3: 1, PO6: 1, PO7: 2 },
  CO2: { PO1: 2, PO2: 3, PO3: 2, PO4: 1, PO6: 1, PO7: 2, PO8: 1 },
  CO3: { PO1: 1, PO2: 2, PO3: 3, PO4: 2, PO5: 1, PO6: 1, PO7: 1, PO8: 2 },
  CO4: { PO2: 1, PO3: 2, PO4: 3, PO5: 2, PO6: 2, PO7: 1, PO8: 2, PO9: 1 },
  CO5: { PO1: 2, PO3: 1, PO4: 2, PO5: 3, PO6: 1, PO7: 2, PO8: 1, PO9: 1, PO10: 1 },
}

export function emptyCoPoRow() {
  return Object.fromEntries(PO_OPTIONS.map((po) => [po, 0]))
}

export function buildDefaultCoPoMapping(usedCos) {
  const mapping = {}
  for (const co of usedCos) {
    const row = emptyCoPoRow()
    const template = DEFAULT_CO_PO_TEMPLATES[co] || {}
    for (const [po, level] of Object.entries(template)) {
      row[po] = level
    }
    if (!DEFAULT_CO_PO_TEMPLATES[co]) {
      const idx = Math.max(0, usedCos.indexOf(co))
      row[`PO${Math.min(idx + 1, 12)}`] = 2
    }
    mapping[co] = row
  }
  return mapping
}

export function poLevelLabel(pct) {
  if (pct == null) return '—'
  return pct >= 60 ? 'High' : 'Low'
}

export function normaliseQuestionMarks(raw, numQ) {
  if (Array.isArray(raw) && raw.length === numQ) return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const first = Object.values(raw)[0]
    if (Array.isArray(first) && first.length === numQ) return first
  }
  return Array.from({ length: numQ }, () => '2')
}

export function normaliseQuestionCos(raw, numQ) {
  if (Array.isArray(raw) && raw.length === numQ) return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const first = Object.values(raw)[0]
    if (Array.isArray(first) && first.length === numQ) return first
  }
  return Array.from({ length: numQ }, () => 'CO1')
}

export function studentIdentityKey(row) {
  const reg = String(row?.register_number || '').trim().toLowerCase()
  const name = String(row?.student_name || '').trim().toLowerCase()
  return `${reg}|${name}`
}

export function componentHasMarks(marks) {
  if (!marks?.length) return false
  return marks.some((m) => m !== '' && m != null && String(m).trim() !== '')
}

export function assessmentLabelFor(marksheet, componentId) {
  const labelMap = marksheet?.assessment_label_map
  if (labelMap && labelMap[componentId]) return labelMap[componentId]
  const components = marksheet?.assessment_components || []
  const idx = components.indexOf(componentId)
  if (idx >= 0 && marksheet?.assessment_labels?.[idx]) return marksheet.assessment_labels[idx]
  return componentId.replace(/^custom_/, '').replace(/_/g, ' ')
}

/** Human-readable component list for mark sheet list items and dashboard rows. */
export function formatSheetComponentsDisplay(sheet) {
  if (sheet?.components_display && sheet.components_display !== '—') {
    return sheet.components_display
  }
  if (sheet?.component_labels?.length) {
    return sheet.component_labels.join(', ')
  }
  const ids = sheet?.assessment_components || []
  if (!ids.length) return '—'
  return ids.map((id) => assessmentLabelFor(sheet, id)).join(', ')
}

export function componentHasAnyMarks(marksheet, componentId) {
  for (const row of marksheet?.student_rows || []) {
    if (componentHasMarks(row.assessment_marks?.[componentId])) return true
  }
  return false
}

/** All assessment components on a mark sheet (configured + any with saved marks). */
export function discoverMarksheetComponents(marksheet) {
  const ids = []
  const seen = new Set()
  const add = (id) => {
    const cid = String(id || '').trim()
    if (!cid || seen.has(cid)) return
    seen.add(cid)
    ids.push(cid)
  }

  for (const id of marksheet?.assessment_components || []) add(id)

  const labelMap = marksheet?.assessment_label_map || {}
  for (const id of Object.keys(labelMap)) add(id)

  for (const row of marksheet?.student_rows || []) {
    for (const id of Object.keys(row.assessment_marks || {})) add(id)
  }

  return ids
}

/** True when a mark sheet matches an HOD course assignment row for this faculty. */
export function sheetMatchesHodAssignment(sheet, assignment) {
  if (!sheet || !assignment) return false
  return (
    String(assignment.course_code || '').toUpperCase()
      === String(sheet.course_code || '').toUpperCase()
    && String(assignment.year ?? '') === String(sheet.year ?? '')
    && String(assignment.semester ?? '') === String(sheet.semester ?? '')
  )
}

/** Keep only mark sheets for courses assigned to this faculty member. */
export function filterMarksheetsToAssigned(sheets, assignedCourses = []) {
  if (!assignedCourses?.length) return sheets || []
  return (sheets || []).filter((sheet) =>
    assignedCourses.some((course) => sheetMatchesHodAssignment(sheet, course)),
  )
}

/** Group mark sheets for the same course (code + year + semester + regulation). */
export function courseGroupKey(sheet) {
  return [
    sheet?.course_code || '',
    sheet?.year ?? '',
    sheet?.semester ?? '',
    sheet?.regulation || '',
  ].join('|')
}

export function groupSheetsByCourse(sheets) {
  const map = new Map()
  for (const sheet of sheets || []) {
    const key = courseGroupKey(sheet)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(sheet)
  }
  return map
}

/** Merge mark sheets for one course so CA1/CA2 from separate sheets combine by register number. */
export function mergeCourseMarksheets(sheets) {
  if (!sheets?.length) return null

  const labelMap = {}
  const allComponents = []
  const seenComp = new Set()

  for (const sheet of sheets) {
    for (const id of sheet.assessment_components || []) {
      if (!seenComp.has(id)) {
        seenComp.add(id)
        allComponents.push(id)
      }
    }
    Object.assign(labelMap, sheet.assessment_label_map || {})
    const ids = sheet.assessment_components || []
    const labels = sheet.assessment_labels || []
    ids.forEach((id, i) => {
      if (labels[i] && !labelMap[id]) labelMap[id] = labels[i]
    })
  }

  const primary = sheets.reduce(
    (best, s) => ((s.num_questions || 0) >= (best.num_questions || 0) ? s : best),
    sheets[0],
  )

  const mergedCoPo = sheets.find(
    (s) => s.co_po_mapping && Object.keys(s.co_po_mapping).length,
  )?.co_po_mapping

  const component_settings = {}
  for (const sheet of sheets) {
    Object.assign(component_settings, sheet.component_settings || {})
  }

  const student_rows = mergeStudentsByRegisterNumber(
    sheets.flatMap((s) => s.student_rows || []),
  )

  const merged = {
    ...primary,
    assessment_components: allComponents,
    assessment_label_map: labelMap,
    assessment_labels: allComponents.map((id) => assessmentLabelFor(
      { assessment_components: allComponents, assessment_label_map: labelMap },
      id,
    )),
    student_rows,
    co_po_mapping: mergedCoPo || primary.co_po_mapping || {},
    component_settings,
    _sourceSheetIds: sheets.map((s) => s.id),
  }

  return merged
}

/** Components where the faculty has saved marks for at least one student. */
export function discoverCompletedComponents(marksheet) {
  return discoverMarksheetComponents(marksheet).filter((id) =>
    componentHasAnyMarks(marksheet, id),
  )
}

function dedupeStudentRows(rows, componentId) {
  const byKey = new Map()
  for (const row of rows) {
    const key = studentIdentityKey(row)
    const hasMarks = componentHasMarks(row.assessment_marks?.[componentId])
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, row)
      continue
    }
    const existingHas = componentHasMarks(existing.assessment_marks?.[componentId])
    if (hasMarks && !existingHas) byKey.set(key, row)
  }
  return Array.from(byKey.values())
}

/** Merge rows with the same register number (fallback: name+reg identity). */
export function mergeStudentsByRegisterNumber(rows) {
  const byKey = new Map()

  for (const row of rows) {
    const reg = String(row?.register_number || '').trim().toLowerCase()
    const key = reg || studentIdentityKey(row)
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, {
        register_number: row.register_number || '',
        student_name: row.student_name || '',
        assessment_marks: { ...(row.assessment_marks || {}) },
        assignment_levels: { ...(row.assignment_levels || {}) },
      })
      continue
    }

    if (!existing.student_name && row.student_name) {
      existing.student_name = row.student_name
    }

    for (const [aid, marks] of Object.entries(row.assessment_marks || {})) {
      const prev = existing.assessment_marks[aid]
      if (!componentHasMarks(prev) && componentHasMarks(marks)) {
        existing.assessment_marks[aid] = marks
      }
    }

    for (const [aid, level] of Object.entries(row.assignment_levels || {})) {
      if (!existing.assignment_levels[aid] && level) {
        existing.assignment_levels[aid] = level
      }
    }
  }

  return Array.from(byKey.values())
}

function buildStudentCoPoFromComponents(
  row,
  componentIds,
  usedCOs,
  questionCos,
  questionMarks,
  numQ,
  threshold,
  mapping,
) {
  let hasAnyMarks = false

  const questionMarksPerStudent = Array.from({ length: numQ }, (_, i) => {
    let sum = 0
    let found = false
    for (const aid of componentIds) {
      const marks = row.assessment_marks?.[aid]
      if (!marks) continue
      const val = marks[i]
      if (val !== '' && val != null && String(val).trim() !== '') {
        sum += parseFloat(val) || 0
        found = true
      }
    }
    if (found) {
      hasAnyMarks = true
      return Math.round(sum * 100) / 100
    }
    return null
  })

  const cos = {}
  for (const co of usedCOs) {
    const qIndices = questionCos
      .map((c, i) => (c === co ? i : -1))
      .filter((i) => i >= 0)

    if (!qIndices.length) continue

    let marksObtained = 0
    let maxMark = 0
    let hasCoMarks = false

    for (const aid of componentIds) {
      const marks = row.assessment_marks?.[aid]
      if (!componentHasMarks(marks)) continue

      const compMax = qIndices.reduce(
        (sum, i) => sum + (parseFloat(questionMarks[i]) || 0),
        0,
      )
      const compScore = qIndices.reduce(
        (sum, i) => sum + (parseFloat(marks[i]) || 0),
        0,
      )
      marksObtained += compScore
      maxMark += compMax
      hasCoMarks = true
    }

    const pct =
      hasCoMarks && maxMark > 0
        ? Math.round((marksObtained / maxMark) * 10000) / 100
        : null
    const passScore = maxMark > 0 ? (threshold / 100) * maxMark : 0

    cos[co] = {
      marksObtained: hasCoMarks ? Math.round(marksObtained * 100) / 100 : null,
      maxMark: hasCoMarks ? maxMark : null,
      pct,
      attained: hasCoMarks ? marksObtained >= passScore : null,
    }
  }

  const poData = hasAnyMarks
    ? calculateStudentPOs(cos, mapping, usedCOs)
    : { pos: {}, overallPoPct: null, poLevel: '—' }

  return {
    register_number: row.register_number || '',
    student_name: row.student_name || '',
    studentKey: studentRegKey(row),
    questionMarks: questionMarksPerStudent,
    cos,
    hasMarks: hasAnyMarks,
    ...poData,
  }
}

function studentRegKey(row) {
  const reg = String(row?.register_number || '').trim().toLowerCase()
  if (reg) return `reg:${reg}`
  return studentIdentityKey(row)
}

/** Single key for merging students across CA1, CA2, and overall. */
export function consolidatedStudentKey(row) {
  return studentRegKey(row)
}

/** Per-student CO and PO for a single assessment component (CA1, CA2, etc.). */
export function calculateComponentAttainment(marksheet, componentId, threshold, coPoMapping) {
  if (!marksheet || !componentId) return null

  const numQ = marksheet.num_questions || 0
  const questionCos = normaliseQuestionCos(marksheet.question_cos, numQ)
  const questionMarks = normaliseQuestionMarks(marksheet.question_marks, numQ)
  const labelMap = marksheet.assessment_label_map || {}
  const components = marksheet.assessment_components || []
  const labelIdx = components.indexOf(componentId)
  const label =
    labelMap[componentId] ||
    marksheet.assessment_labels?.[labelIdx] ||
    componentId
  const isAssignment = isAssignmentComponent(componentId, label)

  let usedCOs
  if (isAssignment) {
    const allCos = new Set()
    for (const row of marksheet.student_rows || []) {
      const cfg = questionConfigForAssignmentStudent(marksheet, componentId, row)
      normaliseQuestionCos(cfg.question_cos, numQ).forEach((co) => allCos.add(co))
    }
    if (!allCos.size) {
      normaliseQuestionCos(
        marksheet.component_settings?.[componentId]?.levels?.higher?.question_cos,
        numQ,
      ).forEach((co) => allCos.add(co))
    }
    usedCOs = [...allCos].sort()
  } else {
    usedCOs = [...new Set(questionCos)].sort()
  }

  const mapping =
    coPoMapping && Object.keys(coPoMapping).length
      ? coPoMapping
      : buildDefaultCoPoMapping(usedCOs)

  const rows = dedupeStudentRows(marksheet.student_rows || [], componentId)
  if (!rows.length) return null

  const studentResults = rows.map((row) => {
    const rowConfig = isAssignment
      ? questionConfigForAssignmentStudent(marksheet, componentId, row)
      : { question_cos: questionCos, question_marks: questionMarks }
    const rowNumQ = isAssignment ? levelQuestionCount(rowConfig) || numQ : numQ
    const padded = isAssignment
      ? padLevelQuestionConfig(rowConfig, numQ)
      : {
          question_cos: normaliseQuestionCos(rowConfig.question_cos, numQ),
          question_marks: normaliseQuestionMarks(rowConfig.question_marks, numQ),
        }
    const rowQuestionCos = padded.question_cos
    const rowQuestionMarks = padded.question_marks

    const marks = row.assessment_marks?.[componentId] || []
    const hasMarks = componentHasMarks(marks.slice(0, rowNumQ))

    const questionMarksPerStudent = Array.from({ length: numQ }, (_, i) => {
      if (!hasMarks || i >= rowNumQ) return null
      const val = marks[i]
      if (val === '' || val == null || String(val).trim() === '') return null
      return Math.round((parseFloat(val) || 0) * 100) / 100
    })

    const cos = {}
    for (const co of usedCOs) {
      const qIndices = rowQuestionCos
        .map((c, i) => (c === co && i < rowNumQ ? i : -1))
        .filter((i) => i >= 0)

      if (!qIndices.length || !hasMarks) {
        cos[co] = { marksObtained: null, maxMark: null, pct: null, attained: null }
        continue
      }

      const compMax = qIndices.reduce(
        (sum, i) => sum + (parseFloat(rowQuestionMarks[i]) || 0),
        0,
      )
      const compScore = qIndices.reduce(
        (sum, i) => sum + (parseFloat(marks[i]) || 0),
        0,
      )
      const pct = compMax > 0 ? Math.round((compScore / compMax) * 10000) / 100 : 0
      const passScore = (threshold / 100) * compMax

      cos[co] = {
        marksObtained: Math.round(compScore * 100) / 100,
        maxMark: compMax,
        pct,
        attained: compScore >= passScore,
      }
    }

    const poData = calculateStudentPOs(cos, mapping, usedCOs)

    return {
      register_number: row.register_number || '',
      student_name: row.student_name || '',
      studentKey: consolidatedStudentKey(row),
      questionMarks: questionMarksPerStudent,
      cos,
      hasMarks,
      assignmentLevel: isAssignment ? row.assignment_levels?.[componentId] : null,
      assignmentLevelLabel: isAssignment
        ? ASSIGNMENT_LEVEL_LABELS[row.assignment_levels?.[componentId]] || null
        : null,
      ...poData,
    }
  })

  const withMarks = studentResults.filter((s) => s.hasMarks)
  if (!withMarks.length) return null

  const classAverages = computeClassAverages(withMarks, { usedCOs, numQuestions: numQ })

  return {
    usedCOs,
    studentResults,
    questionCos,
    questionMaxMarks: questionMarks,
    numQuestions: numQ,
    threshold,
    componentId,
    componentIds: [componentId],
    isCombined: false,
    coPoMapping: mapping,
    classAverages,
    studentsWithMarks: withMarks.length,
    totalStudents: studentResults.length,
  }
}

/**
 * CO/PO across one or more assessment components.
 * Students with the same register number are merged; marks from each selected
 * component contribute to overall CO and PO.
 */
export function calculateMultiComponentAttainment(
  marksheet,
  componentIds,
  threshold,
  coPoMapping,
) {
  const ids = (componentIds || []).filter(Boolean)
  if (!marksheet || !ids.length) return null
  if (ids.length === 1) return calculateComponentAttainment(marksheet, ids[0], threshold, coPoMapping)

  const numQ = marksheet.num_questions || 0
  const questionCos = normaliseQuestionCos(marksheet.question_cos, numQ)
  const questionMarks = normaliseQuestionMarks(marksheet.question_marks, numQ)
  const usedCOs = [...new Set(questionCos)].sort()
  const mapping =
    coPoMapping && Object.keys(coPoMapping).length
      ? coPoMapping
      : buildDefaultCoPoMapping(usedCOs)

  const rows = mergeStudentsByRegisterNumber(marksheet.student_rows || [])
  if (!rows.length) return null

  const combinedQuestionMaxMarks = questionMarks.map(
    (m) => Math.round((parseFloat(m) || 0) * ids.length * 100) / 100,
  )

  const studentResults = rows.map((row) =>
    buildStudentCoPoFromComponents(
      row,
      ids,
      usedCOs,
      questionCos,
      questionMarks,
      numQ,
      threshold,
      mapping,
    ),
  )

  const withMarks = studentResults.filter((s) => s.hasMarks)
  if (!withMarks.length) return null

  const classAverages = computeClassAverages(withMarks, { usedCOs, numQuestions: numQ })

  return {
    usedCOs,
    studentResults,
    questionCos,
    questionMaxMarks: combinedQuestionMaxMarks,
    perComponentMaxMarks: questionMarks,
    numQuestions: numQ,
    threshold,
    componentIds: ids,
    isCombined: true,
    coPoMapping: mapping,
    classAverages,
    studentsWithMarks: withMarks.length,
    totalStudents: studentResults.length,
  }
}

/** Excel-style report: per-component CO/PO columns + overall when multiple selected. */
export function buildConsolidatedComponentReport(
  marksheet,
  componentIds,
  threshold,
  coPoMapping,
) {
  const ids = (componentIds || []).filter(Boolean)
  if (!marksheet || !ids.length) return null

  const perComponent = {}
  for (const id of ids) {
    perComponent[id] = calculateComponentAttainment(marksheet, id, threshold, coPoMapping)
  }

  const overall =
    ids.length >= 2
      ? calculateMultiComponentAttainment(marksheet, ids, threshold, coPoMapping)
      : null

  const numQ = marksheet.num_questions || 0
  const questionCos = normaliseQuestionCos(marksheet.question_cos, numQ)
  const questionMaxMarks = normaliseQuestionMarks(marksheet.question_marks, numQ)
  const usedCOs =
    overall?.usedCOs ||
    perComponent[ids[0]]?.usedCOs ||
    [...new Set(questionCos)].sort()

  const studentMap = new Map()

  const ensureStudent = (s) => {
    const key =
      consolidatedStudentKey(s) ||
      s.studentKey ||
      studentIdentityKey(s)
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        register_number: s.register_number || '',
        student_name: s.student_name || '',
        studentKey: key,
        byComponent: {},
        overall: null,
      })
    }
    return studentMap.get(key)
  }

  for (const id of ids) {
    const res = perComponent[id]
    if (!res) continue
    for (const s of res.studentResults) {
      const row = ensureStudent(s)
      row.byComponent[id] = {
        questionMarks: s.questionMarks,
        cos: s.cos,
        pos: s.pos,
        overallPoPct: s.overallPoPct,
        poLevel: s.poLevel,
        hasMarks: s.hasMarks,
      }
    }
  }

  if (overall) {
    for (const s of overall.studentResults) {
      const row = ensureStudent(s)
      row.overall = {
        questionMarks: s.questionMarks,
        cos: s.cos,
        pos: s.pos,
        overallPoPct: s.overallPoPct,
        poLevel: s.poLevel,
        hasMarks: s.hasMarks,
      }
    }
  }

  for (const row of mergeStudentsByRegisterNumber(marksheet.student_rows || [])) {
    ensureStudent({
      register_number: row.register_number,
      student_name: row.student_name,
      studentKey: studentRegKey(row),
    })
  }

  const studentRows = Array.from(studentMap.values()).sort((a, b) =>
    String(a.register_number || a.student_name).localeCompare(
      String(b.register_number || b.student_name),
    ),
  )

  const hasAnyData =
    ids.some((id) => perComponent[id]?.studentsWithMarks > 0) ||
    (overall?.studentsWithMarks ?? 0) > 0
  if (!hasAnyData) return null

  return {
    componentIds: ids,
    componentMeta: ids.map((id) => {
      const result = perComponent[id]
      let headerQuestionCos = result?.questionCos || questionCos
      const label = assessmentLabelFor(marksheet, id)
      if (isAssignmentComponent(id, label)) {
        const higherCos =
          marksheet.component_settings?.[id]?.levels?.higher?.question_cos
        if (higherCos?.length) {
          headerQuestionCos = normaliseQuestionCos(higherCos, numQ)
        }
      }
      return {
        id,
        label,
        result,
        questionCos: normaliseQuestionCos(headerQuestionCos, numQ),
      }
    }),
    overall,
    showOverall: ids.length >= 2,
    studentRows,
    usedCOs,
    numQuestions: numQ,
    questionCos,
    questionMaxMarks,
    threshold,
    studentsWithMarks: overall?.studentsWithMarks ?? perComponent[ids[0]]?.studentsWithMarks ?? 0,
    classAverages: {
      byComponent: Object.fromEntries(
        ids.map((id) => [id, perComponent[id]?.classAverages || null]),
      ),
      overall: overall?.classAverages || null,
    },
  }
}

export function calculateStudentPOs(studentCos, coPoMapping, usedCOs) {
  const pos = {}
  for (const po of PO_OPTIONS) {
    let weightedSum = 0
    let weightTotal = 0
    for (const co of usedCOs) {
      const weight = coPoMapping[co]?.[po] ?? 0
      const coPct = studentCos[co]?.pct
      if (weight > 0 && coPct != null) {
        weightedSum += coPct * weight
        weightTotal += weight
      }
    }
    pos[po] = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : null
  }

  const poPcts = Object.values(pos).filter((p) => p != null)
  const overallPoPct = poPcts.length
    ? Math.round((poPcts.reduce((s, p) => s + p, 0) / poPcts.length) * 100) / 100
    : null

  return {
    pos,
    overallPoPct,
    poLevel: poLevelLabel(overallPoPct),
  }
}

export function enrichResultWithPO(result, coPoMapping) {
  if (!result) return result
  const studentResults = (result.studentResults || []).map((student) => {
    const poData = calculateStudentPOs(student.cos, coPoMapping, result.usedCOs)
    return { ...student, ...poData }
  })

  const classAverages = computeClassAverages(studentResults, result)

  return {
    ...result,
    studentResults,
    coPoMapping,
    classAverages,
  }
}

function avg(nums) {
  const valid = nums.filter((n) => n != null && !Number.isNaN(n))
  if (!valid.length) return null
  return Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 100) / 100
}

export function computeClassAverages(studentResults, result) {
  const usedCOs = result.usedCOs || []
  const numQ = result.numQuestions || 0

  const questionAvgs = Array.from({ length: numQ }, (_, qi) =>
    avg(studentResults.map((s) => s.questionMarks?.[qi])),
  )

  const coMarksAvgs = {}
  const coPctAvgs = {}
  for (const co of usedCOs) {
    coMarksAvgs[co] = avg(studentResults.map((s) => s.cos[co]?.marksObtained))
    coPctAvgs[co] = avg(studentResults.map((s) => s.cos[co]?.pct))
  }

  const poAvgs = {}
  for (const po of PO_OPTIONS) {
    poAvgs[po] = avg(studentResults.map((s) => s.pos?.[po]))
  }

  const overallPoPct = avg(studentResults.map((s) => s.overallPoPct))

  return {
    questionAvgs,
    totalObtained: avg(
      studentResults.map((s) =>
        (s.questionMarks || []).reduce((sum, m) => sum + (parseFloat(m) || 0), 0),
      ),
    ),
    coMarksAvgs,
    coPctAvgs,
    poAvgs,
    overallPoPct,
    poLevel: poLevelLabel(overallPoPct),
  }
}

export function exportConsolidatedAttainmentExcel(marksheet, result) {
  const wb = XLSX.utils.book_new()
  const usedCOs = result.usedCOs || []
  const numQ = result.numQuestions || 0
  const questionMaxMarks = result.questionMaxMarks || []
  const coMaxMarks = {}
  for (const co of usedCOs) {
    let max = 0
    for (let i = 0; i < numQ; i++) {
      if (result.questionCos?.[i] === co) {
        max += parseFloat(questionMaxMarks[i]) || 0
      }
    }
    coMaxMarks[co] = max
  }

  const metaRows = [
    ['Course Code', marksheet.course_code],
    ['Course Name', marksheet.course_name],
    ['Department', marksheet.department],
    ['Regulation', marksheet.regulation],
    ['Year / Semester', `Year ${marksheet.year} / Sem ${marksheet.semester}`],
    ['Passing Threshold', `${result.threshold}%`],
    [],
  ]

  const headerRow1 = [
    'A. STUDENT DETAILS',
    '',
    '',
    'B. QUESTION MARKS',
    ...Array(Math.max(numQ - 1, 0)).fill(''),
    '',
    '',
    'C. CO ATTAINMENT',
    ...Array(usedCOs.length * 2 - 1).fill(''),
    'D. PO ATTAINMENT (per student)',
    ...Array(PO_OPTIONS.length - 1).fill(''),
    'E. OVERALL SUMMARY',
    '',
  ]

  const headerRow2 = [
    'S.No.',
    'Reg. No.',
    'Student Name',
    ...Array.from({ length: numQ }, (_, i) => `Q${i + 1} (Max: ${questionMaxMarks[i]})`),
    'Total Obtained',
    'Total Max',
    ...usedCOs.flatMap((co) => [`${co} Marks (Max: ${coMaxMarks[co]})`, `${co} %`]),
    ...PO_OPTIONS.map((po) => `${po} %`),
    'Overall PO %',
    'PO Level',
  ]

  const dataRows = (result.studentResults || []).map((student, idx) => {
    const qMarks = student.questionMarks || []
    const totalObtained = qMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0)
    const totalMax = questionMaxMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0)
    const row = [
      idx + 1,
      student.register_number || '',
      student.student_name || '',
      ...qMarks.map((m) => (m != null ? m : '')),
      totalObtained,
      totalMax,
    ]
    for (const co of usedCOs) {
      const d = student.cos[co]
      row.push(d?.marksObtained ?? '', d?.pct != null ? d.pct : '')
    }
    for (const po of PO_OPTIONS) {
      row.push(student.pos?.[po] != null ? student.pos[po] : '')
    }
    row.push(student.overallPoPct ?? '', student.poLevel ?? '')
    return row
  })

  const avg = result.classAverages
  const avgRow = [
    '',
    '',
    'CLASS AVERAGE (%)',
    ...(avg?.questionAvgs || []).map((v) => (v != null ? v : '')),
    avg?.totalObtained ?? '',
    questionMaxMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0),
    ...usedCOs.flatMap((co) => [avg?.coMarksAvgs?.[co] ?? '', avg?.coPctAvgs?.[co] ?? '']),
    ...PO_OPTIONS.map((po) => avg?.poAvgs?.[po] ?? ''),
    avg?.overallPoPct ?? '',
    avg?.poLevel ?? '',
  ]

  const mappingHeader = ['CO–PO MAPPING (3=High, 2=Medium, 1=Low, 0=No mapping)']
  const mappingCols = ['CO', ...PO_OPTIONS]
  const mappingRows = usedCOs.map((co) => [
    co,
    ...PO_OPTIONS.map((po) => result.coPoMapping?.[co]?.[po] ?? 0),
  ])

  const sheetData = [
    ...metaRows,
    headerRow1,
    headerRow2,
    ...dataRows,
    avgRow,
    [],
    mappingHeader,
    mappingCols,
    ...mappingRows,
  ]

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sheetData),
    'Student Performance',
  )

  XLSX.writeFile(
    wb,
    `CO_PO_Attainment_${marksheet.course_code}_${marksheet.regulation}.xlsx`,
  )
}

function excelCellsForComponentBlock(data, usedCOs, numQuestions) {
  const qMarks = data?.questionMarks || []
  const totalObtained = qMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0)
  const totalMax = usedCOs.reduce(
    (s, co) => s + (parseFloat(data?.cos?.[co]?.maxMark) || 0),
    0,
  )

  const cells = [
    ...Array.from({ length: numQuestions }, (_, i) =>
      qMarks[i] != null && qMarks[i] !== '' ? qMarks[i] : '',
    ),
    data?.hasMarks ? Math.round(totalObtained * 100) / 100 : '',
    data?.hasMarks ? totalMax : '',
  ]

  for (const co of usedCOs) {
    cells.push(data?.cos?.[co]?.marksObtained ?? '')
    cells.push(data?.cos?.[co]?.pct ?? '')
  }
  for (const po of PO_OPTIONS) {
    cells.push(data?.pos?.[po] ?? '')
  }
  cells.push(data?.overallPoPct ?? '')
  cells.push(data?.poLevel ?? '')
  return cells
}

function excelCellsForAverageBlock(classAvgs, usedCOs, numQuestions) {
  if (!classAvgs) {
    const emptyLen = numQuestions + 2 + usedCOs.length * 2 + PO_OPTIONS.length + 2
    return Array(emptyLen).fill('')
  }

  const cells = [
    ...(classAvgs.questionAvgs || Array.from({ length: numQuestions }, () => null)).map((v) =>
      v != null ? v : '',
    ),
    classAvgs.totalObtained ?? '',
    '',
  ]

  for (const co of usedCOs) {
    cells.push(classAvgs.coMarksAvgs?.[co] ?? '')
    cells.push(classAvgs.coPctAvgs?.[co] ?? '')
  }
  for (const po of PO_OPTIONS) {
    cells.push(classAvgs.poAvgs?.[po] ?? '')
  }
  cells.push(classAvgs.overallPoPct ?? '')
  cells.push(classAvgs.poLevel ?? '')
  return cells
}

/** Export multi-component side-by-side report (questions, CO/PO per component + overall + averages). */
export function exportMultiComponentReportExcel(marksheet, report) {
  if (!marksheet || !report) return

  const { componentMeta, showOverall, studentRows, usedCOs, numQuestions, questionMaxMarks, classAverages } =
    report

  const metaRows = [
    ['Course Code', marksheet.course_code],
    ['Course Name', marksheet.course_name],
    ['Department', marksheet.department],
    ['Regulation', marksheet.regulation],
    ['Year / Semester', `Year ${marksheet.year} / Sem ${marksheet.semester}`],
    ['Passing Threshold', `${report.threshold}%`],
    ['Components', componentMeta.map((c) => c.label).join(', ')],
    [],
  ]

  const headerRow1 = ['Reg. No', 'Student Name']
  for (const comp of componentMeta) {
    headerRow1.push(comp.label)
    const blockSize = numQuestions + 2 + usedCOs.length * 2 + PO_OPTIONS.length + 2 - 1
    headerRow1.push(...Array(Math.max(blockSize, 0)).fill(''))
  }
  if (showOverall) {
    headerRow1.push(`Overall (${componentMeta.map((c) => c.label).join(' + ')})`)
    const blockSize = numQuestions + 2 + usedCOs.length * 2 + PO_OPTIONS.length + 2 - 1
    headerRow1.push(...Array(Math.max(blockSize, 0)).fill(''))
  }

  const questionHeaders = Array.from(
    { length: numQuestions },
    (_, i) => `Q${i + 1} (max ${questionMaxMarks[i]})`,
  )
  const coHeaders = usedCOs.flatMap((co) => [`${co} Mk`, `${co} %`])
  const poHeaders = PO_OPTIONS.map((po) => `${po} %`)
  const blockHeader = [...questionHeaders, 'Total', 'Max', ...coHeaders, ...poHeaders, 'Overall PO %', 'PO Level']

  const headerRow2 = ['', '']
  for (let i = 0; i < componentMeta.length + (showOverall ? 1 : 0); i += 1) {
    headerRow2.push(...blockHeader)
  }

  const dataRows = studentRows.map((student) => {
    const row = [student.register_number || '', student.student_name || '']
    for (const comp of componentMeta) {
      row.push(...excelCellsForComponentBlock(student.byComponent[comp.id], usedCOs, numQuestions))
    }
    if (showOverall) {
      row.push(...excelCellsForComponentBlock(student.overall, usedCOs, numQuestions))
    }
    return row
  })

  const avgRow = ['', 'Class average (%)']
  for (const comp of componentMeta) {
    avgRow.push(
      ...excelCellsForAverageBlock(classAverages?.byComponent?.[comp.id], usedCOs, numQuestions),
    )
  }
  if (showOverall) {
    avgRow.push(...excelCellsForAverageBlock(classAverages?.overall, usedCOs, numQuestions))
  }

  const sheetData = [...metaRows, headerRow1, headerRow2, ...dataRows, avgRow]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), 'CO PO by Component')
  XLSX.writeFile(
    wb,
    `CO_PO_Components_${marksheet.course_code}_Y${marksheet.year}_S${marksheet.semester}.xlsx`,
  )
}

function summarizeComponentBlock(data, usedCOs) {
  if (!data?.hasMarks) {
    return { hasMarks: false }
  }
  const qMarks = data.questionMarks || []
  const obtained = qMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0)
  const maxMark = usedCOs.reduce(
    (s, co) => s + (parseFloat(data.cos?.[co]?.maxMark) || 0),
    0,
  )
  const coSummary = {}
  const coPcts = []
  for (const co of usedCOs) {
    const pct = data.cos?.[co]?.pct ?? null
    coSummary[co] = {
      marks: data.cos?.[co]?.marksObtained ?? null,
      pct,
      attained: data.cos?.[co]?.attained ?? null,
    }
    if (pct != null) coPcts.push(pct)
  }
  const poSummary = {}
  for (const po of PO_OPTIONS) {
    poSummary[po] = data.pos?.[po] ?? null
  }
  const overallCoPct = coPcts.length
    ? Math.round((coPcts.reduce((s, p) => s + p, 0) / coPcts.length) * 100) / 100
    : maxMark > 0
      ? Math.round((obtained / maxMark) * 10000) / 100
      : null
  return {
    hasMarks: true,
    totalObtained: Math.round(obtained * 100) / 100,
    totalMax: maxMark,
    totalPct: maxMark > 0 ? Math.round((obtained / maxMark) * 10000) / 100 : null,
    overallCoPct,
    overallPoPct: data.overallPoPct ?? null,
    poLevel: data.poLevel ?? null,
    coSummary,
    poSummary,
  }
}

const ASSESSMENT_PRESET_MATCHERS = {
  ca1: [
    /^ca\s*[-_]?\s*1$/i,
    /^continuous_assessment_1$/i,
    /continuous assessment\s*[-–]?\s*1/i,
  ],
  ca2: [
    /^ca\s*[-_]?\s*2$/i,
    /^continuous_assessment_2$/i,
    /continuous assessment\s*[-–]?\s*2/i,
  ],
}

/** Resolve CA1 / CA2 (etc.) to the mark sheet component id. */
export function resolvePresetComponent(marksheet, presetKey) {
  if (!marksheet || !presetKey) return null
  const matchers = ASSESSMENT_PRESET_MATCHERS[presetKey]
  if (!matchers) return null

  for (const id of discoverMarksheetComponents(marksheet)) {
    const normId = String(id).trim().toLowerCase().replace(/\s+/g, '_')
    if (normId === presetKey) return id
    const label = assessmentLabelFor(marksheet, id)
    if (matchers.some((re) => re.test(normId) || re.test(label))) return id
  }
  return null
}

/** Build one CO/PO table section for a single component. */
function buildComponentCoPoTableSection(marksheet, componentId, threshold, coPoMapping) {
  const result = calculateComponentAttainment(marksheet, componentId, threshold, coPoMapping)
  if (!result?.studentsWithMarks) return null

  const componentLabel = assessmentLabelFor(marksheet, componentId)
  const rows = result.studentResults
    .filter((s) => s.hasMarks)
    .map((s) => {
      const summary = summarizeComponentBlock(s, result.usedCOs)
      return {
        register_number: s.register_number || '—',
        student_name: s.student_name || '—',
        coPct: summary.overallCoPct,
        poPct: summary.overallPoPct,
      }
    })
    .sort((a, b) =>
      String(a.register_number).localeCompare(String(b.register_number), undefined, {
        numeric: true,
      }),
    )

  const rowsHtml = rows
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.register_number)}</td>
        <td>${escapeHtml(s.student_name)}</td>
        <td>${escapeHtml(s.coPct != null ? `${s.coPct}%` : '—')}</td>
        <td>${escapeHtml(s.poPct != null ? `${s.poPct}%` : '—')}</td>
      </tr>`,
    )
    .join('')

  return `
  <section class="component-section">
    <h2>${escapeHtml(componentLabel)}</h2>
    <table>
      <thead>
        <tr>
          <th rowspan="2">Reg. No</th>
          <th rowspan="2">Student Name</th>
          <th colspan="2" class="course-head">
            <span class="course-code">${escapeHtml(marksheet.course_code || '')}</span>
            <span class="course-name">${escapeHtml(marksheet.course_name || '')}</span>
          </th>
        </tr>
        <tr>
          <th>CO %</th>
          <th>PO %</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </section>`
}

/** Simple CO % / PO % PDF for one or more assessments with completed marks. */
export function exportComponentCoPoPdf(marksheet, componentIds, threshold = 60, coPoMapping) {
  const ids = (componentIds || []).filter(Boolean)
  if (!marksheet || !ids.length) return false

  const sections = ids
    .map((id) => buildComponentCoPoTableSection(marksheet, id, threshold, coPoMapping))
    .filter(Boolean)
  if (!sections.length) return false

  const titleLabels = ids.map((id) => assessmentLabelFor(marksheet, id)).join(', ')
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(marksheet.course_code)} — CO/PO</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #1e293b; }
    h1 { font-size: 13px; font-weight: normal; margin: 0 0 16px; color: #475569; }
    h2 { font-size: 12px; font-weight: 600; margin: 0 0 8px; color: #1e3a5f; }
    .component-section { margin-bottom: 28px; page-break-inside: avoid; }
    .component-section + .component-section { page-break-before: auto; }
    table { border-collapse: collapse; width: 100%; max-width: 720px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; }
    th { background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 600; }
    .course-head { background: #e2e8f0; font-size: 12px; line-height: 1.35; }
    .course-code { font-weight: 700; display: block; }
    .course-name { font-weight: 400; font-size: 10px; color: #64748b; display: block; }
    tr:nth-child(even) td { background: #f8fafc; }
    td:nth-child(1), td:nth-child(2) { text-align: left; }
    @media print { body { margin: 12px; } .component-section { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(marksheet.course_code)} — ${escapeHtml(marksheet.course_name || '')} · Year ${marksheet.year ?? '—'} · Sem ${marksheet.semester ?? '—'}<br />
  <span style="font-size:11px">${escapeHtml(titleLabels)}</span></h1>
  ${sections.join('')}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    return false
  }
  win.onload = () => URL.revokeObjectURL(url)
  return true
}

/** @deprecated Use exportComponentCoPoPdf */
export function exportSingleComponentCoPoPdf(marksheet, componentId, threshold = 60, coPoMapping) {
  return exportComponentCoPoPdf(marksheet, [componentId], threshold, coPoMapping)
}

/** Per-student overall summary for each selected component (for PDF / HOD submit). */
export function buildComponentSummaryExport(marksheet, report) {
  if (!marksheet || !report) return null

  const { studentRows, componentMeta, usedCOs, showOverall, threshold } = report

  return {
    reportType: 'component_summary',
    threshold,
    course: {
      code: marksheet.course_code,
      name: marksheet.course_name,
      department: marksheet.department,
      regulation: marksheet.regulation,
      year: marksheet.year,
      semester: marksheet.semester,
    },
    components: componentMeta.map((c) => ({ id: c.id, label: c.label })),
    showOverall,
    usedCOs,
    studentSummaries: studentRows.map((student) => {
      const byComponent = {}
      for (const comp of componentMeta) {
        byComponent[comp.id] = {
          label: comp.label,
          ...summarizeComponentBlock(student.byComponent[comp.id], usedCOs),
        }
      }
      return {
        register_number: student.register_number || '',
        student_name: student.student_name || '',
        byComponent,
        overall: showOverall
          ? summarizeComponentBlock(student.overall, usedCOs)
          : null,
      }
    }),
    sourceSheetIds: marksheet._sourceSheetIds || [],
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function summaryBlockCellsHtml(summary, usedCOs) {
  if (!summary?.hasMarks) {
    const n = usedCOs.length + 1 + PO_OPTIONS.length + 2
    return Array.from({ length: n }, () => '<td>—</td>').join('')
  }
  const cells = []
  for (const co of usedCOs) {
    const mk = summary.coSummary?.[co]?.marks
    cells.push(`<td>${escapeHtml(mk != null ? mk : '—')}</td>`)
  }
  cells.push(`<td>${escapeHtml(summary.overallCoPct != null ? `${summary.overallCoPct}%` : '—')}</td>`)
  for (const po of PO_OPTIONS) {
    const pct = summary.poSummary?.[po]
    cells.push(`<td>${escapeHtml(pct != null ? `${pct}%` : '—')}</td>`)
  }
  cells.push(`<td>${escapeHtml(summary.overallPoPct != null ? `${summary.overallPoPct}%` : '—')}</td>`)
  cells.push(`<td>${escapeHtml(summary.poLevel || '—')}</td>`)
  return cells.join('')
}

/** Open printable summary — use browser Print → Save as PDF. */
export function exportComponentSummaryPdf(marksheet, summaryExport) {
  if (!marksheet || !summaryExport) return

  const { course, components, studentSummaries, threshold, showOverall, usedCOs } = summaryExport

  const blockHeader = (prefix = '') => {
    const coHdrs = usedCOs.map((co) => `<th>${prefix}${escapeHtml(co)} Mk</th>`).join('')
    const poHdrs = PO_OPTIONS.map((po) => `<th>${prefix}${escapeHtml(po)} %</th>`).join('')
    return `${coHdrs}<th>${prefix}CO Overall %</th>${poHdrs}<th>${prefix}PO Overall %</th><th>${prefix}PO Lvl</th>`
  }

  const rowsHtml = studentSummaries
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.register_number)}</td>
        <td>${escapeHtml(s.student_name)}</td>
        ${components.map((c) => summaryBlockCellsHtml(s.byComponent[c.id], usedCOs)).join('')}
        ${showOverall ? summaryBlockCellsHtml(s.overall, usedCOs) : ''}
      </tr>`,
    )
    .join('')

  const compGroupRow = components
    .map(
      (c) =>
        `<th colspan="${usedCOs.length + PO_OPTIONS.length + 3}">${escapeHtml(c.label)}</th>`,
    )
    .join('')
  const overallGroup = showOverall
    ? `<th colspan="${usedCOs.length + PO_OPTIONS.length + 3}">Overall</th>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CO/PO Summary — ${escapeHtml(course.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 9px; margin: 16px; color: #1e293b; }
    h1 { font-size: 14px; margin: 0 0 4px; color: #1e3a5f; }
    .meta { margin-bottom: 12px; color: #475569; font-size: 9px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: center; }
    th { background: #1e3a5f; color: #fff; font-size: 8px; }
    tr:nth-child(even) td { background: #f8fafc; }
    td:nth-child(1), td:nth-child(2) { text-align: left; }
    @media print { body { margin: 8px; } @page { size: landscape; } }
  </style>
</head>
<body>
  <h1>CO / PO Summary by Assessment Component</h1>
  <p class="meta">
    ${escapeHtml(course.code)} — ${escapeHtml(course.name)} ·
    ${escapeHtml(course.department)} · Year ${course.year} / Sem ${course.semester} ·
    Threshold ${threshold}%
  </p>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Reg. No</th>
        <th rowspan="2">Student Name</th>
        ${compGroupRow}${overallGroup}
      </tr>
      <tr>
        ${components.map(() => blockHeader()).join('')}
        ${showOverall ? blockHeader() : ''}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    return
  }
  win.onload = () => URL.revokeObjectURL(url)
}

/** Build consolidated CO/PO report from saved mark sheets (HOD / faculty views). */
export function buildCourseReportFromMarksheets(marksheets, threshold = 60) {
  const merged = mergeCourseMarksheets(marksheets)
  if (!merged) return null

  const components = discoverCompletedComponents(merged)
  if (!components.length) return null

  const numQ = merged.num_questions || 0
  const used = [...new Set(normaliseQuestionCos(merged.question_cos, numQ))].sort()
  const coPoMapping =
    merged.co_po_mapping && Object.keys(merged.co_po_mapping).length
      ? merged.co_po_mapping
      : buildDefaultCoPoMapping(used)

  const report = buildConsolidatedComponentReport(
    merged,
    components,
    threshold,
    coPoMapping,
  )
  if (!report) return null

  return {
    mergedMarksheet: merged,
    report,
    summaryExport: buildComponentSummaryExport(merged, report),
  }
}

/** Per-student overall CO/PO across all courses in a year (HOD year view). */
export function buildYearStudentOverallReport(courseReports) {
  const studentMap = new Map()

  for (const entry of courseReports || []) {
    const { course_code: courseCode, course_name: courseName, report } = entry
    if (!report?.studentRows?.length) continue

    for (const student of report.studentRows) {
      const key = `${(student.register_number || '').trim().toLowerCase()}|${(student.student_name || '').trim().toLowerCase()}`
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          register_number: student.register_number || '',
          student_name: student.student_name || '',
          byCourse: {},
          coValues: [],
          poValues: [],
        })
      }
      const row = studentMap.get(key)

      let coPct = null
      let poPct = null
      let poLevel = null

      const block =
        student.overall ||
        (report.componentIds?.length === 1
          ? student.byComponent?.[report.componentIds[0]]
          : null)

      if (block?.cos) {
        const pcts = Object.values(block.cos)
          .map((c) => c?.pct)
          .filter((v) => v != null)
        if (pcts.length) {
          coPct = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
        }
      }
      if (block?.overallPoPct != null) {
        poPct = block.overallPoPct
        poLevel = block.poLevel
      }

      row.byCourse[courseCode] = { course_name: courseName, coPct, poPct, poLevel }
      if (coPct != null) row.coValues.push(coPct)
      if (poPct != null) row.poValues.push(poPct)
    }
  }

  const courses = (courseReports || []).map((c) => ({
    code: c.course_code,
    name: c.course_name,
  }))

  const students = Array.from(studentMap.values())
    .map((s) => ({
      register_number: s.register_number,
      student_name: s.student_name,
      byCourse: s.byCourse,
      yearAvgCo: s.coValues.length
        ? Math.round((s.coValues.reduce((a, b) => a + b, 0) / s.coValues.length) * 100) / 100
        : null,
      yearAvgPo: s.poValues.length
        ? Math.round((s.poValues.reduce((a, b) => a + b, 0) / s.poValues.length) * 100) / 100
        : null,
    }))
    .sort((a, b) =>
      String(a.register_number || a.student_name).localeCompare(
        String(b.register_number || b.student_name),
      ),
    )

  return { courses, students }
}

