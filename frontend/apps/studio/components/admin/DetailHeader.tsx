import { LocalTimestamp } from "./LocalTimestamp"

interface DetailHeaderProps {
  title: string
  subtitle?: React.ReactNode
  meta?: Array<{ label: string; value: React.ReactNode }>
  createdAt?: string | null
}

export function DetailHeader({ title, subtitle, meta, createdAt }: DetailHeaderProps) {
  return (
    <div className="border-b border-border pb-4 mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle ? (
        <div className="text-sm text-foreground-light mt-1">{subtitle}</div>
      ) : null}
      <div className="flex gap-4 mt-3 text-xs text-foreground-light">
        {meta?.map((m) => (
          <div key={m.label}>
            <span className="font-medium">{m.label}:</span> {m.value}
          </div>
        ))}
        {createdAt ? (
          <div>
            <span className="font-medium">Created:</span>{" "}
            <LocalTimestamp iso={createdAt} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
