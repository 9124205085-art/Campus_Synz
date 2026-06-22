import { useEffect, useState } from 'react'
import HodShell from '../../components/hod/HodShell'
import HodStatDetailsModal from '../../components/hod/HodStatDetailsModal'
import { dashboardAPI } from '../../services/api'

const SECTIONS = {
  faculty: { title: 'Faculty', type: 'faculty', breadcrumbs: ['Dashboard', 'Faculty'] },
  courses: { title: 'Courses', type: 'courses', breadcrumbs: ['Dashboard', 'Courses'] },
  assignments: {
    title: 'Course Assignments',
    type: 'assignments',
    breadcrumbs: ['Dashboard', 'Assignments'],
  },
  classes: { title: 'Classes', type: 'classes', breadcrumbs: ['Dashboard', 'Classes'] },
}

export default function HodSectionPage({ section }) {
  const meta = SECTIONS[section]
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    dashboardAPI
      .hod()
      .then((res) => setData(res.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (!meta) return null

  return (
    <HodShell title={meta.title} breadcrumbs={meta.breadcrumbs}>
      {loading ? (
        <p className="text-center text-slate-500">Loading…</p>
      ) : (
        <HodStatDetailsModal
          embedded
          type={meta.type}
          dashboardData={data}
          onClose={() => {}}
          onRefresh={load}
        />
      )}
    </HodShell>
  )
}

export function HodPlaceholderPage({ title, breadcrumbs }) {
  return (
    <HodShell title={title} breadcrumbs={breadcrumbs}>
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-slate-600">{title} — coming soon.</p>
      </div>
    </HodShell>
  )
}
