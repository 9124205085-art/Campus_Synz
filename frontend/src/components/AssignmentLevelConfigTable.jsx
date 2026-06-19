import {
  ASSIGNMENT_LEVELS,
  ASSIGNMENT_LEVEL_LABELS,
  DEFAULT_LEVEL_THRESHOLDS,
  levelConfigFromQuestions,
  levelQuestionCount,
  questionsFromLevelConfig,
  referenceComponentKey,
} from '../utils/assignmentLevels'

export default function AssignmentLevelConfigTable({
  levels = {},
  coOptions = ['CO1'],
  markOptions = ['2'],
  onChange,
  title,
  availableReferences = [],
  referenceComponents = [],
  onReferenceChange,
  levelThresholds = DEFAULT_LEVEL_THRESHOLDS,
  onThresholdsChange,
}) {
  const updateNumQuestions = (level, count) => {
    const n = Math.min(50, Math.max(1, parseInt(count, 10) || 1))
    const qs = questionsFromLevelConfig(levels[level])
    const padded = Array.from({ length: n }, (_, i) =>
      qs[i] || { co: coOptions[0] || 'CO1', marks: markOptions[0] || '2' },
    )
    onChange(level, levelConfigFromQuestions(padded, n))
  }

  const updateQuestion = (level, qIndex, field, value) => {
    const n = levelQuestionCount(levels[level]) || 1
    const qs = questionsFromLevelConfig(levels[level])
    while (qs.length < n) {
      qs.push({ co: coOptions[0] || 'CO1', marks: markOptions[0] || '2' })
    }
    qs[qIndex] = { ...qs[qIndex], [field]: value }
    onChange(level, levelConfigFromQuestions(qs, n))
  }

  const toggleReference = (ref) => {
    if (!onReferenceChange) return
    const key = referenceComponentKey(ref)
    const selected = referenceComponents.some((r) => referenceComponentKey(r) === key)
    if (selected) {
      onReferenceChange(referenceComponents.filter((r) => referenceComponentKey(r) !== key))
    } else {
      onReferenceChange([
        ...referenceComponents,
        {
          marksheet_id: ref.marksheet_id,
          component_id: ref.component_id,
          label: ref.label,
        },
      ])
    }
  }

  return (
    <div className="space-y-4">
      {title && <h4 className="text-sm font-semibold text-navy">{title}</h4>}

      {ASSIGNMENT_LEVELS.map((level) => {
        const n = levelQuestionCount(levels[level]) || 5
        return (
          <div key={level} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-3 flex flex-wrap items-end gap-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                {ASSIGNMENT_LEVEL_LABELS[level]} level
              </p>
              <label className="text-xs text-slate-600">
                Number of questions
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={n}
                  onChange={(e) => updateNumQuestions(level, e.target.value)}
                  className="ml-2 w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Question</th>
                    <th className="px-3 py-2 text-left">CO</th>
                    <th className="px-3 py-2 text-left">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: n }, (_, i) => {
                    const qs = questionsFromLevelConfig(levels[level])
                    const q = qs[i] || { co: coOptions[0] || 'CO1', marks: markOptions[0] || '2' }
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-navy">Q{i + 1}</td>
                        <td className="px-3 py-2">
                          <select
                            value={q.co}
                            onChange={(e) => updateQuestion(level, i, 'co', e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1"
                          >
                            {coOptions.map((co) => (
                              <option key={co} value={co}>
                                {co}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={q.marks}
                            onChange={(e) => updateQuestion(level, i, 'marks', e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1"
                          >
                            {markOptions.map((m) => (
                              <option key={m} value={m}>
                                {m} mark{m !== '1' ? 's' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {onReferenceChange && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-900">
            Auto-assign levels from saved mark sheets
          </p>
          <p className="mb-3 text-xs text-slate-600">
            Select one or more saved components (e.g. CA1, CA2). Student average below 50% → Lower;
            50–74% → Middle; 75% and above → Higher.
          </p>
          {onThresholdsChange && (
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
              <label>
                Lower below
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={levelThresholds.lower_max ?? 50}
                  onChange={(e) =>
                    onThresholdsChange({
                      ...levelThresholds,
                      lower_max: parseInt(e.target.value, 10) || 50,
                    })
                  }
                  className="ml-1 w-14 rounded border border-slate-200 px-2 py-1"
                />
                %
              </label>
              <label>
                Middle below
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={levelThresholds.middle_max ?? 75}
                  onChange={(e) =>
                    onThresholdsChange({
                      ...levelThresholds,
                      middle_max: parseInt(e.target.value, 10) || 75,
                    })
                  }
                  className="ml-1 w-14 rounded border border-slate-200 px-2 py-1"
                />
                %
              </label>
            </div>
          )}
          {availableReferences.length === 0 ? (
            <p className="text-sm text-amber-700">
              No saved mark sheets found for this course yet. Save CA1 / CA2 marks first, then
              create the assignment sheet.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {availableReferences.map((ref) => {
                const key = referenceComponentKey(ref)
                const checked = referenceComponents.some((r) => referenceComponentKey(r) === key)
                return (
                  <li key={key}>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked ? 'border-violet-400 bg-white' : 'border-slate-200 bg-white/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReference(ref)}
                        className="rounded border-slate-300 text-violet-700"
                      />
                      <span>{ref.display}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
