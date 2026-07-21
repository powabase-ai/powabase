/**
 * Shared admin-dashboard fetch-error extraction. Both mutations (`postJson`)
 * and queries (org/orgs/users) use this so a failure renders the same message
 * shape regardless of which hook surfaced it: the server-provided
 * `message`/`error` body field when present, else `<fallback>: <status>`.
 */
export async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  let msg = `${fallback}: ${res.status}`
  try {
    const j = await res.json()
    if (typeof j?.message === "string") msg = j.message
    else if (typeof j?.error === "string") msg = j.error
  } catch {
    /* keep generic message */
  }
  return msg
}
