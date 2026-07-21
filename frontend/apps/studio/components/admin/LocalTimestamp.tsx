interface LocalTimestampProps {
  iso: string | null
  className?: string
}

export function LocalTimestamp({ iso, className }: LocalTimestampProps) {
  if (!iso) return <span className={className}>Never</span>
  const d = new Date(iso)
  if (isNaN(d.getTime())) return <span className={className}>Invalid date</span>
  const local = d.toLocaleString()
  const utc = d.toISOString()
  return (
    <span title={utc} className={className}>
      {local}
    </span>
  )
}
