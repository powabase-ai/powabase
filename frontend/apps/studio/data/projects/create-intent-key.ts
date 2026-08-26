/**
 * One idempotency key per project-create *intent*.
 *
 * The platform replays the original project when it sees the same key with
 * the same request again, and rejects the same key with different contents.
 * So a resubmission of unchanged form contents (a retry after a transport
 * failure) must reuse the key, while edited contents are a new intent and
 * get a fresh one. The fingerprint stays in memory and is never sent.
 */
export interface CreateIntentKey {
  key: string
  fingerprint: string
}

export function resolveCreateIntentKey(
  previous: CreateIntentKey | null,
  fingerprint: string,
  generate: () => string
): CreateIntentKey {
  if (previous && previous.fingerprint === fingerprint) return previous
  return { key: generate(), fingerprint }
}

/**
 * The body as sent. The platform compares a canonical subset of it, so this
 * is a conservative superset: a reused key can never be rejected as a
 * different request, and only a genuinely different submission rotates it.
 */
export function createIntentFingerprint(body: unknown): string {
  return JSON.stringify(body)
}
