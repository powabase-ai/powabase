/**
 * Disposable-email domain blocklist for platform-dashboard signup.
 *
 * Domain data is generated from a blocklist (exact-match) and a
 * free-subdomain-roots list (label-aligned suffix-match). The control
 * plane's signup flow mirrors this same blocklist server-side from the
 * same generated source.
 */
import {
  DISPOSABLE_EMAIL_DOMAINS,
  FREE_SUBDOMAIN_ROOTS,
} from './disposable-email-domains.generated'

export { DISPOSABLE_EMAIL_DOMAINS, FREE_SUBDOMAIN_ROOTS }

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return false
  // strip trailing dots so user@eu.org. can't evade the suffix walk
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.+$/, '')
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true
  // Label-aligned suffix match against curated free-subdomain roots:
  // walk parent labels (007.hzeg.eu.org -> hzeg.eu.org -> eu.org -> org).
  const labels = domain.split('.')
  for (let i = 0; i < labels.length; i++) {
    if (FREE_SUBDOMAIN_ROOTS.has(labels.slice(i).join('.'))) return true
  }
  return false
}
