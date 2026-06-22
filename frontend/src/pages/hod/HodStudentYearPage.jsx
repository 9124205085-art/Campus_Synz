import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import HodStatDetailsModal from '../../components/hod/HodStatDetailsModal'
import HodShell from '../../components/hod/HodShell'
import { dashboardAPI } from '../../services/api'

export default function HodStudentYearPage() {
  const { year } = useParams()
  const yearNum = parseInt(year, 10)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    dashboardAPI
      .hod()
      .then((res) => setData(res.data))
      .finally(() => setLoading(false))
  }, [])

  const type = `students_year_${yearNum}`

  return (
    <HodShell
      title={`Year ${yearNum} Students`}
      breadcrumbs={['Dashboard', 'Students', `Year ${yearNum}`]}
    >
      {loading ? (
        <p className="text-center text-slate-500">Loading…</p>
      ) : (
        <HodStatDetailsModal
          embedded
          type={type}
          dashboardData={data}
          onClose={() => {}}
          onRefresh={() =>
            dashboardAPI.hod().then((res) => setData(res.data))
          }
        />
      )}
    </HodShell>
  )
}
