import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import MarkSheetGrid from '../components/MarkSheetGrid'
import { facultyAPI } from '../services/api'

const MAX_LISTED_ISSUES = 15

function CoReportValidationAlert({ issues, onDismiss, onContinue }) {
  if (!issues) return null

  const isError = issues.type === 'error'
  const messages = issues.messages.slice(0, MAX_LISTED_ISSUES)
  const remaining = issues.messages.length - messages.length

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 ${
        isError ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="font-semibold">
        {isError
          ? 'Cannot open CO Attainment Report — fix these mark errors first:'
          : 'Warning — some mark cells are empty:'}
      </p>
      <ul className="mt-2 max-h-52 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
        {messages.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
        {remaining > 0 && (
          <li className="list-none pl-0 text-xs opacity-80">
            …and {remaining} more issue(s).
          </li>
        )}
      </ul>
      {!isError && (
        <p className="mt-2 text-sm">
          Each question column has a maximum mark (shown in the header, e.g. max 2m). Empty cells
          may affect CO/PO calculation accuracy.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!isError && onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-dark"
          >
            Continue anyway
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isError ? 'Dismiss' : 'Go back and fill marks'}
        </button>
      </div>
    </div>
  )
}

export default function FacultyMarkSheetPage() {
  const { sheetId } = useParams()
  const navigate = useNavigate()
  const validateRef = useRef(null)
  const [marksheet, setMarksheet] = useState(null)
  const [coOptions, setCoOptions] = useState([])
  const [markOptions, setMarkOptions] = useState([])
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [coReportIssues, setCoReportIssues] = useState(null)

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

  const handleDelete = async () => {
    if (!marksheet) return
    const label = `${marksheet.course_code} — ${marksheet.course_name}`
    if (!window.confirm(`Delete mark sheet "${label}"? This cannot be undone.`)) return

    setDeleting(true)
    setError('')
    try {
      await facultyAPI.deleteMarksheet(sheetId)
      navigate('/faculty/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete mark sheet.')
      setDeleting(false)
    }
  }

  const openCoAttainmentReport = () => {
    setCoReportIssues(null)
    navigate(`/faculty/marksheet/${sheetId}/co-attainment`)
  }

  const handleCoAttainmentReport = () => {
    setCoReportIssues(null)
    setError('')

    if (!marksheet?.is_saved) {
      setCoReportIssues({
        type: 'error',
        messages: [
          'Please save the mark sheet first (click Save Marks), then open CO Attainment Report.',
        ],
      })
      return
    }

    const result = validateRef.current?.validateForCoReport?.()
    if (!result) {
      setError('Could not validate marks. Please try again.')
      return
    }

    if (result.errors.length > 0) {
      setCoReportIssues({
        type: 'error',
        messages: result.errors,
      })
      return
    }

    if (result.warnings.length > 0) {
      setCoReportIssues({
        type: 'warning',
        messages: result.warnings,
      })
      return
    }

    openCoAttainmentReport()
  }

  return (
    <DashboardLayout title="Mark Entry Sheet" subtitle="Excel-style student marks">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <CoReportValidationAlert
        issues={coReportIssues}
        onDismiss={() => setCoReportIssues(null)}
        onContinue={() => {
          setCoReportIssues(null)
          openCoAttainmentReport()
        }}
      />

      {marksheet && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={handleCoAttainmentReport}
            className="flex items-center gap-2 rounded-full border border-navy bg-white px-5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-white"
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
          onDelete={handleDelete}
          deleting={deleting}
          validateRef={validateRef}
        />
      )}
    </DashboardLayout>
  )
}
