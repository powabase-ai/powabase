import { useEffect, useMemo } from "react";
import { useLLMModels } from "@/hooks/ai/useLLMModels";

/**
 * Every effort level a model in the catalog can offer. Used when nothing is
 * known about the selected model: an id the catalog doesn't list (a custom or
 * backend-set model), or a catalog that carries no reasoning metadata.
 */
export const GENERIC_REASONING_EFFORTS: readonly string[] = ["minimal", "low", "medium", "high"];

export function effortLabel(effort: string): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export interface ModelReasoningEfforts {
  /** Whether to render the reasoning-effort control at all. */
  show: boolean;
  /** Effort levels to offer, excluding the empty "provider default" option. */
  efforts: readonly string[];
}

/**
 * Model-aware reasoning-effort options for a model picker, sourced from the
 * models catalog (same approach as the knowledge-base model select):
 *
 * - catalog model that reasons → only its own `reasoning_efforts`;
 * - catalog model that doesn't reason → control hidden;
 * - off-catalog model, or reasoning support unknown → the generic ladder,
 *   since nothing rules any level out;
 * - catalog still loading → control hidden, nothing cleared.
 *
 * When the selected catalog model doesn't support the current effort (e.g.
 * after switching models), the effort is cleared via `onEffortChange("")` so
 * a stale value is never saved.
 */
export function useModelReasoningEfforts(
  modelId: string,
  effort: string,
  onEffortChange: (value: string) => void
): ModelReasoningEfforts {
  const { models, isLoading } = useLLMModels();

  const selected = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const known = !!selected && !selected.reasoning_unknown;
  const supportsReasoning = known && !!selected.supports_reasoning;
  const efforts = known ? selected.reasoning_efforts ?? [] : GENERIC_REASONING_EFFORTS;

  useEffect(() => {
    if (!effort || isLoading || !known) return;
    if (!supportsReasoning || !efforts.includes(effort)) onEffortChange("");
    // `efforts` is derived from `selected`; depend on that instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, known, supportsReasoning, effort, isLoading]);

  return {
    show: !isLoading && (!known || supportsReasoning),
    efforts,
  };
}
