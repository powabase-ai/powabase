/**
 * Shared condition evaluation for sub-block visibility.
 *
 * Used by BlockConfigPanel, BlockNode, and WorkflowCanvas to determine
 * whether a sub-block should be visible given the current config state.
 */

import type { SubBlockCondition } from "@/data/ai-workflows/block-registry";

/**
 * Recursively evaluate a compound condition against a config object.
 *
 * - `value` may be a single value (strict equality) or an array (OR match).
 * - `not` negates the match result.
 * - `and` chains another condition (both must be true).
 */
export function evaluateCondition(
  condition: SubBlockCondition | undefined,
  config: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  const fieldValue = config[condition.field];

  const valueMatch = Array.isArray(condition.value)
    ? (condition.value as unknown[]).includes(fieldValue)
    : fieldValue === condition.value;

  const match = condition.not ? !valueMatch : valueMatch;

  if (!match) return false;

  return condition.and ? evaluateCondition(condition.and, config) : true;
}
