import type HCaptcha from '@hcaptcha/react-hcaptcha'

/**
 * Whether the hCaptcha widget should render and run.
 *
 * Driven by the `NEXT_PUBLIC_HCAPTCHA_ENABLED` build arg, which CI wires from
 * the same `HCAPTCHA_ENABLED` variable that toggles GoTrue's server-side
 * captcha verification (`gotrue.securityCaptchaEnabled`). One source of truth,
 * but NOT atomic: this flag is baked into the FE at image-build time while
 * GoTrue reads it at pod-deploy time. So a flip is only safe when ordered —
 * GoTrue-off before FE-off to disable; FE-rebuilt-on before GoTrue-on to
 * enable — otherwise GoTrue can demand a token the gated-off FE no longer
 * mints and reject every signup/login. See docs/runbooks/activate-hcaptcha.md.
 * Defaults to OFF when unset.
 */
export function isHCaptchaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HCAPTCHA_ENABLED === 'true'
}

/**
 * Run the invisible hCaptcha challenge and return its token, or `null` when
 * captcha is disabled — in which case `.execute()` is never called, so no
 * challenge is shown. Also returns `null` if the widget ref is not mounted.
 */
export async function executeCaptcha(captchaRef: {
  current: HCaptcha | null
}): Promise<string | null> {
  if (!isHCaptchaEnabled()) return null
  const captchaResponse = await captchaRef.current?.execute({ async: true })
  return captchaResponse?.response ?? null
}
