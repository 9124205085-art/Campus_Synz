export default function AssignmentTable({ assignments, onRemove, removingId }) {
  if (!assignments?.length) {
    return <p className="text-sm text-slate-500">No course assignments yet. Click &quot;Assign Course&quot; to add one.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-3 pr-4 font-medium">Code</th>
            <th className="py-3 pr-4 font-medium">Course Name</th>
            <th className="py-3 pr-4 font-medium">Regulation</th>
            <th className="py-3 pr-4 font-medium">Year</th>
            <th className="py-3 pr-4 font-medium">Semester</th>
            <th className="py-3 pr-4 font-medium">Faculty</th>
            <th className="py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="py-3 pr-4 font-medium text-navy">{row.course_code}</td>
              <td className="py-3 pr-4">{row.course_name}</td>
              <td className="py-3 pr-4">{row.regulation}</td>
              <td className="py-3 pr-4">Year {row.year}</td>
              <td className="py-3 pr-4">{row.semester ? `Sem ${row.semester}` : '—'}</td>
              <td className="py-3 pr-4 text-slate-600">{row.faculty_name || '—'}</td>
              <td className="py-3">
                {onRemove && (
                  <button
                    type="button"
                    disabled={removingId === row.id}
                    onClick={() => onRemove(row)}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                  >
                    {removingId === row.id ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
