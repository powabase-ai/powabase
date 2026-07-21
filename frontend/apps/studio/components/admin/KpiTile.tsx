interface KpiTileProps {
  label: string
  value: number | string
  subline?: string
}

export function KpiTile({ label, value, subline }: KpiTileProps) {
  return (
    <div className="rounded-lg border border-default bg-surface-100 p-4">
      <div className="text-xs text-foreground-lighter uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      {subline ? (
        <div className="text-xs text-foreground-light mt-1">{subline}</div>
      ) : null}
    </div>
  )
}
