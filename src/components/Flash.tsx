export default function Flash({ m }: { m: string | string[] | undefined }) {
  const msg = typeof m === 'string' ? m.slice(0, 200) : ''
  if (!msg) return null
  return (
    <p role="status" className="no-print mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
      {msg}
    </p>
  )
}
