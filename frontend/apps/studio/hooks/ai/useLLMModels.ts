import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth } from "@/lib/ai-api";
import { modelsApi, type ModelInfo } from "@/lib/ai-api/models-api";

/**
 * Shared fetch of the curated LLM catalog (GET /organizations/<org>/models),
 * cached per-org at module level so the several model dropdowns rendered on a
 * single KB-config form don't each fire an identical request.
 *
 * Carries the reasoning metadata (`supports_reasoning`, `reasoning_efforts`)
 * the KB model selectors use to decide whether to reveal a reasoning-effort
 * dropdown.
 */
const cache: Record<string, ModelInfo[]> = {};

export function useLLMModels() {
  const { token, orgSlug } = useProjectSupabaseClient();
  const cacheKey = orgSlug ?? "";

  const [models, setModels] = useState<ModelInfo[]>(cache[cacheKey] ?? []);
  const [isLoading, setIsLoading] = useState(!cache[cacheKey]);

  useEffect(() => {
    if (cache[cacheKey]) {
      setModels(cache[cacheKey]);
      setIsLoading(false);
      return;
    }
    // Gate on hasAiAuth, NOT raw `!token`: self-host has no GoTrue session so
    // token is '' permanently (see useProjectSupabaseClient), but hasAiAuth('')
    // is true off-platform because the same-origin proxy injects service_role
    // server-side. Gating on raw !token early-returned forever on self-host and
    // — because it returned BEFORE the .finally below — left isLoading stuck
    // true, freezing every model dropdown on a disabled "Loading models…".
    // Clear isLoading here so a genuinely un-authed (platform) render settles.
    if (!hasAiAuth(token) || !orgSlug) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    modelsApi
      .list(token, orgSlug)
      .then((res) => {
        if (cancelled) return;
        cache[cacheKey] = res.models;
        setModels(res.models);
      })
      .catch((err) => {
        // Don't fail silently: a dropped /models call would otherwise leave every
        // KB model dropdown stuck on "Select a model…" and relabel saved models
        // as "(custom)", indistinguishable from a broken config. Surface it, and
        // keep any previously-loaded list rather than wiping it on a transient blip.
        if (!cancelled) console.error("Failed to load LLM model catalog:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, orgSlug, cacheKey]);

  return { models, isLoading };
}
