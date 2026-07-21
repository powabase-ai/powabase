import { useEffect, useMemo } from "react";
import { useLLMModels } from "@/hooks/ai/useLLMModels";
import type { ModelInfo } from "@/lib/ai-api/models-api";

const TIERS = ["flagship", "balanced", "fast", "reasoning"] as const;

const INPUT_CLASS =
  "w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400";

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function effortLabel(effort: string): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export interface KBModelSelectProps {
  label: string;
  /** Help text rendered under the model dropdown. */
  description?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Current reasoning-effort value ("" = provider default). When
   * `onReasoningEffortChange` is provided AND the selected model supports
   * reasoning, a reasoning-effort dropdown is revealed beneath the model
   * dropdown; otherwise it is hidden. Switching to a model that can't reason
   * (or whose effort set no longer contains the value) clears the effort so a
   * stale value is never persisted.
   */
  reasoningEffort?: string;
  onReasoningEffortChange?: (value: string) => void;
}

/**
 * Knowledge-base LLM model picker: a catalog-backed dropdown (replacing the
 * old freeform text input) plus an optional, model-aware reasoning-effort
 * dropdown. Used for every KB field where a chat LLM is selected (tree
 * building, enrichment, summarization, extraction, retrieval, query
 * enrichment). Embedding models are NOT chat LLMs and keep their own input.
 */
export function KBModelSelect({
  label,
  description,
  value,
  onChange,
  reasoningEffort,
  onReasoningEffortChange,
}: KBModelSelectProps) {
  const { models, isLoading } = useLLMModels();

  const selected = useMemo(
    () => models.find((m) => m.id === value),
    [models, value]
  );
  const efforts = selected?.reasoning_efforts ?? [];
  const supportsReasoning = !!selected?.supports_reasoning;
  const showReasoning = !!onReasoningEffortChange && supportsReasoning;

  // Never persist a reasoning effort the selected model can't honour. Once the
  // catalog has loaded and a model is resolved, clear the effort if the model
  // doesn't reason or no longer lists the chosen effort.
  // Known minor edge (accepted): a *partial/stale* catalog mid rolling-deploy
  // (model present but its effort set has shifted) could clear a still-valid
  // saved effort here. A fully-failed catalog is already safe (`!selected`
  // early-returns and preserves the value); this narrower window is not worth
  // guarding given saved configs are re-validated on the next clean load.
  useEffect(() => {
    if (!onReasoningEffortChange || !reasoningEffort) return;
    if (isLoading || !selected) return;
    if (!supportsReasoning || !efforts.includes(reasoningEffort)) {
      onReasoningEffortChange("");
    }
    // `efforts` is derived from `selected`; depend on the stable join key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, supportsReasoning, reasoningEffort, isLoading]);

  const modelsByTier = useMemo(() => {
    const grouped: Record<string, ModelInfo[]> = {};
    for (const m of models) (grouped[m.tier] ??= []).push(m);
    return grouped;
  }, [models]);

  return (
    <div>
      <label className="block text-xs text-foreground-lighter mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoading}
        className={INPUT_CLASS}
      >
        {isLoading && <option value={value}>Loading models…</option>}
        {!isLoading && !value && <option value="">Select a model…</option>}
        {/* Preserve a previously-saved value not in the curated catalog (e.g.
            a custom model from before this field became a dropdown). */}
        {!isLoading && value && !selected && (
          <option value={value}>{value} (custom)</option>
        )}
        {!isLoading &&
          TIERS.map((tier) => {
            const tierModels = modelsByTier[tier];
            if (!tierModels || tierModels.length === 0) return null;
            return (
              <optgroup key={tier} label={tierLabel(tier)}>
                {tierModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                    {m.recommended ? " ★" : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
      </select>
      {description && <p className="text-xs text-foreground-muted mt-1">{description}</p>}

      {showReasoning && (
        <div className="mt-2">
          <label className="block text-xs text-foreground-lighter mb-1">Reasoning effort</label>
          <select
            value={reasoningEffort ?? ""}
            onChange={(e) => onReasoningEffortChange?.(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Default</option>
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effortLabel(effort)}
              </option>
            ))}
          </select>
          <p className="text-xs text-foreground-muted mt-1">
            How hard the model thinks before answering — higher is more thorough
            but costs more reasoning tokens.
            {efforts.includes("minimal")
              ? " “minimal” is OpenAI gpt-5-specific."
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
