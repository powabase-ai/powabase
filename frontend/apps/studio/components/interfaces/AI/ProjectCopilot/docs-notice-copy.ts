/**
 * Copy for the "answered without documentation" notice, per degraded-docs kind.
 *
 * The backend distinguishes WHY grounding was unavailable (see
 * `_DEGRADED_DOCS_NOTICE_KINDS` in the project-service): not configured,
 * unreachable, or not indexed yet. Each needs different operator action —
 * configure something, fix something, or just wait — so the panel must not
 * collapse them into one "couldn't be reached" (which is wrong, and mildly
 * alarming, on a deliberately-unconfigured self-host stack).
 *
 * `docs_unavailable` is the legacy catch-all older backends emit for every
 * degraded cause; keep rendering it as an outage rather than dropping it.
 */
export const DOCS_NOTICE_KINDS = [
  'docs_not_configured',
  'docs_unreachable',
  'docs_not_ready',
  'docs_unavailable',
] as const

export type DocsNoticeKind = (typeof DOCS_NOTICE_KINDS)[number]

/**
 * Any `docs_*` kind gates the warning — including kinds this build doesn't
 * know yet, which fall back to generic copy in `docsNoticeCopy`. Gating on the
 * known list instead would let a new backend kind silently turn the ungrounded
 * -answer warning off.
 */
export const isDocsNotice = (kind: unknown): kind is string =>
  typeof kind === 'string' && kind.startsWith('docs_')

const UNREACHABLE_COPY =
  'Answered without documentation — the docs index couldn’t be reached, so double-check this against the official docs.'

const GENERIC_COPY =
  'Answered without documentation — double-check this against the official docs.'

const COPY: Record<DocsNoticeKind, string> = {
  docs_not_configured:
    'Answered without documentation — docs search isn’t configured in this deployment, so double-check this against the official docs.',
  docs_unreachable: UNREACHABLE_COPY,
  docs_unavailable: UNREACHABLE_COPY,
  docs_not_ready:
    'Answered without documentation — the docs index is still being built. Try again in a few minutes, and double-check this against the official docs.',
}

export const docsNoticeCopy = (kind: string): string =>
  COPY[kind as DocsNoticeKind] ?? GENERIC_COPY
