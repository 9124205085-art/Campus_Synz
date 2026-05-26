import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import MarkSheetGrid from '../components/MarkSheetGrid'
import { facultyAPI } from '../services/api'

export default function FacultyMarkSheetPage() {
  const { sheetId } = useParams()
  const navigate = useNavigate()
  const [marksheet, setMarksheet] = useState(null)
  const [coOptions, setCoOptions] = useState([])
  const [markOptions, setMarkOptions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    facultyAPI
      .getMarksheet(sheetId)
      .then((res) => {
        setMarksheet(res.data.marksheet)
        setCoOptions(res.data.co_options || [])
        setMarkOptions(res.data.mark_options || [])
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load mark sheet.')
      })
  }, [sheetId])

  const handleSave = async (data) => {
    const res = await facultyAPI.updateMarksheet(sheetId, data)
    setMarksheet(res.data.marksheet)
  }

  return (
    <DashboardLayout title="Mark Entry Sheet" subtitle="Excel-style student marks">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}
      {marksheet && (
        <MarkSheetGrid
          marksheet={marksheet}
          coOptions={coOptions}
          markOptions={markOptions}
          onSave={handleSave}
          onBack={() => navigate('/faculty/dashboard')}
        />
      )}
    </DashboardLayout>
  )
}
