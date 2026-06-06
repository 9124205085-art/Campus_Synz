import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import DashboardLayout from '../components/DashboardLayout'
import { facultyAPI } from '../services/api'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function hasEnteredMarks(marksheet) {
  const components = marksheet.assessment_components || []
  for (const row of marksheet.student_rows || []) {
    for (const aid of components) {
      const marks = row.assessment_marks?.[aid] || []
      if (marks.some((m) => m !== '' && m != null && String(m).trim() !== '')) {
        return true
      }
    }
  }
  return false
}

function attainmentLevel(pct) {
  if (pct >= 75) return 3
  if (pct >= 60) return 2
  if (pct >= 40) return 1
  return 0
}

/**
 * Core calculation:
 * For each assessment component and each CO:
 *   1. Find questions mapped to that CO
 *   2. Sum each student's marks on those questions
 *   3. Count students who scored >= threshold% of max
 *   4. CO attainment % = (count / total students) * 100
 *   5. Level = 0-3 based on attainment %
 * Final CO attainment = weighted average of component levels
 */
function calculateAttainment(marksheet, threshold, weightages) {
  const { student_rows, assessment_components } = marksheet
  const numQ = marksheet.num_questions || 0
  const question_cos = normaliseQuestionCos(marksheet.question_cos, numQ)
  const question_marks = normaliseQuestionMarks(marksheet.question_marks, numQ)

  if (!student_rows?.length || !question_cos?.length) return null
  if (!hasEnteredMarks(marksheet)) return null

  const usedCOs = [...new Set(question_cos)].sort()
  const activeComponents = assessment_components.filter(
    (aid) => (parseFloat(weightages[aid]) || 0) > 0,
  )

  const componentResults = {}

  for (const aid of assessment_components) {
    const coAttainment = {}

    for (const co of usedCOs) {
      const qIndices = question_cos
        .map((c, i) => (c === co ? i : -1))
        .filter((i) => i >= 0)

      if (qIndices.length === 0) continue

      const maxMark = qIndices.reduce(
        (sum, i) => sum + (parseFloat(question_marks[i]) || 0), 0,
      )
      const passScore = (threshold / 100) * maxMark

      let attained = 0
      let total = 0

      for (const row of student_rows) {
        const marks = row.assessment_marks?.[aid]
        if (!marks) continue
        total++
        const studentScore = qIndices.reduce(
          (sum, i) => sum + (parseFloat(marks[i]) || 0), 0,
        )
        if (studentScore >= passScore) attained++
      }

      const pct = total > 0 ? (attained / total) * 100 : 0
      coAttainment[co] = {
        attained, total,
        pct: Math.round(pct * 100) / 100,
        level: attainmentLevel(pct),
        maxMark,
      }
    }

    componentResults[aid] = coAttainment
  }

  // Per-student question marks + CO attainment (aggregated across active components)
  const studentResults = student_rows.map((row) => {
    const questionMarksPerStudent = Array.from({ length: numQ }, (_, qi) => {
      let sum = 0
      let hasAny = false
      for (const aid of activeComponents) {
        const marks = row.assessment_marks?.[aid]
        if (!marks) continue
        const val = marks[qi]
        if (val !== '' && val != null && String(val).trim() !== '') {
          sum += parseFloat(val) || 0
          hasAny = true
        }
      }
      return hasAny ? Math.round(sum * 100) / 100 : null
    })

    const cos = {}

    for (const co of usedCOs) {
      let marksObtained = 0
      let maxMark = 0
      let hasMarks = false

      for (const aid of activeComponents) {
        const marks = row.assessment_marks?.[aid]
        if (!marks) continue

        const qIndices = question_cos
          .map((c, i) => (c === co ? i : -1))
          .filter((i) => i >= 0)
        if (qIndices.length === 0) continue

        const compMax = qIndices.reduce(
          (sum, i) => sum + (parseFloat(question_marks[i]) || 0), 0,
        )
        const compScore = qIndices.reduce(
          (sum, i) => sum + (parseFloat(marks[i]) || 0), 0,
        )

        marksObtained += compScore
        maxMark += compMax
        hasMarks = true
      }

      const pct = maxMark > 0
        ? Math.round((marksObtained / maxMark) * 10000) / 100
        : 0
      const passScore = (threshold / 100) * maxMark

      cos[co] = {
        marksObtained: hasMarks ? Math.round(marksObtained * 100) / 100 : null,
        maxMark: hasMarks ? maxMark : null,
        pct: hasMarks ? pct : null,
        attained: hasMarks ? marksObtained >= passScore : null,
      }
    }

    const coPcts = usedCOs
      .map((co) => cos[co]?.pct)
      .filter((p) => p != null)
    const overallPct = coPcts.length
      ? Math.round((coPcts.reduce((s, p) => s + p, 0) / coPcts.length) * 100) / 100
      : null
    const attainedCount = usedCOs.filter((co) => cos[co]?.attained === true).length
    const evaluatedCount = usedCOs.filter((co) => cos[co]?.attained != null).length

    return {
      register_number: row.register_number || '',
      student_name: row.student_name || '',
      questionMarks: questionMarksPerStudent,
      cos,
      overallPct,
      attainedCount,
      evaluatedCount,
      overallAttainmentPct: evaluatedCount > 0
        ? Math.round((attainedCount / evaluatedCount) * 10000) / 100
        : null,
    }
  })

  // Final weighted CO attainment
  const finalCO = {}
  for (const co of usedCOs) {
    let weightedSum = 0
    let weightUsed = 0

    for (const aid of activeComponents) {
      const w = parseFloat(weightages[aid]) || 0
      const level = componentResults[aid]?.[co]?.level ?? 0
      weightedSum += level * w
      weightUsed += w
    }

    const finalLevel = weightUsed > 0
      ? Math.round((weightedSum / weightUsed) * 100) / 100
      : 0

    finalCO[co] = { weightedLevel: finalLevel, roundedLevel: Math.round(finalLevel) }
  }

  return {
    usedCOs,
    componentResults,
    finalCO,
    studentResults,
    threshold,
    questionCos: question_cos,
    questionMaxMarks: question_marks,
    numQuestions: numQ,
  }
}

