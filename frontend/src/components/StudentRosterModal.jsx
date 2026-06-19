import { useEffect, useMemo, useState } from 'react'
import FormField from './FormField'
import SelectField from './SelectField'
import { facultyAPI } from '../services/api'
import { semesterAfterYearChange, semesterOptionsForYear } from '../utils/academicTerms'

function emptyStudentRow() {
  return { register_number: '', full_name: '' }
}

function branchFromDegree(degree, branches = []) {
  if (degree === 'B.E' && branches.includes('Bachelor of Engineering')) {
    return 'Bachelor of Engineering'
  }
  if (branches.includes('Bachelor of Technology')) {
    return 'Bachelor of Technology'
  }
  return branches[0] || ''
}

export default function StudentRosterModal({
  open,
  onClose,
  onSaved,
  defaultDepartment,
  defaultBranch,
  defaultYear,
  defaultSemester,
  config,
}) {
  const [form, setForm] = useState({
    branch: defaultBranch || '',
    department: defaultDepartment || '',
    year: defaultYear ? String(defaultYear) : '',
    semester: defaultSemester ? String(defaultSemester) : '',
  })
  const [students, setStudents] = useState([emptyStudentRow()])
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savedRosters, setSavedRosters] = useState([])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setError('')
    setMessage('')
    setInitializing(true)

    facultyAPI
      .rosterSummary()
      .then((res) => {
        if (cancelled) return
        const rosters = res.data.rosters || []
        setSavedRosters(rosters)

        const sorted = [...rosters].sort(
          (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
        )
        const latest = sorted[0]

        if (latest) {
          setForm({
            branch: latest.branch,
            department: latest.department,
            year: String(latest.year),
            semester: String(latest.semester),
          })
        } else {
          const year = defaultYear ? String(defaultYear) : ''
          setForm({
            branch: defaultBranch || '',
            department: defaultDepartment || '',
            year,
            semester: defaultSemester
              ? String(defaultSemester)
              : semesterAfterYearChange(year, ''),
          })
        }
      })
      .catch(() => {
        if (cancelled) return
        const year = defaultYear ? String(defaultYear) : ''
        setForm({
          branch: defaultBranch || '',
          department: defaultDepartment || '',
          year,
          semester: defaultSemester
            ? String(defaultSemester)
            : semesterAfterYearChange(year, ''),
        })
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, defaultBranch, defaultDepartment, defaultYear, defaultSemester])

  useEffect(() => {
    if (!open || initializing) return
    setError('')
    setMessage('')
    if (!form.branch || !form.department || !form.year || !form.semester) return

    setLoading(true)
    facultyAPI
      .getStudentRoster({
        branch: form.branch,
        department: form.department,
        year: form.year,
        semester: form.semester,
      })
      .then((res) => {
        const list = res.data.students || []
        setStudents(list.length ? list : [emptyStudentRow()])
      })
      .catch((err) => {
        setStudents([emptyStudentRow()])
        setError(err.response?.data?.message || 'Could not load saved class list.')
      })
      .finally(() => setLoading(false))
  }, [open, initializing, form.branch, form.department, form.year, form.semester])

  const departmentOptions = useMemo(() => {
    const list = [...(config?.departments || [])]
    for (const name of [form.department, defaultDepartment]) {
      if (name && !list.includes(name)) {
        list.unshift(name)
      }
    }
    for (const roster of savedRosters) {
      if (roster.department && !list.includes(roster.department)) {
        list.push(roster.department)
      }
    }
    return list.map((d) => ({ value: d, label: d }))
  }, [config?.departments, defaultDepartment, form.department, savedRosters])

  if (!open) return null

  const semesterOptions = semesterOptionsForYear(form.year)

  const setCount = (count) => {
    const n = Math.min(200, Math.max(1, parseInt(count, 10) || 0))
    setStudents((prev) => {
      if (prev.length === n) return prev
      if (prev.length < n) {
        return [...prev, ...Array.from({ length: n - prev.length }, emptyStudentRow)]
      }
      return prev.slice(0, n)
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!form.branch || !form.department || !form.year || !form.semester) {
      setError('Select branch, department, year, and semester.')
      return
    }
    setSaving(true)
    try {
      await facultyAPI.saveStudentRoster({
        branch: form.branch,
        department: form.department,
        year: parseInt(form.year, 10),
        semester: parseInt(form.semester, 10),
        students: students.filter(
          (s) => s.full_name?.trim() || s.register_number?.trim(),
        ),
      })
      setMessage(`Saved ${students.filter((s) => s.full_name?.trim()).length} student(s).`)
      onSaved?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save class list.')
    } finally {
      setSaving(false)
    }
  }

  const loadSavedRoster = (roster) => {
    setForm({
      branch: roster.branch,
      department: roster.department,
      year: String(roster.year),
      semester: String(roster.semester),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">My Class Student List</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save names and register numbers once. They auto-fill every new mark sheet for this
              class.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-navy">
            Close
          </button>
        </div>

        {savedRosters.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Saved class lists
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {savedRosters.map((roster) => (
                <button
                  key={roster.id}
                  type="button"
                  onClick={() => loadSavedRoster(roster)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    form.branch === roster.branch &&
                    form.department === roster.department &&
                    form.year === String(roster.year) &&
                    form.semester === String(roster.semester)
                      ? 'bg-navy text-white'
                      : 'bg-white text-navy ring-1 ring-navy/30 hover:bg-navy/5'
                  }`}
                >
                  {roster.department} · Year {roster.year} · Sem {roster.semester} ({roster.count}{' '}
                  students)
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {message && (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
        )}

        <form
          onSubmit={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target?.type !== 'submit') {
              e.preventDefault()
            }
          }}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Branch"
              id="roster_branch"
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              options={(config?.branches || []).map((b) => ({ value: b, label: b }))}
            />
            <SelectField
              label="Department"
              id="roster_department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              options={departmentOptions}
            />
            <SelectField
              label="Year"
              id="roster_year"
              value={form.year}
              onChange={(e) => {
                const year = e.target.value
                setForm((f) => ({
                  ...f,
                  year,
                  semester: semesterAfterYearChange(year, f.semester),
                }))
              }}
              options={(config?.years || []).map((y) => ({ value: String(y), label: `Year ${y}` }))}
            />
            <SelectField
              label="Semester"
              id="roster_semester"
              value={form.semester}
              onChange={(e) => setForm({ ...form, semester: e.target.value })}
              disabled={!form.year}
              options={
                semesterOptions.length
                  ? semesterOptions
                  : [{ value: '', label: 'Select year first' }]
              }
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <FormField
              label="Number of students"
              id="roster_count"
              type="number"
              value={String(students.length)}
              onChange={(e) => setCount(e.target.value)}
              placeholder="e.g. 30 or 50"
            />
            <button
              type="button"
              onClick={() => setStudents((prev) => [...prev, emptyStudentRow()])}
              className="rounded-full border border-navy px-4 py-2 text-sm font-medium text-navy"
            >
              + Add row
            </button>
          </div>

          {initializing || loading ? (
            <p className="text-sm text-slate-500">
              {initializing ? 'Loading your saved class lists…' : 'Loading saved list…'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">S.No</th>
                    <th className="px-3 py-2 text-left">Register No.</th>
                    <th className="px-3 py-2 text-left">Student Name</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {students.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.register_number || ''}
                          onChange={(e) => {
                            const next = [...students]
                            next[i] = {
                              ...next[i],
                              register_number: e.target.value.toUpperCase(),
                            }
                            setStudents(next)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (i === students.length - 1) {
                                setStudents([...students, emptyStudentRow()])
                              }
                            }
                          }}
                          placeholder="e.g. 2024CSE001"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.full_name || ''}
                          onChange={(e) => {
                            const next = [...students]
                            next[i] = { ...next[i], full_name: e.target.value }
                            setStudents(next)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (i === students.length - 1) {
                                setStudents([...students, emptyStudentRow()])
                              }
                            }
                          }}
                          placeholder="Student name"
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {students.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setStudents(students.filter((_, idx) => idx !== i))
                            }
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-slate-300 py-2.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading || initializing}
              className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Class List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Export helper for dashboard defaults
export { branchFromDegree }
