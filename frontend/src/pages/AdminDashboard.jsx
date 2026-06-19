import { useCallback, useEffect, useState } from 'react'
import AdminDetailPanel from '../components/AdminDetailPanel'
import DashboardLayout from '../components/DashboardLayout'
import StatCard from '../components/StatCard'
import { adminAPI, dashboardAPI } from '../services/api'

const SECTIONS = [
  { id: 'hods', label: 'HODs', type: 'HOD' },
  { id: 'faculty', label: 'Faculty', type: 'Faculty' },
  { id: 'courses', label: 'Courses', type: 'Course' },
  { id: 'departments', label: 'Departments', type: 'Department' },
]

const ADD_LABELS = {
  hods: 'Add HOD',
  faculty: 'Add Faculty',
  courses: 'Add Course',
  departments: 'Add Department',
}

function itemLabel(section, item) {
  if (section === 'departments') return item.name
  if (section === 'courses') return `${item.course_code} — ${item.name}`
  return item.full_name || item.name
}

function formFromItem(section, item) {
  const base = { ...item, password: '' }
  if (section !== 'departments') {
    base.department_id = item.department_id || ''
    base.name = item.full_name || item.name
  }
  return base
}

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState('hods')
  const [stats, setStats] = useState(null)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [form, setForm] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sectionMeta = SECTIONS.find((s) => s.id === activeSection)

  const loadItems = useCallback(async () => {
    try {
      let res
      if (activeSection === 'hods') res = await adminAPI.listHods()
      else if (activeSection === 'faculty') res = await adminAPI.listFaculty()
      else if (activeSection === 'courses') res = await adminAPI.listCourses()
      else res = await adminAPI.listDepartments()

      const key =
        activeSection === 'hods'
          ? 'hods'
          : activeSection === 'faculty'
            ? 'faculty'
            : activeSection === 'courses'
              ? 'courses'
              : 'departments'
      setItems(res.data[key] || [])
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data.')
    }
  }, [activeSection])

  const loadStats = useCallback(async () => {
    const res = await dashboardAPI.admin()
    setStats(res.data.stats)
  }, [])

  useEffect(() => {
    setSelected(null)
    setPanelMode(null)
    setError('')
    setMessage('')
    loadItems()
    loadStats()
  }, [activeSection, loadItems, loadStats])

  const openAdd = () => {
    setSelected(null)
    setPanelMode('add')
    setError('')
    if (activeSection === 'departments') {
      setForm({ name: '', code: '', degree: 'B.Tech', duration: '4', status: 'active' })
    } else if (activeSection === 'hods') {
      setForm({
        employee_id: '',
        name: '',
        email: '',
        mobile: '',
        designation: 'hod',
        is_active: true,
        password: '',
        department_id: '',
        department: '',
      })
    } else if (activeSection === 'faculty') {
      setForm({
        employee_id: '',
        name: '',
        email: '',
        mobile: '',
        designation: 'faculty',
        is_active: true,
        password: '',
        department_id: '',
        department: '',
      })
    } else {
      setForm({
        course_code: '',
        name: '',
        regulation: '',
        department_id: '',
        department: '',
      })
    }
  }

  const openItem = (item) => {
    setSelected(item)
    setPanelMode('view')
    setForm(formFromItem(activeSection, item))
  }

  const openEdit = (item) => {
    setSelected(item)
    setPanelMode('edit')
    setForm(formFromItem(activeSection, item))
  }

  const handlePanelAction = async (action) => {
    if (action === 'edit') {
      setPanelMode('edit')
      return
    }

    if (action === 'delete') {
      await handleDelete(selected)
      return
    }

    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const payload = { ...form }
      if (payload.name && !payload.full_name) payload.full_name = payload.name

      if (['hods', 'faculty', 'courses'].includes(activeSection)) {
        if (!payload.department_id && !payload.department?.trim()) {
          setError('Please select a department from the dropdown.')
          setSubmitting(false)
          return
        }
        if (payload.department_id) {
          payload.department_id = Number(payload.department_id)
        }
      }

      if (activeSection === 'hods') {
        if (panelMode === 'add') await adminAPI.addHod(payload)
        else await adminAPI.updateHod(selected.id, payload)
      } else if (activeSection === 'faculty') {
        if (panelMode === 'add') await adminAPI.addFaculty(payload)
        else await adminAPI.updateFaculty(selected.id, payload)
      } else if (activeSection === 'courses') {
        if (panelMode === 'add') await adminAPI.addCourse(payload)
        else await adminAPI.updateCourse(selected.id, payload)
      } else if (activeSection === 'departments') {
        if (panelMode === 'add') await adminAPI.addDepartment(payload)
        else
          await adminAPI.updateDepartment(selected.id, {
            name: payload.name,
            code: payload.code,
            degree: payload.degree,
            duration: parseInt(payload.duration, 10),
            status: payload.status,
          })
      }

      setMessage(panelMode === 'add' ? 'Added successfully.' : 'Updated successfully.')
      setPanelMode(null)
      setSelected(null)
      await loadItems()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Operation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item) => {
    if (!item?.id) return
    if (
      !window.confirm(
        `Delete "${itemLabel(activeSection, item)}"?\n\nThis action cannot be undone.`,
      )
    ) {
      return
    }

    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      if (activeSection === 'hods') await adminAPI.deleteHod(item.id)
      else if (activeSection === 'faculty') await adminAPI.deleteFaculty(item.id)
      else if (activeSection === 'courses') await adminAPI.deleteCourse(item.id)
      else await adminAPI.deleteDepartment(item.id)

      setMessage('Deleted successfully.')
      setPanelMode(null)
      setSelected(null)
      await loadItems()
      await loadStats()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" showLogo>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="HODs"
          value={stats?.total_hods ?? '—'}
          onClick={() => setActiveSection('hods')}
        />
        <StatCard
          label="Faculty"
          value={stats?.total_faculty ?? '—'}
          accent="bg-blue-600"
          onClick={() => setActiveSection('faculty')}
        />
        <StatCard
          label="Courses"
          value={stats?.total_courses ?? '—'}
          accent="bg-emerald-600"
          onClick={() => setActiveSection('courses')}
        />
        <StatCard
          label="Departments"
          value={stats?.departments ?? '—'}
          accent="bg-amber-500"
          onClick={() => setActiveSection('departments')}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeSection === sec.id
                ? 'bg-navy text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {sec.label}
          </button>
        ))}
        <button
          type="button"
          onClick={openAdd}
          className="ml-auto rounded-full border border-navy px-4 py-2 text-sm font-medium text-navy hover:bg-navy hover:text-white"
        >
          + {ADD_LABELS[activeSection] || 'Add New'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <h2 className="mb-1 text-lg font-semibold text-slate-800">{sectionMeta?.label}</h2>
          <p className="mb-4 text-sm text-slate-500">
            Click a row to view · Use Edit or Delete to update or remove
          </p>
          <ItemList
            section={activeSection}
            items={items}
            onSelect={openItem}
            onEdit={openEdit}
            onDelete={handleDelete}
            selectedId={selected?.id}
          />
        </section>

        {panelMode && (
          <AdminDetailPanel
            type={sectionMeta?.type}
            mode={panelMode}
            form={form}
            setForm={setForm}
            submitting={submitting}
            onSubmit={handlePanelAction}
            onDelete={() => handleDelete(selected)}
            onCancel={() => {
              setPanelMode(null)
              setSelected(null)
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

function ItemList({ section, items, onSelect, onEdit, onDelete, selectedId }) {
  if (!items.length) {
    return (
      <p className="text-sm text-slate-500">
        No records yet. Click &quot;Add&quot; above to create one.
      </p>
    )
  }

  return (
    <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
      {items.map((item) => (
        <li
          key={item.id}
          className={`flex overflow-hidden rounded-lg border transition ${
            selectedId === item.id ? 'border-navy bg-slate-50' : 'border-slate-100'
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="min-w-0 flex-1 p-4 text-left hover:bg-slate-50/80"
          >
            {section === 'hods' || section === 'faculty' ? (
              <>
                <p className="font-medium text-slate-800">{item.full_name}</p>
                <p className="text-sm text-slate-500">
                  {item.employee_id} · {item.email}
                </p>
                <p className="text-xs text-slate-400">
                  {item.department} · {item.is_active === false ? 'Inactive' : 'Active'}
                </p>
              </>
            ) : section === 'courses' ? (
              <>
                <p className="font-medium text-navy">{item.course_code}</p>
                <p className="text-sm text-slate-700">{item.name}</p>
                <p className="text-xs text-slate-400">
                  {item.regulation} · {item.department} · Staff:{' '}
                  {item.staff?.map((s) => s.full_name).join(', ') || 'None'}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-400">
                  {item.code} · {item.degree} · {item.duration}y · {item.status}
                </p>
                <p className="text-xs text-slate-400">
                  HOD: {item.hod_count} · Faculty: {item.faculty_count} · Courses:{' '}
                  {item.course_count}
                </p>
              </>
            )}
          </button>
          <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-slate-100 bg-white px-2 py-2">
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/10"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
