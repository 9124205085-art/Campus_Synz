const TARGET = 70

export default function CoBarChart({ data = [], courseFilter, onCourseFilterChange, courses = [] }) {
  const maxVal = Math.max(100, ...data.map((d) => d.pct), TARGET)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800">CO Attainment Overview</h3>
        <select
          value={courseFilter}
          onChange={(e) => onCourseFilterChange(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.course_code}
            </option>
          ))}
        </select>
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Save mark sheets with marks to see CO attainment charts.
        </p>
      ) : (
        <div className="relative flex h-56 items-end gap-3 border-b border-slate-200 pb-8 pt-6">
          <div
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-red-400"
            style={{ bottom: `${(TARGET / maxVal) * 100}%` }}
          />
          <span
            className="absolute text-[10px] font-medium text-red-500"
            style={{ bottom: `calc(${(TARGET / maxVal) * 100}% + 4px)`, right: 0 }}
          >
            Target ({TARGET}%)
          </span>

          {data.map((item) => {
            const h = (item.pct / maxVal) * 100
            const met = item.pct >= TARGET
            return (
              <div key={item.co} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">{item.pct}%</span>
                <div
                  className={`w-full max-w-[48px] rounded-t-md transition-all ${
                    met ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ height: `${Math.max(h, 4)}%` }}
                  title={`${item.co}: ${item.pct}%`}
                />
                <span className="text-xs font-medium text-navy">{item.co}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
