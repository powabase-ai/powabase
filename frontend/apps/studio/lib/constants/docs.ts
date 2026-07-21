import { DOCS_URL } from './index'

export const DOCS_LANDING_PATH = '/concepts/platform-overview'

/**
 * Powabase has a single docs landing page. Supabase deep paths
 * (/guides/...) do not exist in our docs, so callers ignore the path
 * arg and link to the landing.
 */
export function getDocsLandingUrl(_supabasePath?: string): string {
  return `${DOCS_URL}${DOCS_LANDING_PATH}`
}
