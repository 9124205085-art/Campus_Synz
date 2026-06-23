import { Fragment, useEffect, useMemo, useState } from 'react'
import { facultyAPI } from '../../services/api'
import {
  PO_OPTIONS,
  assessmentLabelFor,
  buildComponentSummaryExport,
  buildConsolidatedComponentReport,
  buildDefaultCoPoMapping,
  courseGroupKey,
  discoverCompletedComponents,
  exportComponentCoPoPdf,
  filterMarksheetsToAssigned,
  groupSheetsByCourse,
  mergeCourseMarksheets,
  normaliseQuestionCos,
  poLevelLabel,
} from '../../utils/coPoAttainment'

const COMPONENT_THEMES = [
  { header: 'bg-sky-100 text-sky-900', sub: 'bg-sky-50/80', cell: 'bg-sky-50/30' },
  { header: 'bg-teal-100 text-teal-900', sub: 'bg-teal-50/80', cell: 'bg-teal-50/30' },
  { header: 'bg-indigo-100 text-indigo-900', sub: 'bg-indigo-50/80', cell: 'bg-indigo-50/30' },
  { header: 'bg-cyan-100 text-cyan-900', sub: 'bg-cyan-50/80', cell: 'bg-cyan-50/30' },
]

function classAveragesToCellData(classAvgs, usedCOs, numQuestions) {
  if (!classAvgs) return null

  const cos = {}
  for (const co of usedCOs) {
    cos[co] = {
      marksObtained: classAvgs.coMarksAvgs?.[co] ?? null,
      maxMark: null,
      pct: classAvgs.coPctAvgs?.[co] ?? null,
      attained: null,
    }
  }

  return {
    hasMarks: true,
    questionMarks: classAvgs.questionAvgs || Array.from({ length: numQuestions }, () => null),
    totalObtained: classAvgs.totalObtained ?? null,
    cos,
    pos: classAvgs.poAvgs || {},
    overallPoPct: classAvgs.overallPoPct ?? null,
    poLevel: classAvgs.poLevel ?? poLevelLabel(classAvgs.overallPoPct),
  }
}

function StudentComponentCells({ data, usedCOs, numQuestions, theme, isAverage = false }) {
  const blockCols = numQuestions + 2 + usedCOs.length * 2 + PO_OPTIONS.length + 2

  if (!data) {
    return (
      <>
        {Array.from({ length: blockCols }).map((_, i) => (
          <td key={i} className={`border border-slate-300 px-1 py-1.5 text-center ${theme.cell}`}>
            —
          </td>
        ))}
      </>
    )
  }

  const qMarks = data.questionMarks || []
  const totalObtained = qMarks.reduce((s, m) => s + (parseFloat(m) || 0), 0)
  const totalMax = usedCOs.reduce((s, co) => s + (parseFloat(data.cos?.[co]?.maxMark) || 0), 0)

  return (
    <>
      {Array.from({ length: numQuestions }, (_, qi) => (
        <td
          key={`q-${qi}`}
          className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums ${theme.cell}`}
        >
          {qMarks[qi] ?? '—'}
        </td>
      ))}
      <td className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums font-medium ${theme.cell} ${isAverage ? 'font-bold' : ''}`}>
        {data.totalObtained != null
          ? data.totalObtained
          : data.hasMarks
            ? Math.round(totalObtained * 100) / 100
            : '—'}
      </td>
      <td className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums ${theme.cell}`}>
        {isAverage ? '—' : data.hasMarks ? totalMax : '—'}
      </td>
      {usedCOs.map((co) => (
        <Fragment key={co}>
          <td className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums ${theme.cell}`}>
            {data.cos?.[co]?.marksObtained ?? '—'}
          </td>
          <td className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums ${theme.cell}`}>
            {data.cos?.[co]?.pct != null ? `${data.cos[co].pct}%` : '—'}
          </td>
        </Fragment>
      ))}
      {PO_OPTIONS.map((po) => (
        <td
          key={po}
          className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums ${theme.cell}`}
        >
          {data.pos?.[po] != null ? `${data.pos[po]}%` : '—'}
        </td>
      ))}
      <td className={`border border-slate-300 px-1 py-1.5 text-center tabular-nums font-medium ${theme.cell}`}>
        {data.overallPoPct != null ? `${data.overallPoPct}%` : '—'}
      </td>
      <td className={`border border-slate-300 px-1 py-1.5 text-center text-xs font-semibold ${theme.cell}`}>
        {data.poLevel ?? '—'}
      </td>
    </>
  )
}

