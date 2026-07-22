

import { useEffect, useMemo, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth } from "@/lib/ai-api";
import { modelsApi, type ModelInfo } from "@/lib/ai-api/models-api";
import { useLLMProviderKeysQuery } from "@/data/llm-provider-keys/llm-provider-keys-query";
import { useLLMPlatformSupportedQuery } from "@/data/llm-provider-keys/llm-platform-supported-query";
import { useIsFeatureEnabled } from "@/hooks/misc/useIsFeatureEnabled";

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  /**
   * Test/storybook override for the AI-on-us platform providers set.
   * When omitted (production), the set is fetched from
   * /ai-provider-keys/platform_supported via useLLMPlatformSupportedQuery.
   */
  platformProviders?: Set<string>;
  /**
   * Test/storybook override for the `billing:ai_on_us` gate. When omitted
   * (production), the gate reads from `useIsFeatureEnabled('billing:ai_on_us')`.
   * When false, the AI-on-us / BYOK-only badges are not rendered (Set A baseline).
   */
  isAiOnUsEnabled?: boolean;
}

/**
 * Providers LiteLLM has pricing for AND that the PS pod ships an env-var
 * slot for (i.e. ``_PROVIDER_ENV`` on the backend). For AI-on-us to be
 * available, a provider must satisfy BOTH this set AND the per-pod
 * platform-supported set (factor 2). Hardcoded to mirror the backend's
 * ``_PROVIDER_ENV`` map — adding a new provider on the backend requires
 * adding it here too. Exported for test coverage.
 */
export const LITELLM_PRICED_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "google",
  "openrouter",
]);

/** Map a model's `provider` field to the LLM-provider-key `provider` it
 *  needs. `bedrock` and `vertex` reuse anthropic/google credentials in
 *  the platform's setup; openrouter is its own bucket. Adjust here if
 *  the project ever decouples those. */
function providerKeyFor(provider: string): string {
  switch (provider) {
    case "openai":
    case "anthropic":
    case "google":
    case "openrouter":
      return provider
    case "bedrock":
      return "anthropic"
    case "vertex":
      return "google"
    default:
      return provider
  }
}

export function ModelSelector({
  value,
  onChange,
  placeholder,
  allowEmpty,
  platformProviders: platformProvidersOverride,
  isAiOnUsEnabled: isAiOnUsEnabledOverride,
}: ModelSelectorProps) {
  const { token, orgSlug } = useProjectSupabaseClient();
  const { data: projectKeys, isLoading: keysLoading } = useLLMProviderKeysQuery();
  const { data: platformSupported } = useLLMPlatformSupportedQuery();
  const aiOnUsFromHook = useIsFeatureEnabled('billing:ai_on_us');

  // Compose the two-factor AI-on-us set: the pod must have the platform env
  // key for the provider AND LiteLLM must have pricing for it. Test override
  // lets the badge tests pin behavior without touching the network mocks.
  const platformProviders =
    platformProvidersOverride ?? new Set<string>(platformSupported?.providers ?? []);
  const isAiOnUsEnabled = isAiOnUsEnabledOverride ?? aiOnUsFromHook;

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Gate on hasAiAuth, NOT raw `!token` (see useLLMModels for the full
    // rationale): self-host has token='' but hasAiAuth('')===true, so the old
    // guard early-returned forever and left isLoading stuck true, freezing this
    // <select> on a disabled "Loading models…". Clear isLoading on the un-authed
    // (platform) path so the control settles instead of hanging.
    if (!hasAiAuth(token) || !orgSlug) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    modelsApi
      .list(token, orgSlug)
      .then((res) => setModels(res.models))
      .catch(() => setModels([]))
      .finally(() => setIsLoading(false));
  }, [token, orgSlug]);

  // Build the set of providers the user has actually configured a (valid)
  // key for in THIS project. The control-plane /models endpoint can't tell
  // us this — it has no project context — so it returns every model as
  // available. We override here with the ground-truth project-scoped data.
  const configuredProviders = useMemo(() => {
    const set = new Set<string>()
    for (const k of projectKeys ?? []) {
      // Treat soft-failed keys (is_valid=false, e.g. validation pending /
      // upstream blip) as still configured — the user can attempt the call,
      // and a hard credential error will surface in the runs UI. But a
      // missing entry definitively means "no key set", so we exclude.
      if (k.provider) set.add(k.provider)
    }
    return set
  }, [projectKeys])

  // Badge per model (Set B). Hidden entirely when the feature flag is off.
  //   - AI-on-us: provider is in BOTH platformProviders AND LITELLM_PRICED_PROVIDERS
  //   - BYOK only: otherwise (model needs a user-supplied key)
  // Returned as a short label suffix because we render native <option>
  // elements, which don't support nested badge components in the DOM.
  const getBadgeLabel = (provider: string): string => {
    if (!isAiOnUsEnabled) return ""
    const aiOnUsAvailable =
      platformProviders.has(provider) && LITELLM_PRICED_PROVIDERS.has(provider)
    return aiOnUsAvailable ? " — AI-on-us" : " — BYOK only"
  }

  // Group by tier and override `available` based on project keys.
  // A model is selectable when EITHER the user has a BYOK key for its
  // provider OR the deployment offers it via AI-on-us (flag on + provider
  // in BOTH platformProviders AND LITELLM_PRICED_PROVIDERS). Previously
  // we only checked configuredProviders, which disabled AI-on-us models
  // in the dropdown and broke the primary AI-on-us flow (PR 416 C4).
  const tiers = ["flagship", "balanced", "fast", "reasoning"];
  const modelsByTier: Record<string, Array<ModelInfo & { _available: boolean; _aiOnUs: boolean }>> = {};
  for (const m of models) {
    const requiredKey = providerKeyFor(m.provider)
    const _aiOnUs =
      isAiOnUsEnabled &&
      platformProviders.has(requiredKey) &&
      LITELLM_PRICED_PROVIDERS.has(requiredKey)
    const _available = configuredProviders.has(requiredKey) || _aiOnUs
    const enriched = { ...m, _available, _aiOnUs }
    if (!modelsByTier[m.tier]) modelsByTier[m.tier] = [];
    modelsByTier[m.tier].push(enriched);
  }

  const loading = isLoading || keysLoading

  // A model set directly from the backend can be a value the curated /models
  // catalog doesn't list (e.g. a pinned `anthropic/claude-opus-4-7`). A native
  // <select> with a value that matches no <option> silently falls back to its
  // first option, so opening the config UI would misreport the agent's model
  // (and a blind save could overwrite it). Surface the current value as its
  // own option so it stays selected and visible.
  const valueInCatalog = !value || models.some((m) => m.id === value)
  const showCustomOption = !loading && !!value && !valueInCatalog

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
      className="w-full max-w-md px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
    >
      {allowEmpty && <option value="">{placeholder || "Select a model..."}</option>}
      {!allowEmpty && !value && <option value="">{placeholder || "Select a model..."}</option>}
      {showCustomOption && <option value={value}>{value} (custom)</option>}
      {loading ? (
        <option disabled>Loading models...</option>
      ) : (
        tiers.map((tier) => {
          const tierModels = modelsByTier[tier];
          if (!tierModels || tierModels.length === 0) return null;
          return (
            <optgroup key={tier} label={tier.charAt(0).toUpperCase() + tier.slice(1)}>
              {tierModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.recommended ? " ★" : ""}
                  {!m._available ? " (will use balance)" : ""}
                  {getBadgeLabel(providerKeyFor(m.provider))}
                </option>
              ))}
            </optgroup>
          );
        })
      )}
    </select>
  );
}
