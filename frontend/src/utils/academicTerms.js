/** Semesters allowed for each academic year (Anna University style). */
const YEAR_SEMESTER_MAP = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
}

export function semestersForYear(year) {
  const y = parseInt(year, 10)
  if (!y || !YEAR_SEMESTER_MAP[y]) return []
  return [...YEAR_SEMESTER_MAP[y]]
}

export function semesterOptionsForYear(year) {
  return semestersForYear(year).map((s) => ({
    value: String(s),
    label: `Semester ${s}`,
  }))
}

/** Keep semester if still valid after year change; otherwise default to first allowed semester. */
export function semesterAfterYearChange(year, currentSemester) {
  const allowed = semestersForYear(year)
  const sem = parseInt(currentSemester, 10)
  if (sem && allowed.includes(sem)) return String(sem)
  if (allowed.length) return String(allowed[0])
  return ''
}
