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
    return res.data.marksheet
  }

  return (
    <DashboardLayout title="Mark Entry Sheet" subtitle="Excel-style student marks">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {marksheet && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => navigate(`/faculty/marksheet/${sheetId}/co-attainment`)}
            className="flex items-center gap-2 rounded-full border border-navy bg-white px-5 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            CO Attainment Report
          </button>
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