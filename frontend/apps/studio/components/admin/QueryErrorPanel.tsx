import { ResponseError } from "@/types"

interface QueryErrorPanelProps {
  error: unknown
  onRetry?: () => void
  message?: string // Optional override; defaults to "Could not load."
}

export function QueryErrorPanel({
  error,
  onRetry,
  message = "Could not load.",
}: QueryErrorPanelProps) {
  const code = error instanceof ResponseError ? error.code : undefined
  const detail =
    error instanceof ResponseError
      ? `${error.message ?? "Request failed"} (HTTP ${code ?? "?"})`
      : error instanceof Error
        ? error.message
        : "Unknown error"

  return (
    <div className="border border-destructive rounded p-4 text-destructive">
      <div className="font-medium">{message}</div>
      <div className="text-xs mt-1 font-mono">{detail}</div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-2 px-3 py-1 border border-destructive rounded hover:bg-destructive/10 text-xs"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
