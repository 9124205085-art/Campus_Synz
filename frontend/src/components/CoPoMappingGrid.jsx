import { MAPPING_LEVEL_OPTIONS, PO_OPTIONS } from '../utils/coPoAttainment'

export default function CoPoMappingGrid({ usedCos, mapping, onChange, readOnly = false }) {
  if (!usedCos?.length) {
    return (
      <p className="text-sm text-slate-500">
        Configure question COs above to set up the CO–PO mapping matrix.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Set how each CO contributes to each PO. This mapping is used to calculate PO attainment.
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
          <span className="rounded bg-violet-100 px-2 py-0.5">3 = High</span>
          <span className="rounded bg-violet-100 px-2 py-0.5">2 = Medium</span>
          <span className="rounded bg-violet-100 px-2 py-0.5">1 = Low</span>
          <span className="rounded bg-violet-100 px-2 py-0.5">0 = No mapping</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-violet-200 bg-violet-50/30">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-violet-100/80">
              <th className="sticky left-0 z-10 bg-violet-100 px-3 py-2 text-left font-semibold text-violet-900">
                CO–PO MAPPING
              </th>
              {PO_OPTIONS.map((po) => (
                <th key={po} className="px-2 py-2 text-center font-semibold text-violet-800">
                  {po}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usedCos.map((co) => (
              <tr key={co} className="border-t border-violet-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-navy">{co}</td>
                {PO_OPTIONS.map((po) => (
                  <td key={po} className="px-1 py-1.5 text-center">
                    {readOnly ? (
                      <span className="inline-block min-w-[28px] rounded bg-white px-1 py-0.5 tabular-nums">
                        {mapping?.[co]?.[po] ?? 0}
                      </span>
                    ) : (
                      <select
                        value={mapping?.[co]?.[po] ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          onChange(co, po, val)
                        }}
                        className="w-full min-w-[44px] rounded border border-violet-200 bg-white px-1 py-1 text-center"
                      >
                        {MAPPING_LEVEL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
        This mapping will be used to calculate PO attainment from CO attainment after marks entry.
      </p>
    </div>
  )
}
