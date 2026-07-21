/**
 * "Returning" user heuristic for the admin Users list: a user whose most
 * recent sign-in is at least one full day after they signed up. That gap means
 * they came back on a later day rather than only touching the account during
 * the initial signup session — a cheap signal of genuine engagement an
 * operator can scan for at a glance (rendered as a green row).
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function isReturningUser(
  createdAt: string | null | undefined,
  lastSignInAt: string | null | undefined
): boolean {
  if (!createdAt || !lastSignInAt) return false
  const created = new Date(createdAt).getTime()
  const signin = new Date(lastSignInAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(signin)) return false
  return signin - created >= ONE_DAY_MS
}

/** Subtle green row tint, matching the -200 scale used by flagRowClassName. */
export const returningRowClassName = "bg-brand-200"
