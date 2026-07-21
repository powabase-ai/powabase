import { useState } from "react"

interface BM25IndexCardProps {
  status: "absent" | "stale" | "ready"
  onBuild: () => Promise<void>
}

/**
 * Card rendered on the KB detail page when:
 *   - the KB's retrieval method uses BM25 (hybrid / full_text), AND
 *   - the project's BM25_AUTO_INDEXING setting is off.
 *
 * The backend omits `bm25_status` in any other case, so callers can
 * conditionally render this card with `{kb.bm25_status && <BM25IndexCard ... />}`.
 */
export function BM25IndexCard({ status, onBuild }: BM25IndexCardProps) {
  const [submitting, setSubmitting] = useState(false)

  const handleClick = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onBuild()
    } finally {
      setSubmitting(false)
    }
  }

  const isReady = status === "ready"
  const buttonLabel = submitting
    ? "Building…"
    : isReady
      ? "BM25 is up-to-date"
      : "Build BM25"
  const buttonDisabled = submitting || isReady

  const statusDescription = {
    absent: "No BM25 sparse index exists for this knowledge base yet.",
    stale: "The BM25 sparse index is missing items added since the last build.",
    ready: "The BM25 sparse index covers all current items.",
  }[status]

  return (
    <div className="rounded-lg border border-default p-4 my-3 bg-surface-100">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">BM25 sparse index</h3>
          <p className="text-xs text-foreground-light mt-1">
            {statusDescription}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={buttonDisabled}
          className="px-3 py-1.5 text-sm rounded-lg border border-default bg-surface-200 hover:bg-surface-300 text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
