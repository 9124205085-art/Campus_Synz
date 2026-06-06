export default function CoDonutChart({ distribution }) {
  const { met = 0, moderate = 0, low = 0, total = 0 } = distribution || {}
  const safeTotal = total || met + moderate + low || 1

  const segments = [
    { label: 'Met Target (≥70%)', count: met, color: '#10b981', pct: (met / safeTotal) * 100 },
    { label: 'Moderate (50–70%)', count: moderate, color: '#f59e0b', pct: (moderate / safeTotal) * 100 },
    { label: 'Low (<50%)', count: low, color: '#ef4444', pct: (low / safeTotal) * 100 },
  ]

  let offset = 0
  const gradientParts = segments
    .filter((s) => s.pct > 0)
    .map((s) => {
      const part = `${s.color} ${offset}% ${offset + s.pct}%`
      offset += s.pct
      return part
    })
  const gradient =
    gradientParts.length > 0
      ? `conic-gradient(${gradientParts.join(', ')})`
      : 'conic-gradient(#e2e8f0 0% 100%)'

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-slate-800">CO Attainment Distribution</h3>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
        <div
          className="relative h-40 w-40 shrink-0 rounded-full"
          style={{ background: gradient }}
        >
          <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-2xl font-bold text-navy">{total}</span>
            <span className="text-xs text-slate-500">courses</span>
          </div>
        </div>
        <ul className="space-y-3 text-sm">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-slate-600">
                {s.label}: <strong>{s.count}</strong> ({((s.count / safeTotal) * 100).toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
