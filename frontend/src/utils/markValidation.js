/** Validate mark entry: empty, 0, or whole number 1..maxMark (inclusive). */

export function maxMarkForQuestion(questionMarks, qIndex) {
  const m = parseFloat(questionMarks?.[qIndex])
  return Number.isNaN(m) ? 0 : m
}

export function validateMarkInput(raw, maxMark) {
  if (raw === '' || raw === null || raw === undefined) {
    return { value: '', error: null }
  }
  const trimmed = String(raw).trim()
  const num = Number(trimmed)
  if (trimmed === '' || Number.isNaN(num)) {
    return { value: trimmed, error: `Enter a number from 0 to ${maxMark}.` }
  }
  if (num < 0 || num > maxMark) {
    return {
      value: trimmed,
      error: `Mark must be between 0 and ${maxMark}.`,
    }
  }
  return { value: String(num), error: null }
}

export function validateAllMarks(rows, components, numQuestions, questionMarks) {
  for (let r = 0; r < rows.length; r++) {
    for (const aid of components) {
      const marks = rows[r].assessment_marks?.[aid] || []
      for (let q = 0; q < numQuestions; q++) {
        const max = maxMarkForQuestion(questionMarks, q)
        const { error } = validateMarkInput(marks[q], max)
        if (error) {
          return `Row ${r + 1}, ${aid}: Q${q + 1} — ${error}`
        }
      }
    }
  }
  return null
}
