import * as XLSX from 'xlsx'

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
