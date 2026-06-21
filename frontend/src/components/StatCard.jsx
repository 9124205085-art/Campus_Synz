export default function StatCard({ label, value, sub, accent = 'bg-navy', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full rounded-2xl bg-white p-6 text-left shadow-md transition ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-navy/20' : ''
      }`}
    >
      <div className={`mb-4 h-1 w-12 rounded-full ${accent}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-1 text-xs font-medium text-slate-500">{sub}</p>}
    </Tag>
  )
}
