import { Badge } from 'ui'

interface Props {
  /** Ordered list of providers to render rows for. */
  providers: string[]
  /** Provider → masked API key the user has configured. */
  userKeys: Record<string, string | undefined>
  /** Providers the PS pod has a platform env key for (factor 2 of AI-on-us). */
  platformProviders: Set<string>
  /** Whether the ``billing:ai_on_us`` flag is on. */
  isAiOnUsEnabled: boolean
}

/**
 * Two-factor AI-on-us status badges (credit-system v1.5, Set B).
 *
 * Per-provider status rule:
 *   - user has a key                                 → "BYOK active"
 *   - flag off (Set A baseline)                      → no badge
 *   - flag on AND platform has env key for provider  → "AI-on-us active"
 *   - flag on AND platform does NOT have env key     → "BYOK required"
 *
 * Renders only the read-only status rows; the page composes mutations
 * (add / delete / validate) around this component.
 */
export const LLMProviderKeysSettings = ({
  providers,
  userKeys,
  platformProviders,
  isAiOnUsEnabled,
}: Props) => {
  const getStatus = (provider: string): string | null => {
    if (userKeys[provider]) return 'BYOK active'
    if (!isAiOnUsEnabled) return null
    if (platformProviders.has(provider)) return 'AI-on-us active'
    return 'BYOK required'
  }

  return (
    <div className="border-default rounded-md border">
      {providers.map((provider, idx) => {
        const status = getStatus(provider)
        return (
          <div
            key={provider}
            data-testid="provider-row"
            className={`flex items-center justify-between px-6 py-4 ${
              idx < providers.length - 1 ? 'border-default border-b' : ''
            }`}
          >
            <div className="text-foreground text-sm font-medium">{provider}</div>
            {status && (
              <Badge variant={status === 'BYOK required' ? 'warning' : 'success'}>{status}</Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}
