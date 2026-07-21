import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
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
    if (!token || !orgSlug) return;

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