// ─── Excel export ────────────────────────────────────────────────────────────

function exportToExcel(marksheet, threshold, weightages, result) {
  const wb = XLSX.utils.book_new()
  const { usedCOs, componentResults, finalCO } = result

  const assessmentLabel = (aid) => {
    const idx = marksheet.assessment_components.indexOf(aid)
    return marksheet.assessment_labels?.[idx] || aid
  }

  // ── Sheet 1: Student Marks ────────────────────────────────────────────────
  const marksHeader = ['Reg. No', 'Student Name']
  for (const aid of marksheet.assessment_components) {
    for (let q = 0; q < marksheet.num_questions; q++) {
      marksHeader.push(
        `${assessmentLabel(aid)} Q${q + 1} (${marksheet.question_cos[q]}, max ${marksheet.question_marks[q]})`
      )
    }
  }
  const marksRows = [marksHeader]
  for (const row of marksheet.student_rows) {
    const r = [row.register_number || '', row.student_name || '']
    for (const aid of marksheet.assessment_components) {
      const marks = row.assessment_marks?.[aid] || []
      for (const m of marks) r.push(m === '' ? '' : Number(m))
    }
    marksRows.push(r)
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(marksRows), 'Student Marks')

  // ── Sheet 2: CO Attainment per Component ─────────────────────────────────
  const compHeader = [
    'Component', 'Weight (%)',
    ...usedCOs.map((c) => `${c} Attained`),
    ...usedCOs.map((c) => `${c} Total`),
    ...usedCOs.map((c) => `${c} %`),
    ...usedCOs.map((c) => `${c} Level (0-3)`),
  ]
  const compRows = [compHeader]
  for (const aid of marksheet.assessment_components) {
    const w = parseFloat(weightages[aid]) || 0
    const r = [assessmentLabel(aid), w]
    for (const co of usedCOs) r.push(componentResults[aid]?.[co]?.attained ?? '-')
    for (const co of usedCOs) r.push(componentResults[aid]?.[co]?.total ?? '-')
    for (const co of usedCOs) r.push(componentResults[aid]?.[co]?.pct != null ? `${componentResults[aid][co].pct}%` : '-')
    for (const co of usedCOs) r.push(componentResults[aid]?.[co]?.level ?? '-')
    compRows.push(r)
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compRows), 'CO Attainment per Component')

  // ── Sheet 3: Final CO Attainment ─────────────────────────────────────────
  const finalRows = [
    ['Course Code', marksheet.course_code],
    ['Course Name', marksheet.course_name],
    ['Department', marksheet.department],
    ['Regulation', marksheet.regulation],
    ['Passing Threshold', `${threshold}%`],
    ['Year / Semester', `Year ${marksheet.year} / Sem ${marksheet.semester}`],
    [],
    ['CO', 'Weighted Level', 'Final Level (Rounded)'],
    ...usedCOs.map((co) => [co, finalCO[co].weightedLevel, finalCO[co].roundedLevel]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(finalRows), 'Final CO Attainment')

  // ── Sheet 4: Student CO Attainment ───────────────────────────────────────
  const studentHeader = [
    'Reg. No',
    'Student Name',
    ...Array.from({ length: result.numQuestions || 0 }, (_, i) =>
      `Q${i + 1} (${result.questionCos?.[i] || 'CO1'}, max ${result.questionMaxMarks?.[i] || '?'})`,
    ),
    ...usedCOs.flatMap((co) => [`${co} Marks`, `${co} Max`, `${co} %`, `${co} Status`]),
    'Overall Avg %',
    'COs Attained',
    'Overall Attainment %',
  ]
  const studentRows = [studentHeader]
  for (const s of result.studentResults || []) {
    const r = [s.register_number, s.student_name]
    for (let i = 0; i < (result.numQuestions || 0); i++) {
      r.push(s.questionMarks?.[i] ?? '')
    }
    for (const co of usedCOs) {
      const d = s.cos[co]
      r.push(
        d?.marksObtained ?? '',
        d?.maxMark ?? '',
        d?.pct != null ? `${d.pct}%` : '',
        d?.attained == null ? '' : d.attained ? 'Attained' : 'Not Attained',
      )
    }
    r.push(
      s.overallPct != null ? `${s.overallPct}%` : '',
      s.evaluatedCount > 0 ? `${s.attainedCount}/${s.evaluatedCount}` : '',
      s.overallAttainmentPct != null ? `${s.overallAttainmentPct}%` : '',
    )
    studentRows.push(r)
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(studentRows), 'Student CO Attainment')

  // ── Sheet 5: Level Legend ─────────────────────────────────────────────────
  const legendRows = [
    ['% of Students who Attained', 'Attainment Level'],
    ['75% and above', 3],
    ['60% – 74%', 2],
    ['40% – 59%', 1],
    ['Below 40%', 0],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(legendRows), 'Level Legend')

  XLSX.writeFile(wb, `CO_Attainment_${marksheet.course_code}_${marksheet.regulation}.xlsx`)
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function COAttainmentPage() {
  const { sheetId } = useParams()
  const navigate = useNavigate()

  const [marksheet, setMarksheet] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(60)
  const [weightages, setWeightages] = useState({})
  const [result, setResult] = useState(null)
  const [weightError, setWeightError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    facultyAPI
      .getMarksheet(sheetId)
      .then((res) => {
        const ms = res.data.marksheet
        setMarksheet(ms)
        setSubmitted(!!ms.co_submitted)
        if (ms.passing_threshold) setThreshold(ms.passing_threshold)
        const components = ms.assessment_components || []
        const savedWeights = ms.component_weightages || {}
        if (Object.keys(savedWeights).length) {
          setWeightages(savedWeights)
        } else {
          const n = components.length
          const base = n > 0 ? Math.floor(100 / n) : 0
          const init = {}
          components.forEach((aid, i) => {
            init[aid] = base + (i === 0 ? 100 - base * n : 0)
          })
          setWeightages(init)
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load mark sheet.'))
      .finally(() => setLoading(false))
  }, [sheetId])

  const totalWeight = Object.values(weightages).reduce(
    (s, v) => s + (parseFloat(v) || 0), 0,
  )

  const handleCalculate = () => {
    setWeightError('')
    if (Math.round(totalWeight) !== 100) {
      setWeightError(`Weightages must sum to 100%. Currently: ${totalWeight}%`)
      return
    }
    if (!marksheet.is_saved) {
      setWeightError('Please save the mark sheet first (click Save Marks on the entry page).')
      return
    }
    const r = calculateAttainment(marksheet, threshold, weightages)
    if (!r) {
      setWeightError('No student marks found. Enter marks in the sheet, save, then calculate again.')
      return
    }
    setResult(r)
  }

  const handleSubmit = async () => {
    if (!result) return
    setSubmitMessage('')
    setSubmitting(true)
    try {
      const submission = {
        usedCOs: result.usedCOs,
        componentResults: result.componentResults,
        finalCO: result.finalCO,
        studentResults: result.studentResults,
        questionCos: result.questionCos,
        questionMaxMarks: result.questionMaxMarks,
        numQuestions: result.numQuestions,
      }
      const res = await facultyAPI.submitCoAttainment(sheetId, {
        threshold,
        weightages,
        submission,
      })
      setSubmitted(true)
      setSubmitMessage(res.data.message || 'Submitted to HOD successfully.')
      setMarksheet((prev) => (prev ? { ...prev, co_submitted: true } : prev))
    } catch (err) {
      setSubmitMessage(err.response?.data?.message || 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  const assessmentLabel = (aid) => {
    const idx = marksheet?.assessment_components?.indexOf(aid)
    return marksheet?.assessment_labels?.[idx] || aid
  }

  return (
    <DashboardLayout title="CO Attainment Report" subtitle="Course outcome calculation & export">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-slate-500">Loading mark sheet…</p>}

      {marksheet && (
        <>
          {/* ── Course Info ── */}
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {marksheet.course_code} — {marksheet.course_name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {marksheet.department} · {marksheet.regulation} · Year {marksheet.year} / Sem {marksheet.semester} ·{' '}
                  {marksheet.num_students} students · {marksheet.num_questions} questions
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/faculty/marksheet/${sheetId}`)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ← Back to Mark Sheet
              </button>
            </div>
          </div>

          {/* ── Step 1: Configuration ── */}
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
            <h3 className="mb-5 text-base font-semibold text-slate-800">
              Step 1 — Configure Attainment Settings
            </h3>

            {/* Passing Threshold */}
            <div className="mb-8">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Passing Threshold
              </label>
              <p className="mb-3 text-xs text-slate-400">
                A student "attains" a CO if they score at least this % of the maximum marks for that CO's questions.
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={30}
                  max={80}
                  step={5}
                  value={threshold}
                  onChange={(e) => { setThreshold(Number(e.target.value)); setResult(null) }}
                  className="h-2 w-56 accent-navy"
                />
                <span className="w-16 rounded-lg border border-navy/30 bg-navy/5 px-3 py-1.5 text-center text-sm font-bold text-navy">
                  {threshold}%
                </span>
              </div>
            </div>

            {/* Weightages */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Assessment Weightages
              </label>
              <p className="mb-3 text-xs text-slate-400">
                Set how much each component contributes to the final CO attainment level. Must sum to 100%.
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {marksheet.assessment_components.map((aid) => (
                  <div
                    key={aid}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {assessmentLabel(aid)}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={weightages[aid] ?? 0}
                        onChange={(e) => {
                          setWeightages((prev) => ({ ...prev, [aid]: e.target.value }))
                          setResult(null)
                        }}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-navy focus:outline-none"
                      />
                      <span className="text-sm text-slate-400">%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Running total */}
              <div className={`mt-3 text-sm font-medium ${
                Math.round(totalWeight) === 100 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                Total: {totalWeight}%{' '}
                {Math.round(totalWeight) === 100
                  ? '✓ Ready to calculate'
                  : `— ${totalWeight < 100 ? `add ${(100 - totalWeight).toFixed(0)}% more` : `remove ${(totalWeight - 100).toFixed(0)}%`}`}
              </div>

              {weightError && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {weightError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              className="mt-6 rounded-full bg-navy px-8 py-3 text-sm font-semibold text-white hover:bg-navy-dark"
            >
              Calculate CO Attainment →
            </button>
          </div>

          {/* ── Step 2: Per-Component Results ── */}
          {result && (
            <>
              <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
                <h3 className="mb-1 text-base font-semibold text-slate-800">
                  Step 2 — CO Attainment per Component
                </h3>
                <p className="mb-4 text-xs text-slate-400">
                  Threshold: <strong>{threshold}%</strong> · Level: &lt;40% → 0 · 40–59% → 1 · 60–74% → 2 · ≥75% → 3
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-100">
                        <th className="pb-3 pr-4 text-left font-semibold text-slate-600">Component</th>
                        <th className="pb-3 pr-4 text-right font-semibold text-slate-600">Weight</th>
                        {result.usedCOs.map((co) => (
                          <th key={co} className="pb-3 px-3 text-center font-semibold text-slate-600">
                            {co}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {marksheet.assessment_components.map((aid) => {
                        const w = parseFloat(weightages[aid]) || 0
                        return (
                          <tr key={aid} className="hover:bg-slate-50">
                            <td className="py-3 pr-4 font-medium text-slate-700">
                              {assessmentLabel(aid)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-400 tabular-nums">
                              {w}%
                            </td>
                            {result.usedCOs.map((co) => {
                              const d = result.componentResults[aid]?.[co]
                              if (!d) return (
                                <td key={co} className="px-3 py-3 text-center text-slate-200">—</td>
                              )
                              const colors = {
                                3: 'bg-emerald-100 text-emerald-700',
                                2: 'bg-blue-100 text-blue-700',
                                1: 'bg-amber-100 text-amber-700',
                                0: 'bg-red-100 text-red-700',
                              }
                              return (
                                <td key={co} className="px-3 py-3 text-center">
                                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${colors[d.level]}`}>
                                    L{d.level}
                                  </span>
                                  <div className="mt-0.5 text-xs text-slate-400 tabular-nums">
                                    {d.pct}%
                                  </div>
                                  <div className="text-xs text-slate-300 tabular-nums">
                                    {d.attained}/{d.total}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Step 3: Per-Student CO Attainment (Excel-style) ── */}
              <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
                <h3 className="mb-1 text-base font-semibold text-slate-800">
                  Step 3 — Student-wise CO Attainment
                </h3>
                <p className="mb-4 text-xs text-slate-400">
                  Question marks (Q1, Q2…) with CO mapping · CO totals and attainment at ≥ {threshold}%
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-300">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th
                          rowSpan={2}
                          className="sticky left-0 z-20 min-w-[88px] border border-slate-300 bg-slate-200 px-2 py-2 text-left text-xs font-semibold"
                        >
                          Reg. No
                        </th>
                        <th
                          rowSpan={2}
                          className="sticky left-[88px] z-20 min-w-[140px] border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold"
                        >
                          Student Name
                        </th>
                        {Array.from({ length: result.numQuestions || 0 }, (_, i) => (
                          <th
                            key={`q-${i}`}
                            rowSpan={2}
                            className="min-w-[72px] border border-slate-300 px-1 py-2 text-center font-semibold text-navy"
                          >
                            Q{i + 1}
                            <span className="block text-[10px] font-normal text-slate-500">
                              max {result.questionMaxMarks?.[i] ?? '?'}m
                            </span>
                          </th>
                        ))}
                        {result.usedCOs.map((co) => (
                          <th
                            key={co}
                            colSpan={3}
                            className="border border-slate-300 bg-slate-50 px-2 py-2 text-center font-semibold text-slate-700"
                          >
                            {co}
                          </th>
                        ))}
                        <th
                          colSpan={3}
                          className="border border-slate-300 bg-navy/10 px-2 py-2 text-center font-semibold text-navy"
                        >
                          Overall
                        </th>
                      </tr>
                      <tr className="bg-slate-50 text-xs text-slate-600">
                        {result.usedCOs.map((co) => (
                          <Fragment key={`${co}-sub`}>
                            <th className="border border-slate-300 px-1 py-1 text-center font-medium">Marks</th>
                            <th className="border border-slate-300 px-1 py-1 text-center font-medium">%</th>
                            <th className="border border-slate-300 px-1 py-1 text-center font-medium">Status</th>
                          </Fragment>
                        ))}
                        <th className="border border-slate-300 bg-navy/5 px-1 py-1 text-center font-medium">Avg %</th>
                        <th className="border border-slate-300 bg-navy/5 px-1 py-1 text-center font-medium">COs</th>
                        <th className="border border-slate-300 bg-navy/5 px-1 py-1 text-center font-medium">Att %</th>
                      </tr>
                      <tr className="bg-white text-xs text-slate-500">
                        <th colSpan={2} className="sticky left-0 z-20 border border-slate-300 bg-slate-50 px-2 py-1 text-left">
                          CO / Max
                        </th>
                        {Array.from({ length: result.numQuestions || 0 }, (_, i) => (
                          <th key={`co-label-${i}`} className="border border-slate-300 px-1 py-1 text-center">
                            <div className="font-semibold text-navy">{result.questionCos?.[i] || 'CO1'}</div>
                            <div>{result.questionMaxMarks?.[i] || '?'}m</div>
                          </th>
                        ))}
                        {result.usedCOs.map((co) => (
                          <th key={`${co}-pad`} colSpan={3} className="border border-slate-200" />
                        ))}
                        <th colSpan={3} className="border border-slate-200 bg-navy/[0.03]" />
                      </tr>
                    </thead>
                    <tbody>
                      {(result.studentResults || []).map((student, idx) => (
                        <tr key={student.register_number || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                          <td className="sticky left-0 z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-mono text-xs tabular-nums text-slate-600">
                            {student.register_number || '—'}
                          </td>
                          <td className="sticky left-[88px] z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-medium text-slate-800">
                            {student.student_name || '—'}
                          </td>
                          {Array.from({ length: result.numQuestions || 0 }, (_, qi) => (
                            <td key={qi} className="border border-slate-200 px-1 py-1.5 text-center tabular-nums text-slate-700">
                              {student.questionMarks?.[qi] != null ? student.questionMarks[qi] : '—'}
                            </td>
                          ))}
                          {result.usedCOs.map((co) => {
                            const d = student.cos[co]
                            if (!d || d.marksObtained == null) {
                              return (
                                <Fragment key={co}>
                                  <td className="border border-slate-200 px-1 py-1.5 text-center text-slate-300">—</td>
                                  <td className="border border-slate-200 px-1 py-1.5 text-center text-slate-300">—</td>
                                  <td className="border border-slate-200 px-1 py-1.5 text-center text-slate-300">—</td>
                                </Fragment>
                              )
                            }
                            return (
                              <Fragment key={co}>
                                <td className="border border-slate-200 px-1 py-1.5 text-center tabular-nums">
                                  {d.marksObtained}
                                  <span className="text-slate-400">/{d.maxMark}</span>
                                </td>
                                <td className="border border-slate-200 px-1 py-1.5 text-center tabular-nums">{d.pct}%</td>
                                <td className="border border-slate-200 px-1 py-1.5 text-center">
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    d.attained ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {d.attained ? 'Attained' : 'Not Attained'}
                                  </span>
                                </td>
                              </Fragment>
                            )
                          })}
                          <td className="border border-slate-200 bg-navy/[0.02] px-1 py-1.5 text-center font-semibold tabular-nums text-navy">
                            {student.overallPct != null ? `${student.overallPct}%` : '—'}
                          </td>
                          <td className="border border-slate-200 bg-navy/[0.02] px-1 py-1.5 text-center tabular-nums">
                            {student.evaluatedCount > 0 ? `${student.attainedCount}/${student.evaluatedCount}` : '—'}
                          </td>
                          <td className="border border-slate-200 bg-navy/[0.02] px-1 py-1.5 text-center tabular-nums">
                            {student.overallAttainmentPct != null ? `${student.overallAttainmentPct}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-navy/20 bg-navy/5 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      {submitted ? 'Submitted to HOD' : 'Submit to Department HOD'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {submitted
                        ? 'This report is visible on your department HOD dashboard. Recalculate and submit again to update.'
                        : 'Send this CO attainment report to your department head for review.'}
                    </p>
                    {submitMessage && (
                      <p className={`mt-2 text-sm ${submitMessage.includes('Failed') ? 'text-red-600' : 'text-emerald-600'}`}>
                        {submitMessage}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-full bg-navy px-8 py-3 text-sm font-semibold text-white hover:bg-navy-dark disabled:opacity-60"
                  >
                    {submitting ? 'Submitting…' : submitted ? 'Resubmit to HOD' : 'Submit to HOD'}
                  </button>
                </div>
              </div>

              {/* ── Step 4: Final CO Attainment ── */}
              <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
                <h3 className="mb-4 text-base font-semibold text-slate-800">
                  Step 4 — Final CO Attainment (Weighted Average)
                </h3>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {result.usedCOs.map((co) => {
                    const f = result.finalCO[co]
                    const styles = {
                      3: { border: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-600' },
                      2: { border: 'border-blue-200 bg-blue-50', text: 'text-blue-600' },
                      1: { border: 'border-amber-200 bg-amber-50', text: 'text-amber-600' },
                      0: { border: 'border-red-200 bg-red-50', text: 'text-red-600' },
                    }[f.roundedLevel]
                    return (
                      <div key={co} className={`rounded-2xl border-2 p-5 text-center ${styles.border}`}>
                        <p className="text-sm font-semibold text-slate-500">{co}</p>
                        <p className={`mt-2 text-4xl font-bold ${styles.text}`}>
                          {f.roundedLevel}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          weighted: {f.weightedLevel}
                        </p>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  {[
                    ['bg-emerald-100 text-emerald-700', 'Level 3 — ≥ 75% students attained'],
                    ['bg-blue-100 text-blue-700',     'Level 2 — 60–74% attained'],
                    ['bg-amber-100 text-amber-700',   'Level 1 — 40–59% attained'],
                    ['bg-red-100 text-red-700',       'Level 0 — < 40% attained'],
                  ].map(([cls, label]) => (
                    <span key={label} className={`rounded-full px-3 py-1 font-medium ${cls}`}>{label}</span>
                  ))}
                </div>
              </div>

              {/* ── Export ── */}
              <div className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Ready to export</p>
                  <p className="text-xs text-emerald-600">
                    Excel file with 5 sheets: Student Marks · CO per Component · Final Attainment · Student CO · Legend
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => exportToExcel(marksheet, threshold, weightages, result)}
                  className="flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Excel
                </button>
              </div>
            </>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
