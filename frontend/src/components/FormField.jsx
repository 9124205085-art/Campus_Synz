export default function FormField({ label, id, type = 'text', value, onChange, placeholder, required = true }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-slate-800 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20"
      />
    </div>
  )
}
