import { useRouter } from 'next/router'
import { useEffect } from 'react'

/**
 * Legacy URL compatibility redirect.
 *
 * The pre-Studio frontend had a single settings page at
 * `/settings/agents-tools` that rendered `<SettingsForm category="agents-tools" />`.
 * The backend's settings registry never had an `agents-tools` category —
 * only separate `agents` and `tools` categories — so the legacy page rendered
 * an empty form against real projects.
 *
 * Studio's port correctly split this into two dedicated pages:
 *   - `/settings/agents`  → `<SettingsForm category="agents" />`
 *   - `/settings/tools`   → `<SettingsForm category="tools" />`
 *
 * Both are linked from the sidebar in
 * `components/layouts/ProjectSettingsLayout/SettingsMenu.utils.tsx`.
 *
 * This file preserves the legacy URL and redirects to `/settings/agents`
 * (the most likely intent for users landing here from a bookmark).
 * If tools-specific settings are needed, users follow the sidebar link.
 */
export default function RedirectToAgentsSettings() {
  const router = useRouter()
  const ref = router.query.ref as string
  useEffect(() => {
    if (ref) router.replace(`/project/${ref}/settings/agents`)
  }, [ref, router])
  return null
}