function formatMark(value) {
  if (value == null || value === '') return '—'
  return value
}

function formatPct(value) {
  if (value == null || value === '') return '—'
  return `${value}%`
}

function ComponentSummaryBlockCells({ summary, usedCOs }) {
  if (!summary?.hasMarks) {
    const emptyCols = usedCOs.length + 1 + PO_OPTIONS.length + 2
    return Array.from({ length: emptyCols }, (_, i) => (
      <td key={i} className="border border-slate-200 px-2 py-1.5 text-center text-slate-400">
        —
      </td>
    ))
  }
  return (
    <>
      {usedCOs.map((co) => (
        <td key={co} className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">
          {formatMark(summary.coSummary?.[co]?.marks)}
        </td>
      ))}
      <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums font-semibold text-navy">
        {formatPct(summary.overallCoPct)}
      </td>
      {PO_OPTIONS.map((po) => (
        <td key={po} className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">
          {formatPct(summary.poSummary?.[po])}
        </td>
      ))}
      <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums font-semibold text-navy">
        {formatPct(summary.overallPoPct)}
      </td>
      <td className="border border-slate-200 px-2 py-1.5 text-center text-xs font-semibold">
        {summary.poLevel || '—'}
      </td>
    </>
  )
}

function componentBlockColCount(usedCOs) {
  return usedCOs.length + 1 + PO_OPTIONS.length + 2
}

