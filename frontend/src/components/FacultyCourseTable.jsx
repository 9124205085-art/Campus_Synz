export default function FacultyCourseTable({ facultyList, onToggleAccess, togglingId }) {
  if (!facultyList?.length) {
    return (
      <p className="text-sm text-slate-500">
        No faculty in this department yet. Ask the admin to add faculty under your department.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <th className="py-3 pr-4 font-medium">Faculty</th>
            <th className="py-3 pr-4 font-medium">Employee ID</th>
            <th className="py-3 pr-4 font-medium">Assigned Courses</th>
            <th className="py-3 pr-4 font-medium text-center">No. of Courses</th>
            <th className="py-3 font-medium text-center">Access</th>
          </tr>
        </thead>
        <tbody>
          {facultyList.map((member) => (
            <tr key={member.id} className="border-b border-slate-100 align-top">
              <td className="py-3 pr-4">
                <p className="font-medium text-slate-800">{member.full_name}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </td>
              <td className="py-3 pr-4 text-slate-600">{member.employee_id || '—'}</td>
              <td className="py-3 pr-4 text-slate-600">
                {member.course_list?.length ? (
                  <ul className="space-y-1">
                    {member.course_list.map((course, idx) => (
                      <li key={idx} className="text-xs">
                        {course}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-slate-400">No courses assigned</span>
                )}
              </td>
              <td className="py-3 pr-4 text-center font-semibold text-navy tabular-nums">
                {member.course_count ?? 0}
              </td>
              <td className="py-3 text-center">
                <button
                  type="button"
                  disabled={togglingId === member.id}
                  onClick={() => onToggleAccess(member)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                    member.is_active !== false
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  {togglingId === member.id
                    ? 'Updating...'
                    : member.is_active !== false
                      ? 'Active'
                      : 'Inactive'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
