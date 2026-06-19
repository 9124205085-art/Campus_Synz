export default function SelectField({
  label,
  id,
  value,
  onChange,
  options = [],
  placeholder = '— Select —',
  required = true,
  disabled = false,
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-slate-800 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt
          const lab = typeof opt === 'object' ? opt.label : opt
          return (
            <option key={val} value={val}>
              {lab}
            </option>
          )
        })}
      </select>
    </div>
  )
}