export function ComponentSummaryTable({ summaryExport }) {
  if (!summaryExport) return null
  const { studentSummaries, components, showOverall, usedCOs } = summaryExport
  const blockCols = componentBlockColCount(usedCOs)

  return (
    <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-200">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold"
            >
              Reg. No
            </th>
            <th
              rowSpan={2}
              className="sticky left-[72px] z-20 border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold"
            >
              Student Name
            </th>
            {components.map((c, idx) => (
              <th
                key={c.id}
                colSpan={blockCols}
                className={`border border-slate-300 px-2 py-2 text-center text-sm font-bold ${
                  COMPONENT_THEMES[idx % COMPONENT_THEMES.length].header
                }`}
              >
                {c.label}
              </th>
            ))}
            {showOverall && (
              <th
                colSpan={blockCols}
                className="border border-slate-300 bg-violet-200 px-2 py-2 text-center text-sm font-bold text-violet-950"
              >
                Overall
              </th>
            )}
          </tr>
          <tr className="bg-slate-50 text-[10px] font-semibold text-slate-700">
            {components.map((c, idx) => {
              const theme = COMPONENT_THEMES[idx % COMPONENT_THEMES.length]
              return (
                <Fragment key={`hdr-${c.id}`}>
                  {usedCOs.map((co) => (
                    <th key={`${c.id}-${co}`} className={`border border-slate-300 px-1 py-1 ${theme.sub}`}>
                      {co} Mk
                    </th>
                  ))}
                  <th className={`border border-slate-300 px-1 py-1 ${theme.sub}`}>CO Overall %</th>
                  {PO_OPTIONS.map((po) => (
                    <th key={`${c.id}-${po}`} className={`border border-slate-300 px-1 py-1 ${theme.sub}`}>
                      {po} %
                    </th>
                  ))}
                  <th className={`border border-slate-300 px-1 py-1 ${theme.sub}`}>PO Overall %</th>
                  <th className={`border border-slate-300 px-1 py-1 ${theme.sub}`}>PO Lvl</th>
                </Fragment>
              )
            })}
            {showOverall && (
              <>
                {usedCOs.map((co) => (
                  <th key={`ov-${co}`} className="border border-slate-300 bg-violet-100/80 px-1 py-1">
                    {co} Mk
                  </th>
                ))}
                <th className="border border-slate-300 bg-violet-100/80 px-1 py-1">CO Overall %</th>
                {PO_OPTIONS.map((po) => (
                  <th key={`ov-${po}`} className="border border-slate-300 bg-violet-100/80 px-1 py-1">
                    {po} %
                  </th>
                ))}
                <th className="border border-slate-300 bg-violet-100/80 px-1 py-1">PO Overall %</th>
                <th className="border border-slate-300 bg-violet-100/80 px-1 py-1">PO Lvl</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {studentSummaries.map((s, idx) => (
            <tr key={s.register_number || s.student_name || idx} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
              <td className="sticky left-0 z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-mono">
                {s.register_number || '—'}
              </td>
              <td className="sticky left-[72px] z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-medium">
                {s.student_name || '—'}
              </td>
              {components.map((c) => (
                <ComponentSummaryBlockCells
                  key={c.id}
                  summary={s.byComponent[c.id]}
                  usedCOs={usedCOs}
                />
              ))}
              {showOverall && (
                <ComponentSummaryBlockCells summary={s.overall} usedCOs={usedCOs} />
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
        Per component: CO marks obtained · CO overall % · each PO % · PO overall % · PO level
      </p>
    </div>
  )
}

export function ExcelConsolidatedTable({ report }) {
  if (!report) return null

  const blockCols = (numQ, cos) => numQ + 2 + cos.length * 2 + PO_OPTIONS.length + 2

  const { componentMeta, showOverall, studentRows, usedCOs, numQuestions, questionCos, questionMaxMarks, classAverages, overall } =
    report
  const overallTheme = { header: 'bg-violet-200 text-violet-950', sub: 'bg-violet-100/80', cell: 'bg-violet-50/40' }

  const compLayout = (comp) => ({
    compNumQ: comp.numQuestions ?? numQuestions,
    compUsedCOs: comp.usedCOs ?? comp.result?.usedCOs ?? usedCOs,
    compMaxMarks: comp.questionMaxMarks ?? questionMaxMarks,
    compQuestionCos: comp.questionCos ?? questionCos,
  })

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-300">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-200">
            <th
              rowSpan={4}
              className="sticky left-0 z-40 min-w-[88px] border border-slate-300 bg-slate-200 px-2 py-2 text-left text-xs font-semibold shadow-[2px_0_4px_-1px_rgba(15,23,42,0.06)]"
            >
              Reg. No
            </th>
            <th
              rowSpan={4}
              className="sticky left-[88px] z-50 min-w-[140px] border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold shadow-[2px_0_4px_-1px_rgba(15,23,42,0.06)]"
            >
              Student Name
            </th>
          </tr>
          <tr>
            {componentMeta.map((comp, idx) => {
              const { compNumQ, compUsedCOs } = compLayout(comp)
              const cols = blockCols(compNumQ, compUsedCOs)
              const theme = COMPONENT_THEMES[idx % COMPONENT_THEMES.length]
              return (
                <th
                  key={comp.id}
                  colSpan={cols}
                  className={`border border-slate-300 px-2 py-2 text-center text-sm font-bold ${theme.header}`}
                >
                  {comp.label}
                </th>
              )
            })}
            {showOverall && (
              <th
                colSpan={blockCols(numQuestions, usedCOs)}
                className={`border border-slate-300 px-2 py-2 text-center text-sm font-bold ${overallTheme.header}`}
              >
                Overall ({componentMeta.map((c) => c.label).join(' + ')})
              </th>
            )}
          </tr>
          <tr>
            {componentMeta.map((comp, idx) => {
              const { compNumQ, compUsedCOs, compMaxMarks } = compLayout(comp)
              const theme = COMPONENT_THEMES[idx % COMPONENT_THEMES.length]
              return (
                <Fragment key={`hdr-${comp.id}`}>
                  {Array.from({ length: compNumQ }, (_, i) => (
                    <th
                      key={`${comp.id}-q-${i}`}
                      className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${theme.sub}`}
                    >
                      Q{i + 1}
                      <span className="block font-normal">max {compMaxMarks[i]}</span>
                    </th>
                  ))}
                  <th className={`border border-slate-300 px-1 py-1 text-center text-xs ${theme.sub}`}>Total</th>
                  <th className={`border border-slate-300 px-1 py-1 text-center text-xs ${theme.sub}`}>Max</th>
                  {compUsedCOs.map((co) => (
                    <th
                      key={`${comp.id}-${co}`}
                      colSpan={2}
                      className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${theme.sub}`}
                    >
                      {co}
                    </th>
                  ))}
                  <th
                    colSpan={PO_OPTIONS.length}
                    className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${theme.sub}`}
                  >
                    PO %
                  </th>
                  <th
                    colSpan={2}
                    className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${theme.sub}`}
                  >
                    PO Summary
                  </th>
                </Fragment>
              )
            })}
            {showOverall && (
              <>
                {Array.from({ length: numQuestions }, (_, i) => (
                  <th
                    key={`ov-q-${i}`}
                    className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${overallTheme.sub}`}
                  >
                    Q{i + 1}
                    <span className="block font-normal">
                      max{' '}
                      {report.overall?.questionMaxMarks?.[i] ?? questionMaxMarks[i]}
                    </span>
                  </th>
                ))}
                <th className={`border border-slate-300 px-1 py-1 text-center text-xs ${overallTheme.sub}`}>Total</th>
                <th className={`border border-slate-300 px-1 py-1 text-center text-xs ${overallTheme.sub}`}>Max</th>
                {usedCOs.map((co) => (
                  <th
                    key={`ov-${co}`}
                    colSpan={2}
                    className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${overallTheme.sub}`}
                  >
                    {co}
                  </th>
                ))}
                <th
                  colSpan={PO_OPTIONS.length}
                  className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${overallTheme.sub}`}
                >
                  PO %
                </th>
                <th
                  colSpan={2}
                  className={`border border-slate-300 px-1 py-1 text-center text-xs font-semibold ${overallTheme.sub}`}
                >
                  PO Summary
                </th>
              </>
            )}
          </tr>
          <tr className="bg-slate-50 text-[10px] text-slate-600">
            {componentMeta.map((comp, idx) => {
              const theme = COMPONENT_THEMES[idx % COMPONENT_THEMES.length]
              const { compNumQ, compUsedCOs, compQuestionCos } = compLayout(comp)
              return (
                <Fragment key={`sub-${comp.id}`}>
                  {Array.from({ length: compNumQ }, (_, i) => (
                    <th
                      key={i}
                      className={`border border-slate-300 px-0.5 py-0.5 text-center font-semibold text-navy ${theme.sub}`}
                    >
                      {compQuestionCos[i] || '—'}
                    </th>
                  ))}
                  <th colSpan={2} className={`border border-slate-300 ${theme.sub}`} />
                  {compUsedCOs.map((co) => (
                    <Fragment key={co}>
                      <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${theme.sub}`}>Mk</th>
                      <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${theme.sub}`}>%</th>
                    </Fragment>
                  ))}
                  {PO_OPTIONS.map((po) => (
                    <th key={po} className={`border border-slate-300 px-0.5 py-0.5 text-center ${theme.sub}`}>
                      {po}
                    </th>
                  ))}
                  <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${theme.sub}`}>%</th>
                  <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${theme.sub}`}>Lvl</th>
                </Fragment>
              )
            })}
            {showOverall && (
              <>
                {Array.from({ length: numQuestions }, (_, i) => (
                  <th
                    key={i}
                    className={`border border-slate-300 px-0.5 py-0.5 text-center font-semibold text-violet-900 ${overallTheme.sub}`}
                  >
                    {overall?.questionCos?.[i] || questionCos?.[i] || '—'}
                  </th>
                ))}
                <th colSpan={2} className={`border border-slate-300 ${overallTheme.sub}`} />
                {usedCOs.map((co) => (
                  <Fragment key={co}>
                    <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${overallTheme.sub}`}>Mk</th>
                    <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${overallTheme.sub}`}>%</th>
                  </Fragment>
                ))}
                {PO_OPTIONS.map((po) => (
                  <th key={po} className={`border border-slate-300 px-0.5 py-0.5 text-center ${overallTheme.sub}`}>
                    {po}
                  </th>
                ))}
                <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${overallTheme.sub}`}>%</th>
                <th className={`border border-slate-300 px-0.5 py-0.5 text-center ${overallTheme.sub}`}>Lvl</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {studentRows.map((student, idx) => {
            const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
            return (
            <tr key={student.studentKey || idx} className={rowBg}>
              <td
                className={`sticky left-0 z-20 border border-slate-300 ${rowBg} px-2 py-1.5 font-mono text-xs shadow-[2px_0_4px_-1px_rgba(15,23,42,0.06)]`}
              >
                {student.register_number || '—'}
              </td>
              <td
                className={`sticky left-[88px] z-30 border border-slate-300 ${rowBg} px-2 py-1.5 font-medium shadow-[2px_0_4px_-1px_rgba(15,23,42,0.06)]`}
              >
                {student.student_name || '—'}
              </td>
              {componentMeta.map((comp, cidx) => {
                const { compNumQ, compUsedCOs } = compLayout(comp)
                return (
                <StudentComponentCells
                  key={comp.id}
                  data={student.byComponent[comp.id]}
                  usedCOs={compUsedCOs}
                  numQuestions={compNumQ}
                  theme={COMPONENT_THEMES[cidx % COMPONENT_THEMES.length]}
                />
              )})}
              {showOverall && (
                <StudentComponentCells
                  data={student.overall}
                  usedCOs={usedCOs}
                  numQuestions={numQuestions}
                  theme={overallTheme}
                />
              )}
            </tr>
            )
          })}
          <tr className="bg-slate-200 font-bold">
            <td
              colSpan={2}
              className="sticky left-0 z-30 border border-slate-300 bg-slate-200 px-2 py-2 text-sm text-slate-800 shadow-[2px_0_4px_-1px_rgba(15,23,42,0.06)]"
            >
              Class average (%)
            </td>
            {componentMeta.map((comp, cidx) => {
              const { compNumQ, compUsedCOs } = compLayout(comp)
              return (
              <StudentComponentCells
                key={`avg-${comp.id}`}
                data={classAveragesToCellData(
                  classAverages?.byComponent?.[comp.id],
                  compUsedCOs,
                  compNumQ,
                )}
                usedCOs={compUsedCOs}
                numQuestions={compNumQ}
                theme={COMPONENT_THEMES[cidx % COMPONENT_THEMES.length]}
                isAverage
              />
            )})}
            {showOverall && (
              <StudentComponentCells
                data={classAveragesToCellData(
                  classAverages?.overall,
                  usedCOs,
                  numQuestions,
                )}
                usedCOs={usedCOs}
                numQuestions={numQuestions}
                theme={overallTheme}
                isAverage
              />
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function pickDefaultCourseKey(keysWithMarks, sheets, assignedCourses = []) {
  if (!keysWithMarks.length) return ''

  if (assignedCourses.length) {
    for (const course of assignedCourses) {
      const key = courseGroupKey({
        course_code: course.course_code,
        year: course.year,
        semester: course.semester,
        regulation: course.regulation,
      })
      if (keysWithMarks.includes(key)) return key
    }
  }

  let latestKey = keysWithMarks[0]
  let latestTime = ''
  for (const sheet of sheets) {
    const key = courseGroupKey(sheet)
    if (!keysWithMarks.includes(key)) continue
    const stamp = sheet.updated_at || sheet.co_submitted_at || ''
    if (!latestTime || stamp > latestTime) {
      latestTime = stamp
      latestKey = key
    }
  }
  return latestKey
}

export default function ComponentAttainmentPanel({ refreshKey = 0, assignedCourses = [] }) {
  const [sheetOptions, setSheetOptions] = useState([])
  const [selectedCourseKey, setSelectedCourseKey] = useState('')
  const [selectedComponentIds, setSelectedComponentIds] = useState([])
  const [threshold, setThreshold] = useState(60)
  const [loadingSheets, setLoadingSheets] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [pdfComponentIds, setPdfComponentIds] = useState([])
  const [pdfMessage, setPdfMessage] = useState('')

  const courseGroups = useMemo(() => {
    const grouped = groupSheetsByCourse(sheetOptions)
    const eligible = new Map()
    for (const [key, sheets] of grouped.entries()) {
      const merged = mergeCourseMarksheets(sheets)
      if (discoverCompletedComponents(merged).length > 0) {
        eligible.set(key, sheets)
      }
    }
    return eligible
  }, [sheetOptions])

  const courseGroupEntries = useMemo(
    () => [...courseGroups.entries()],
    [courseGroups],
  )

  const mergedMarksheet = useMemo(() => {
    const sheets = courseGroups.get(selectedCourseKey) || []
    return mergeCourseMarksheets(sheets)
  }, [courseGroups, selectedCourseKey])

  const completedComponents = useMemo(
    () => (mergedMarksheet ? discoverCompletedComponents(mergedMarksheet) : []),
    [mergedMarksheet],
  )

  const loadSheetList = () => {
    setLoadingSheets(true)
    return facultyAPI
      .listMarksheets()
      .then((res) => {
        const assignedOnly = filterMarksheetsToAssigned(
          res.data.marksheets || [],
          assignedCourses,
        )
        const sheets = assignedOnly.filter(
          (s) => (s.assessment_components || []).length > 0,
        )
        setSheetOptions(sheets)

        const grouped = groupSheetsByCourse(sheets)
        const keysWithMarks = [...grouped.entries()]
          .filter(([, groupSheets]) =>
            discoverCompletedComponents(mergeCourseMarksheets(groupSheets)).length > 0,
          )
          .map(([key]) => key)

        setSelectedCourseKey((prev) => {
          if (prev && keysWithMarks.includes(prev)) return prev
          return pickDefaultCourseKey(keysWithMarks, sheets, assignedCourses)
        })
        setError('')
        return sheets
      })
      .catch(() => {
        setError('Could not load mark sheets.')
        return []
      })
      .finally(() => setLoadingSheets(false))
  }

  useEffect(() => {
    loadSheetList()
  }, [refreshKey, assignedCourses])

  useEffect(() => {
    if (!mergedMarksheet) {
      setSelectedComponentIds([])
      setPdfComponentIds([])
      return
    }
    setThreshold(mergedMarksheet.passing_threshold || 60)
    const completed = discoverCompletedComponents(mergedMarksheet)
    setSelectedComponentIds(completed)
    setPdfComponentIds((prev) => {
      const kept = prev.filter((id) => completed.includes(id))
      return kept.length ? kept : completed
    })
  }, [selectedCourseKey, mergedMarksheet])

  const coPoMapping = useMemo(() => {
    if (!mergedMarksheet) return {}
    const numQ = mergedMarksheet.num_questions || 0
    const used = [...new Set(normaliseQuestionCos(mergedMarksheet.question_cos, numQ))].sort()
    if (mergedMarksheet.co_po_mapping && Object.keys(mergedMarksheet.co_po_mapping).length) {
      return mergedMarksheet.co_po_mapping
    }
    return buildDefaultCoPoMapping(used)
  }, [mergedMarksheet])

  const report = useMemo(() => {
    if (!mergedMarksheet || selectedComponentIds.length === 0) return null
    const ordered = completedComponents.filter((id) => selectedComponentIds.includes(id))
    return buildConsolidatedComponentReport(
      mergedMarksheet,
      ordered,
      threshold,
      coPoMapping,
    )
  }, [mergedMarksheet, selectedComponentIds, threshold, coPoMapping, completedComponents])

  const summaryExport = useMemo(() => {
    if (!mergedMarksheet || !report) return null
    return buildComponentSummaryExport(mergedMarksheet, report)
  }, [mergedMarksheet, report])

  const handleDownloadCoPoPdf = () => {
    setPdfMessage('')
    if (!mergedMarksheet) {
      setPdfMessage('Select a course with saved mark sheets first.')
      return
    }
    if (!pdfComponentIds.length) {
      setPdfMessage('Select at least one component with completed mark entry.')
      return
    }
    const ok = exportComponentCoPoPdf(
      mergedMarksheet,
      pdfComponentIds,
      threshold,
      coPoMapping,
    )
    if (!ok) {
      setPdfMessage('Could not generate PDF. Check that marks are saved for the selected components.')
    }
  }

  const togglePdfComponent = (componentId) => {
    setPdfMessage('')
    setPdfComponentIds((prev) =>
      prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId],
    )
  }

  const handleSubmitToHod = async () => {
    if (!mergedMarksheet || !summaryExport) return
    setSubmitMessage('')
    setSubmitting(true)
    try {
      const groupSheets = courseGroups.get(selectedCourseKey) || []
      const sheetIds =
        groupSheets.length > 0
          ? groupSheets.map((s) => s.id)
          : summaryExport.sourceSheetIds || []

      if (!sheetIds.length) {
        setSubmitMessage('No mark sheets found for this course. Save mark sheets first.')
        setSubmitting(false)
        return
      }

      const res = await facultyAPI.submitComponentReport({
        threshold,
        sheet_ids: sheetIds,
        submission: summaryExport,
      })
      setSubmitMessage(res.data.message || 'Submitted to HOD successfully.')
      loadSheetList()
    } catch (err) {
      setSubmitMessage(err.response?.data?.message || 'Failed to submit to HOD.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleComponent = (aid) => {
    setSelectedComponentIds((prev) =>
      prev.includes(aid) ? prev.filter((x) => x !== aid) : [...prev, aid],
    )
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            CO / PO by Assessment Component
          </h3>
        </div>
        <button
          type="button"
          onClick={loadSheetList}
          disabled={loadingSheets}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loadingSheets && (
        <p className="mt-4 text-sm text-slate-500">Loading mark sheets…</p>
      )}

      {!loadingSheets && courseGroupEntries.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          {assignedCourses.length === 0
            ? 'No courses assigned yet. Your HOD will assign courses before you can enter marks.'
            : 'No mark sheets for your assigned courses yet. Click Create Mark Sheet on your assigned course, add components (e.g. CA1, CA2), enter marks, and save.'}
        </p>
      )}

      {courseGroupEntries.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {courseGroupEntries.length > 1 ? (
            <label className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Course:</span>
              <select
                value={selectedCourseKey}
                onChange={(e) => setSelectedCourseKey(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                {courseGroupEntries.map(([key, sheets]) => {
                  const s = sheets[0]
                  const ready = discoverCompletedComponents(mergeCourseMarksheets(sheets)).length
                  return (
                    <option key={key} value={key}>
                      {s.course_code} — {s.course_name} (Y{s.year}/S{s.semester}) · {ready}{' '}
                      component{ready === 1 ? '' : 's'} ready
                    </option>
                  )
                })}
              </select>
            </label>
          ) : (
            mergedMarksheet && (
              <p className="font-medium text-navy">
                {mergedMarksheet.course_code} — {mergedMarksheet.course_name} · Year{' '}
                {mergedMarksheet.year} / Sem {mergedMarksheet.semester}
              </p>
            )
          )}
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Threshold:</span>
            <input
              type="range"
              min={30}
              max={80}
              step={5}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={!mergedMarksheet}
              className="h-2 w-32 accent-navy"
            />
            <span className="text-xs font-semibold text-navy">{threshold}%</span>
          </label>
        </div>
      )}

      {mergedMarksheet && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button
              type="button"
              onClick={handleDownloadCoPoPdf}
              disabled={!pdfComponentIds.length}
              className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-dark disabled:opacity-50"
            >
              Download CO &amp; PO
            </button>
            {completedComponents.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setPdfMessage('')
                  setPdfComponentIds([...completedComponents])
                }}
                className="text-xs font-medium text-navy hover:underline"
              >
                Select all ready
              </button>
            )}
          </div>
          <p className="mt-3 text-xs font-medium text-slate-600">
            Components with completed mark entry — select one or more for the PDF:
          </p>
          {completedComponents.length === 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              No components with saved marks yet. Enter marks in the mark sheet and save first.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {completedComponents.map((aid) => {
                const label = assessmentLabelFor(mergedMarksheet, aid)
                const selected = pdfComponentIds.includes(aid)
                return (
                  <label
                    key={`pdf-${aid}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
                      selected
                        ? 'border-navy bg-white font-semibold text-navy shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => togglePdfComponent(aid)}
                      className="rounded accent-navy"
                    />
                    <span>{label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      <span aria-hidden>✓</span> marks entered
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          {pdfMessage && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{pdfMessage}</p>
          )}
        </div>
      )}

      {mergedMarksheet && completedComponents.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Components with marks entered — select one or more ({completedComponents.length})
            </p>
            <button
              type="button"
              onClick={() => setSelectedComponentIds([...completedComponents])}
              className="text-xs font-medium text-navy hover:underline"
            >
              Select all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {completedComponents.map((aid) => {
              const label = assessmentLabelFor(mergedMarksheet, aid)
              const selected = selectedComponentIds.includes(aid)
              return (
                <label
                  key={aid}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? 'border-navy bg-navy text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleComponent(aid)}
                    className={`rounded focus:ring-navy ${
                      selected ? 'border-white accent-white' : 'border-slate-300 text-navy'
                    }`}
                  />
                  {label}
                </label>
              )
            })}
          </div>
          {completedComponents.length >= 2 && selectedComponentIds.length < 2 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Select <strong>two or more</strong> components to see combined CO/PO and the{' '}
              <strong>Overall</strong> column (addition of selected components).
            </p>
          )}
        </div>
      )}

      {mergedMarksheet && completedComponents.length === 0 && (
        <p className="mt-4 text-sm text-amber-700">
          No marks entered yet for this course. Open the mark entry sheet, enter marks, save, then
          click Refresh.
        </p>
      )}

      {mergedMarksheet && selectedComponentIds.length > 0 && (
        <div className="mt-6">
          {report ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Detailed view (all selected components side by side)
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {report.studentsWithMarks} student(s) · Question marks, CO/PO per component,
                    combined overall, and class averages
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSubmitToHod}
                    disabled={submitting || !summaryExport}
                    className="rounded-full border border-navy bg-white px-4 py-2 text-xs font-semibold text-navy hover:bg-navy/5 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting…' : 'Submit to HOD'}
                  </button>
                </div>
              </div>

              {submitMessage && (
                <p
                  className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                    submitMessage.toLowerCase().includes('fail') ||
                    submitMessage.toLowerCase().includes('save')
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {submitMessage}
                </p>
              )}

              <ExcelConsolidatedTable report={report} />
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
              Select at least one component with saved marks to calculate CO/PO.
            </p>
          )}
        </div>
      )}

      {mergedMarksheet && completedComponents.length > 0 && selectedComponentIds.length === 0 && (
        <p className="mt-4 text-sm text-amber-700">Select at least one component to calculate CO/PO.</p>
      )}
    </section>
  )
}
