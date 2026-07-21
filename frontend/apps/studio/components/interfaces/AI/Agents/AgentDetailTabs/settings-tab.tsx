

import { useState } from "react";
import { useRouter } from "next/router";
import type { Agent } from "@/hooks/ai/useProjectSupabaseClient";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentsApi } from "@/lib/ai-api";
import { JsonSchemaEditor } from "@/components/interfaces/AI/Agents/JsonSchemaEditor";
import { ModelSelector } from "@/components/interfaces/AI/Agents/ModelSelector";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";

interface SettingsTabProps {
  agent: Agent;
  onAgentUpdate: (updated: Agent) => void;
}

export function SettingsTab({ agent, onAgentUpdate }: SettingsTabProps) {
  const router = useRouter();
  const { token, ref: projectRef } = useProjectSupabaseClient();
  const settings = (agent.settings as Record<string, unknown>) || {};

  const [maxSteps, setMaxSteps] = useState(String(settings.max_steps ?? "25"));
  const [fallbackModel, setFallbackModel] = useState(String(settings.fallback_model ?? ""));
  const [maxContextTokens, setMaxContextTokens] = useState(String(settings.max_context_tokens ?? "32000"));
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(settings.timeout_seconds ?? ""));
  const [structuredOutput, setStructuredOutput] = useState(!!settings.response_format);
  const [responseSchema, setResponseSchema] = useState<Record<string, unknown> | null>(
    (settings.response_format as Record<string, unknown>) || null
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const newSettings: Record<string, unknown> = {
        ...settings,
        max_steps: parseInt(maxSteps) || 25,
        max_context_tokens: parseInt(maxContextTokens) || 32000,
      };
      if (fallbackModel.trim()) newSettings.fallback_model = fallbackModel.trim();
      else delete newSettings.fallback_model;
      if (timeoutSeconds.trim()) newSettings.timeout_seconds = parseInt(timeoutSeconds) || undefined;
      else delete newSettings.timeout_seconds;
      if (structuredOutput && responseSchema) newSettings.response_format = responseSchema;
      else delete newSettings.response_format;

      await agentsApi.update(token, projectRef, agent.id, { settings: newSettings });
      onAgentUpdate({ ...agent, settings: newSettings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await agentsApi.delete(token, projectRef, agent.id);
      router.push(`/project/${projectRef}/agents`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-sm text-destructive-600">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <FieldLabel
            label="Max steps"
            description="Maximum ReAct loop iterations per run. Each step is one think → tool call → observe cycle. Higher values allow more complex tasks but increase cost. Default: 25."
            infoTitle="Max steps"
            infoContent={
              <>
                <p>
                  Each step is one <strong>think → tool call → observe</strong> cycle
                  in the ReAct reasoning loop. Higher values let the agent attempt
                  more complex, multi-step tasks but increase cost and latency.
                </p>
                <p>
                  The agent stops early if it reaches a final answer before hitting
                  the limit. Default: <strong>25</strong>.
                </p>
              </>
            }
          />
          <input
            type="number"
            value={maxSteps}
            onChange={(e) => setMaxSteps(e.target.value)}
            min={1}
            max={100}
            className="w-32 px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
          />
        </div>

        <div>
          <FieldLabel
            label="Fallback model"
            description="If the primary model returns a rate-limit or server error, the agent automatically retries with this model. Leave empty to disable."
            infoTitle="Fallback model"
            infoContent={
              <>
                <p>
                  If the primary model returns a rate-limit or server error, the
                  agent automatically retries with this model. Useful for
                  high-availability setups.
                </p>
                <p>
                  Leave empty to disable fallback.
                </p>
              </>
            }
          />
          <ModelSelector value={fallbackModel} onChange={setFallbackModel} allowEmpty placeholder="None (no fallback)" />
        </div>

        <div>
          <FieldLabel
            label="Max context tokens"
            description="Token budget for knowledge base context injected into the LLM prompt. Higher values provide more context but increase latency and cost. Default: 32,000."
            infoTitle="Max context tokens"
            infoContent={
              <>
                <p>
                  Controls how much retrieved knowledge base content is injected
                  into the LLM prompt. Higher values provide more context but
                  increase latency and cost.
                </p>
                <p>
                  Default: <strong>32,000</strong>.
                </p>
              </>
            }
          />
          <input
            type="number"
            value={maxContextTokens}
            onChange={(e) => setMaxContextTokens(e.target.value)}
            min={1000}
            max={1000000}
            className="w-40 px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
          />
        </div>

        <div>
          <FieldLabel
            label="Timeout"
            description="Hard time limit in seconds for the entire agent run. If the agent hasn't finished, the run is terminated. Leave blank for the platform default (300s)."
            infoTitle="Timeout"
            infoContent={
              <>
                <p>
                  If the agent hasn&apos;t produced a final answer within this time,
                  the run is terminated with an error.
                </p>
                <p>
                  Leave blank for no timeout (the platform default of 300s still
                  applies).
                </p>
              </>
            }
          />
          <input
            type="number"
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(e.target.value)}
            placeholder="300"
            min={5}
            max={600}
            className="w-32 px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
          />
        </div>

        <div>
          <FieldLabel
            label="Structured output"
            description="Force the agent's final response to conform to a JSON Schema. Useful for building APIs or feeding structured data into downstream systems."
            infoTitle="Structured output (JSON Schema)"
            infoContent={
              <>
                <p>
                  When enabled, the agent&apos;s final response must conform to the
                  provided JSON Schema. Useful for building APIs or feeding
                  structured data into downstream systems.
                </p>
                <p className="font-mono text-xs bg-surface-200 p-3 rounded-md whitespace-pre-wrap">
                  {`{\n  "type": "object",\n  "properties": {\n    "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral"] },\n    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }\n  },\n  "required": ["sentiment", "confidence"]\n}`}
                </p>
              </>
            }
          />
          <label className="flex items-center gap-2 text-sm text-foreground-light">
            <input
              type="checkbox"
              checked={structuredOutput}
              onChange={(e) => setStructuredOutput(e.target.checked)}
              className="h-4 w-4 rounded border-default text-brand-600"
            />
            Enable structured output
          </label>
          {structuredOutput && (
            <div className="mt-3 max-w-lg">
              <JsonSchemaEditor value={responseSchema} onChange={setResponseSchema} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
          >
            {isSaving ? "Saving..." : "Save settings"}
          </button>
          {saved && <span className="text-sm text-emerald-300">Saved</span>}
        </div>
      </div>

      {/* Danger zone */}
      <div className="border-t border-muted pt-8">
        <h3 className="text-sm font-medium text-destructive-600 mb-1">Danger zone</h3>
        <p className="text-xs text-foreground-muted mb-4 leading-normal">
          Permanently deletes this agent and all associated sessions, runs, tool assignments, hooks, and knowledge base links. This cannot be undone.
        </p>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-destructive-600 text-sm font-medium rounded-md transition border border-default"
        >
          {isDeleting ? "Deleting..." : "Delete agent"}
        </button>
      </div>
    </div>
  );
}
