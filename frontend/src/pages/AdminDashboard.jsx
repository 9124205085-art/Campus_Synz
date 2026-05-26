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
    loadItems()
    loadStats()
  }, [activeSection, loadItems, loadStats])

  const openAdd = () => {
    setSelected(null)
    setPanelMode('add')
    if (activeSection === 'departments') setForm({ name: '' })
    else setForm({ name: '', email: '', password: '', department_id: '', department: '' })
  }

  const openItem = (item) => {
    setSelected(item)
    setPanelMode('view')
    const base = { ...item }
    if (activeSection !== 'departments') {
      base.department_id = item.department_id || ''
      base.name = item.full_name || item.name
    }
    setForm(base)
  }

  const handlePanelAction = async (action) => {
    if (action === 'edit') {
      setPanelMode('edit')
      return
    }

    if (action === 'delete' || (panelMode === 'view' && action === 'delete')) {
      if (!window.confirm('Are you sure you want to delete this record?')) return
      await handleDelete()
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
        if (panelMode === 'add') await adminAPI.addDepartment({ name: payload.name })
        else await adminAPI.updateDepartment(selected.id, { name: payload.name })
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

  const handleDelete = async () => {
    if (!selected?.id) return
    setSubmitting(true)
    try {
      if (activeSection === 'hods') await adminAPI.deleteHod(selected.id)
      else if (activeSection === 'faculty') await adminAPI.deleteFaculty(selected.id)
      else if (activeSection === 'courses') await adminAPI.deleteCourse(selected.id)
      else await adminAPI.deleteDepartment(selected.id)

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
    <DashboardLayout title="Admin Dashboard" subtitle="Manage HODs, faculty, courses & departments">
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
          + Add New
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">
            {sectionMeta?.label} — click to view details
          </h2>
          <ItemList section={activeSection} items={items} onSelect={openItem} selectedId={selected?.id} />
        </section>

        {panelMode && (
          <AdminDetailPanel
            type={sectionMeta?.type}
            mode={panelMode}
            form={form}
            setForm={setForm}
            submitting={submitting}
            onSubmit={handlePanelAction}
            onDelete={() => handlePanelAction('delete')}
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

function ItemList({ section, items, onSelect, selectedId }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">No records yet. Click &quot;Add New&quot; to create one.</p>
  }

  return (
    <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full rounded-lg border p-4 text-left transition hover:border-navy/40 hover:bg-slate-50 ${
              selectedId === item.id ? 'border-navy bg-slate-50' : 'border-slate-100'
            }`}
          >
            {section === 'hods' || section === 'faculty' ? (
              <>
                <p className="font-medium text-slate-800">{item.full_name}</p>
                <p className="text-sm text-slate-500">{item.email}</p>
                <p className="text-xs text-slate-400">{item.department}</p>
              </>
            ) : section === 'courses' ? (
              <>
                <p className="font-medium text-navy">{item.course_code}</p>
                <p className="text-sm text-slate-700">{item.name}</p>
                <p className="text-xs text-slate-400">
                  {item.department} · Staff:{' '}
                  {item.staff?.map((s) => s.full_name).join(', ') || 'None'}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-400">
                  HOD: {item.hod_count} · Faculty: {item.faculty_count} · Courses:{' '}
                  {item.course_count}
                </p>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
