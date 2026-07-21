/**
 * Popup-blocker-safe new-tab handoff for Stripe Checkout / Customer Portal URLs.
 *
 * The Stripe URL is only known after an async session-create round-trip, by
 * which point the code is outside the click gesture and a fresh `window.open()`
 * would be popup-blocked. So callers open a blank tab synchronously inside the
 * click handler (`openStripeTab`) and fill its location once the URL resolves
 * (`navigateStripeTab`).
 *
 * IMPORTANT — do NOT pass the `noopener` feature to `window.open()`. Per the
 * HTML spec, `window.open()` returns `null` whenever `noopener` is requested,
 * which discards the tab handle and silently degrades every redirect to a
 * same-tab navigation. (That was the bug this helper exists to prevent: the
 * handle was always null, so `tab.location.href` never ran and the code fell
 * through to `window.location.href`.) We get the same reverse-tabnabbing
 * protection by severing the opener manually while the blank tab is still
 * same-origin (`about:blank`), which keeps the handle intact.
 */
export function openStripeTab(): Window | null {
  const tab = window.open('about:blank', '_blank')
  // Sever the back-reference so the Stripe page can't reach `window.opener`,
  // without losing our handle (cf. the `noopener` feature, which nulls it).
  if (tab) tab.opener = null
  return tab
}

/**
 * Send the pre-opened tab to `url`. If `tab` is null — popup blocked, or the
 * caller never opened one — fall back to navigating the current tab so the
 * redirect still happens.
 */
export function navigateStripeTab(tab: Window | null, url: string): void {
  if (tab) tab.location.href = url
  else window.location.href = url
}
