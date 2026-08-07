/**
 * Whether the "Continue with Google" button renders.
 *
 * Driven by the `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` build arg rather than an
 * `enabled-features.json` key, because a key there would be one constant shared
 * by every hosted build: `useIsFeatureEnabled` subtracts
 * `profile.disabled_features`, and `data/profile/profile-query.ts` populates that
 * only when `!IS_PLATFORM`. A build arg can differ per image, which is what lets
 * one deployment ship the button while another does not.
 *
 * Baked into the bundle at build time while the auth server reads its own
 * provider config at deploy time, so a flip is NOT atomic. Bring the server
 * config up before turning the button on, and take the button down before
 * turning the server config off. Defaults to OFF when unset.
 */
export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'
}
