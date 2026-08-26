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

/** The body as sent — exactly what the platform hashes, no more and no less. */
export function createIntentFingerprint(body: unknown): string {
  return JSON.stringify(body)
}
