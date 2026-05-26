export default function CourseTable({ courses, showStaff = true }) {
  if (!courses?.length) {
    return <p className="text-sm text-slate-500">No courses available for your department yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-3 pr-4 font-medium">Code</th>
            <th className="py-3 pr-4 font-medium">Name</th>
            <th className="py-3 pr-4 font-medium">Regulation</th>
            <th className="py-3 pr-4 font-medium">Department</th>
            {showStaff && <th className="py-3 font-medium">Faculty Staff</th>}
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id} className="border-b border-slate-100">
              <td className="py-3 pr-4 font-medium text-navy">{course.course_code}</td>
              <td className="py-3 pr-4">{course.name}</td>
              <td className="py-3 pr-4">{course.regulation}</td>
              <td className="py-3 pr-4">{course.department}</td>
              {showStaff && (
                <td className="py-3 text-slate-600">
                  {course.staff_display ||
                    (course.staff_names && course.staff_names.join(', ')) ||
                    (course.staff && course.staff.map((s) => s.full_name).join(', ')) ||
                    '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
