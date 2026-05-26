import DepartmentSelect from './DepartmentSelect'
import FormField from './FormField'

export default function AdminDetailPanel({
  type,
  mode,
  form,
  setForm,
  onSubmit,
  onDelete,
  onCancel,
  submitting,
}) {
  const isEdit = mode === 'edit'
  const title =
    mode === 'add'
      ? `Add ${type}`
      : mode === 'edit'
        ? `Edit ${type}`
        : `View ${type}`

  return (
    <div className="rounded-2xl border border-navy/20 bg-white p-6 shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-navy"
        >
          Close
        </button>
      </div>

      {mode === 'view' ? (
        <ViewDetails type={type} item={form} onEdit={() => onSubmit('edit')} onDelete={onDelete} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit('save')
          }}
          className="space-y-4"
        >
          {(type === 'HOD' || type === 'Faculty') && (
            <>
              <FormField
                label="Name"
                id="name"
                value={form.name || form.full_name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value, full_name: e.target.value })}
              />
              <FormField
                label="Email"
                id="email"
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  {isEdit ? 'Password (leave blank to keep)' : 'Password'}
                </label>
                <input
                  id="password"
                  type="password"
                  value={form.password || ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!isEdit}
                  placeholder={isEdit ? 'Optional' : 'Min 6 characters'}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
                />
              </div>
              <DepartmentSelect
                value={form}
                onChange={(dept) => setForm({ ...form, ...dept })}
                allowCreate={type === 'Department'}
              />
            </>
          )}

          {type === 'Course' && (
            <>
              <FormField
                label="Course Code"
                id="course_code"
                value={form.course_code || ''}
                onChange={(e) =>
                  setForm({ ...form, course_code: e.target.value.toUpperCase() })
                }
              />
              <FormField
                label="Course Name"
                id="course_name"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <FormField
                label="Regulation"
                id="regulation"
                value={form.regulation || ''}
                onChange={(e) => setForm({ ...form, regulation: e.target.value })}
              />
              <DepartmentSelect
                value={form}
                onChange={(dept) => setForm({ ...form, ...dept })}
                allowCreate={type === 'Department'}
              />
            </>
          )}

          {type === 'Department' && (
            <FormField
              label="Department Name"
              id="dept-name"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. B.Tech Information Technology"
            />
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-full border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

function ViewDetails({ type, item, onEdit, onDelete }) {
  return (
    <div className="space-y-3 text-sm">
      {type === 'Department' && (
        <>
          <Row label="Name" value={item.name} />
          <Row label="HODs" value={item.hod_count} />
          <Row label="Faculty" value={item.faculty_count} />
          <Row label="Courses" value={item.course_count} />
        </>
      )}
      {(type === 'HOD' || type === 'Faculty') && (
        <>
          <Row label="Name" value={item.full_name} />
          <Row label="Email" value={item.email} />
          <Row label="Department" value={item.department} />
        </>
      )}
      {type === 'Course' && (
        <>
          <Row label="Code" value={item.course_code} />
          <Row label="Name" value={item.name} />
          <Row label="Regulation" value={item.regulation} />
          <Row label="Department" value={item.department} />
          <Row
            label="Faculty Staff"
            value={
              item.staff?.map((s) => s.full_name).join(', ') ||
              item.staff_display ||
              'No faculty in this department'
            }
          />
        </>
      )}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-full bg-navy py-2.5 text-sm font-semibold text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <p>
      <span className="font-medium text-slate-700">{label}: </span>
      <span className="text-slate-600">{value ?? '—'}</span>
    </p>
  )
}
