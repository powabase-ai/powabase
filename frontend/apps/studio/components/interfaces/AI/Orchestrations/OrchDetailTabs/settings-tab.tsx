

import { useState } from "react";
import { useRouter } from "next/router";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, orchestrationsApi, type Orchestration } from "@/lib/ai-api";
import { ModelSelector } from "@/components/interfaces/AI/Agents/ModelSelector";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";
import { ModelSelectionInfoBody } from "@/components/interfaces/AI/Shared/ModelSelectionInfo";

interface SettingsTabProps {
  orchestration: Orchestration;
  onUpdate: (updated: Orchestration) => void;
}

export function SettingsTab({ orchestration, onUpdate }: SettingsTabProps) {
  const { token, ref } = useProjectSupabaseClient();
  const router = useRouter();
  const settings = orchestration.settings || {};
  const orchConfig = (settings.orchestrator_config as Record<string, unknown>) || {};

  const [maxSteps, setMaxSteps] = useState(String(settings.max_steps ?? "25"));
  const [model, setModel] = useState(String(settings.model ?? "gpt-5.4"));
  const [fallbackModel, setFallbackModel] = useState(String(settings.fallback_model ?? ""));
  const [reasoningEffort, setReasoningEffort] = useState<string>(
    String(orchConfig.reasoning_effort ?? "")
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    if (!hasAiAuth(token)) return;
    setIsSaving(true);
    setError(null);
    try {
      const newSettings: Record<string, unknown> = {
        ...settings,
        max_steps: parseInt(maxSteps) || 25,
        model: model.trim() || "gpt-5.4",
      };
      if (fallbackModel.trim()) newSettings.fallback_model = fallbackModel.trim();
      else delete newSettings.fallback_model;

      // reasoning_effort goes under orchestrator_config (backend reads it from there)
      const existingOrchConfig = (newSettings.orchestrator_config as Record<string, unknown>) || {};
      const newOrchConfig: Record<string, unknown> = { ...existingOrchConfig };
      if (reasoningEffort.trim()) {
        newOrchConfig.reasoning_effort = reasoningEffort.trim();
      } else {
        delete newOrchConfig.reasoning_effort;
      }
      if (Object.keys(newOrchConfig).length > 0) {
        newSettings.orchestrator_config = newOrchConfig;
      } else {
        delete newSettings.orchestrator_config;
      }

      const updated = await orchestrationsApi.update(token, ref, orchestration.id, {
        settings: newSettings,
      });
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!hasAiAuth(token) || !confirm(`Delete orchestration "${orchestration.name}"?`)) return;
    setIsDeleting(true);
    try {
      await orchestrationsApi.delete(token, ref, orchestration.id);
      router.push(`/project/${ref}/orchestrations`);
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
        <div className="rounded-lg border border-default bg-surface-100 p-5 space-y-5">
          <div>
            <FieldLabel
              label="Orchestrator model"
              description="The LLM that powers the orchestrator's routing decisions. More capable models make better delegation choices but cost more per step."
              infoTitle="Orchestrator model"
              infoContent={
                <>
                  <p>
                    The orchestrator is itself an LLM-powered agent. It reads
                    the user message, examines the available agents and tools,
                    and decides how to delegate work. For supervisor-strategy
                    orchestrations, prefer a balanced or flagship model — the
                    routing decisions multiply the value of every downstream
                    delegation.
                  </p>
                  <ModelSelectionInfoBody />
                </>
              }
            />
            <ModelSelector value={model} onChange={setModel} />
          </div>

          <div className="ml-5 border-l border-default pl-4">
            <FieldLabel
              label="Reasoning effort"
              description="How much the orchestrator thinks before deciding which agents to delegate to. Helps with complex routing decisions."
              infoTitle="Orchestrator reasoning effort"
              infoContent={
                <>
                  <p>Affects only the orchestrator&apos;s own ReAct loop (delegation decisions). Worker agents have their own reasoning_effort settings.</p>
                  <p><strong>None:</strong> No reasoning requested (default).</p>
                  <p><strong>Minimal/Low/Medium/High:</strong> Increasing budgets — translated per-provider by LiteLLM.</p>
                  <p>If the orchestrator&apos;s model doesn&apos;t support reasoning, this setting is silently ignored at runtime.</p>
                </>
              }
            />
            <select
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(e.target.value)}
              className="w-full max-w-xs px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
            >
              <option value="">None</option>
              <option value="minimal">Minimal</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div>
          <FieldLabel
            label="Max steps"
            description="Maximum ReAct iterations for the orchestrator. Each step is the orchestrator thinking and either delegating to an agent, calling a tool, or producing a final answer. Default: 25."
            infoTitle="Max steps"
            infoContent={
              <p>Each step = the orchestrator thinking and either delegating to an agent, calling a tool, or producing a final answer. Default: 25.</p>
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
            description="Automatic failover when the primary model is rate-limited or unavailable. Leave empty to disable."
          />
          <input
            type="text"
            value={fallbackModel}
            onChange={(e) => setFallbackModel(e.target.value)}
            placeholder="None (no fallback)"
            className="w-full max-w-xs px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
          />
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

      <div className="border-t border-muted pt-8">
        <h3 className="text-sm font-medium text-destructive-600 mb-1">Danger zone</h3>
        <p className="text-xs text-foreground-muted mb-4 leading-normal">Permanently deletes this orchestration, all entity assignments, hooks, sessions, and run history. This cannot be undone.</p>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-destructive-600 text-sm font-medium rounded-md transition border border-default"
        >
          {isDeleting ? "Deleting..." : "Delete orchestration"}
        </button>
      </div>
    </div>
  );
}
