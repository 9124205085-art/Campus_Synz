import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ComponentSummaryTable,
  ExcelConsolidatedTable,
} from '../faculty/ComponentAttainmentPanel'
import { hodAPI } from '../../services/api'
import {
  buildCourseReportFromMarksheets,
  buildYearStudentOverallReport,
} from '../../utils/coPoAttainment'

function YearOverallTable({ yearReport }) {
  if (!yearReport?.students?.length) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No student mark data yet for this year.
      </p>
    )
  }

  const { courses, students } = yearReport

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
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
              className="sticky left-[88px] z-20 border border-slate-300 bg-slate-200 px-2 py-2 text-left font-semibold"
            >
              Student Name
            </th>
            {courses.map((c) => (
              <th
                key={c.code}
                colSpan={2}
                className="border border-slate-300 px-2 py-2 text-center text-sm font-bold text-navy"
              >
                {c.code}
                <span className="mt-0.5 block text-[10px] font-normal text-slate-600">
                  {c.name}
                </span>
              </th>
            ))}
            <th
              colSpan={2}
              className="border border-slate-300 bg-violet-200 px-2 py-2 text-center text-sm font-bold text-violet-950"
            >
              Year average
            </th>
          </tr>
          <tr className="bg-slate-50 text-[10px] font-semibold text-slate-600">
            {courses.map((c) => (
              <Fragment key={c.code}>
                <th className="border border-slate-300 px-1 py-1">CO %</th>
                <th className="border border-slate-300 px-1 py-1">PO %</th>
              </Fragment>
            ))}
            <th className="border border-slate-300 bg-violet-100/80 px-1 py-1">CO %</th>
            <th className="border border-slate-300 bg-violet-100/80 px-1 py-1">PO %</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => (
            <tr key={s.register_number || s.student_name || idx} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
              <td className="sticky left-0 z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-mono">
                {s.register_number || '—'}
              </td>
              <td className="sticky left-[88px] z-10 border border-slate-200 bg-inherit px-2 py-1.5 font-medium">
                {s.student_name || '—'}
              </td>
              {courses.map((c) => {
                const cell = s.byCourse[c.code]
                return (
                  <Fragment key={`${c.code}-${s.register_number || idx}`}>
                    <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">
                      {cell?.coPct != null ? `${cell.coPct}%` : '—'}
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">
                      {cell?.poPct != null ? `${cell.poPct}%` : '—'}
                    </td>
                  </Fragment>
                )
              })}
              <td className="border border-slate-200 bg-violet-50/40 px-2 py-1.5 text-center font-semibold tabular-nums text-navy">
                {s.yearAvgCo != null ? `${s.yearAvgCo}%` : '—'}
              </td>
              <td className="border border-slate-200 bg-violet-50/40 px-2 py-1.5 text-center font-semibold tabular-nums text-navy">
                {s.yearAvgPo != null ? `${s.yearAvgPo}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
        Overall student performance across all assigned courses in this year — averaged CO % and PO %
        per course and for the year.
      </p>
    </div>
  )
}

export default function HodCoAttainmentModal({ open, onClose, mode, course, year, semester }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [threshold, setThreshold] = useState(60)
  const [coursePayload, setCoursePayload] = useState(null)
  const [yearPayload, setYearPayload] = useState(null)

  useEffect(() => {
    if (!open) {
      setCoursePayload(null)
      setYearPayload(null)
      setError('')
      return
    }

    setLoading(true)
    setError('')

    const request =
      mode === 'course' && course?.assignment_id
        ? hodAPI.getCourseCoAttainment(course.assignment_id)
        : mode === 'year' && year
          ? hodAPI.getYearCoAttainment(year, semester)
          : Promise.reject(new Error('Invalid view'))

    request
      .then((res) => {
        if (mode === 'course') setCoursePayload(res.data)
        else setYearPayload(res.data)
      })
      .catch((err) => {
        setError(err.response?.data?.message || err.message || 'Could not load mark list.')
      })
      .finally(() => setLoading(false))
  }, [open, mode, course?.assignment_id, year, semester])

  const courseReportBundle = useMemo(() => {
    if (!coursePayload?.marksheets?.length) return null
    return buildCourseReportFromMarksheets(coursePayload.marksheets, threshold)
  }, [coursePayload, threshold])

  const yearReport = useMemo(() => {
    if (!yearPayload?.courses?.length) return null
    const courseReports = yearPayload.courses.map((c) => ({
      course_code: c.course_code,
      course_name: c.course_name,
      report: buildCourseReportFromMarksheets(c.marksheets || [], threshold)?.report,
    }))
    return buildYearStudentOverallReport(courseReports)
  }, [yearPayload, threshold])

  if (!open) return null

  const title =
    mode === 'course' && coursePayload
      ? `${coursePayload.course_code} — ${coursePayload.course_name}`
      : mode === 'year'
        ? `Year ${year}${semester ? ` · Semester ${semester}` : ''} — Overall CO/PO`
        : 'CO / PO Attainment'

  const subtitle =
    mode === 'course' && coursePayload
      ? `Faculty: ${coursePayload.faculty_name || '—'} · Year ${coursePayload.year} · Sem ${coursePayload.semester ?? '—'}`
      : mode === 'year' && yearPayload
        ? `${yearPayload.course_count} course(s) in this year`
        : ''

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Threshold
              <input
                type="range"
                min={30}
                max={80}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="h-2 w-24 accent-navy"
              />
              <span className="font-semibold text-navy">{threshold}%</span>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {loading && (
            <p className="py-12 text-center text-sm text-slate-500">Loading mark list…</p>
          )}

          {!loading && mode === 'course' && !coursePayload?.marksheets?.length && !error && (
            <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No saved marks yet for this course. The assigned faculty must create a mark sheet,
              enter marks, and save.
            </p>
          )}

          {!loading && mode === 'course' && courseReportBundle && (
            <>
              <ComponentSummaryTable summaryExport={courseReportBundle.summaryExport} />
              <div className="mb-3 mt-6">
                <p className="text-sm font-semibold text-slate-800">Detailed mark list</p>
                <p className="text-xs text-slate-500">
                  Question marks, CO and PO per component, and overall attainment
                </p>
              </div>
              <ExcelConsolidatedTable report={courseReportBundle.report} />
            </>
          )}

          {!loading && mode === 'course' && coursePayload?.marksheets?.length && !courseReportBundle && !error && (
            <p className="rounded-lg bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
              Mark sheets exist but no component marks have been entered yet.
            </p>
          )}

          {!loading && mode === 'year' && !yearPayload?.courses?.length && !error && (
            <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No courses assigned for Year {year}.
            </p>
          )}

          {!loading && mode === 'year' && yearPayload?.courses?.length && (
            <YearOverallTable yearReport={yearReport} />
          )}
        </div>
      </div>
    </div>
  )
}
