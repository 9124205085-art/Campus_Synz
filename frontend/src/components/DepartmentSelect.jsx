import { useEffect, useState } from 'react'
import { adminAPI } from '../services/api'

/**
 * Department dropdown — links HOD, faculty, and courses by department_id.
 * @param allowCreate - if false, admin must pick existing department (recommended)
 */
export default function DepartmentSelect({
  value,
  onChange,
  label = 'Department',
  allowCreate = false,
}) {
  const [departments, setDepartments] = useState([])
  const [customMode, setCustomMode] = useState(false)

  useEffect(() => {
    adminAPI
      .listDepartments()
      .then((res) => setDepartments(res.data.departments))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    if (value?.department_id) {
      setCustomMode(false)
    }
  }, [value?.department_id])

  const handleSelectChange = (e) => {
    const selected = e.target.value
    if (selected === '__new__') {
      setCustomMode(true)
      onChange({ department_id: '', department: '' })
      return
    }
    setCustomMode(false)
    const dept = departments.find((d) => String(d.id) === selected)
    onChange({
      department_id: selected ? Number(selected) : '',
      department: dept?.name || '',
    })
  }

  const handleCustomChange = (e) => {
    onChange({ department_id: '', department: e.target.value })
  }

  if (!allowCreate || !customMode) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
        <select
          value={value.department_id ? String(value.department_id) : ''}
          onChange={handleSelectChange}
          required
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        >
          <option value="" disabled>
            Select department (same for HOD, staff & course)
          </option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
          {allowCreate && <option value="__new__">+ Add new department</option>}
        </select>
        {value.department_id && (
          <p className="mt-1 text-xs text-emerald-600">
            Linked to department ID {value.department_id}
            {value.department ? ` — ${value.department}` : ''}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          HOD will see all faculty and courses with this exact department.
        </p>
        {allowCreate && (
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className="mt-2 text-xs text-navy hover:underline"
          >
            Or type a new department name
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="text"
        value={value.department || ''}
        onChange={handleCustomChange}
        placeholder="e.g. B.Tech Information Technology"
        required
        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
      <button
        type="button"
        onClick={() => setCustomMode(false)}
        className="mt-2 text-xs text-navy hover:underline"
      >
        Choose from existing departments
      </button>
    </div>
  )
}
