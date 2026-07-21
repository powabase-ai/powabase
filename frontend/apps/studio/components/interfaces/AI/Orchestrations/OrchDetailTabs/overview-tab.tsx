

import { useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, orchestrationsApi, type Orchestration } from "@/lib/ai-api";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  supervisor: "A central orchestrator LLM reads the user message and decides which agent(s) to delegate to, in what order.",
  sequential: "Agents execute in a fixed order. Each agent's output becomes the next agent's input.",
  parallel: "All agents execute simultaneously and results are merged.",
};

interface OverviewTabProps {
  orchestration: Orchestration;
  onUpdate: (updated: Orchestration) => void;
}

export function OverviewTab({ orchestration, onUpdate }: OverviewTabProps) {
  const { token, ref } = useProjectSupabaseClient();

  const [name, setName] = useState(orchestration.name);
  const [description, setDescription] = useState(orchestration.description || "");
  const orchConfig = (orchestration.settings?.orchestrator_config as Record<string, string>) || {};
  const [additionalInstructions, setAdditionalInstructions] = useState(orchConfig.additional_instructions || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!hasAiAuth(token)) return;
    setIsSaving(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== orchestration.name) updates.name = name;
      if (description !== (orchestration.description || "")) updates.description = description;
      const newSettings = {
        ...orchestration.settings,
        orchestrator_config: {
          ...((orchestration.settings?.orchestrator_config as Record<string, unknown>) || {}),
          additional_instructions: additionalInstructions,
        },
      };
      updates.settings = newSettings;
      const updated = await orchestrationsApi.update(token, ref, orchestration.id, updates);
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-sm text-destructive-600">
          {error}
        </div>
      )}

      <div>
        <FieldLabel label="Name" description="Display name shown in the orchestration list, logs, and API responses." />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
        />
      </div>

      <div>
        <FieldLabel label="Description" description="A brief summary of what this orchestration does. Shown in the list view and useful for team context." />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the purpose of this orchestration..."
          className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm leading-relaxed resize-y"
        />
      </div>

      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-sm font-medium text-foreground">Strategy</span>
          <span className="text-xs px-2 py-0.5 bg-surface-200 rounded-full text-foreground-light capitalize">
            {orchestration.strategy}
          </span>
        </div>
        <p className="text-xs text-foreground-muted leading-normal">
          {STRATEGY_DESCRIPTIONS[orchestration.strategy] || orchestration.strategy}
        </p>
      </div>

      <div>
        <FieldLabel
          label="System prompt"
          description="Additional instructions appended to the orchestrator's built-in system prompt. Use to set delegation preferences, constraints, or domain context for routing decisions."
          infoTitle="System prompt"
          infoContent={
            <>
              <p>These instructions are appended to the orchestrator&apos;s built-in system prompt. Use them to:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Specify delegation preferences (e.g., &quot;Always try Agent A first for billing questions&quot;)</li>
                <li>Set constraints (e.g., &quot;Never delegate PII-containing messages to the external API tool&quot;)</li>
                <li>Provide domain context the orchestrator needs for routing decisions</li>
              </ul>
              <p className="font-mono text-xs bg-surface-200 p-3 rounded-md">Example: &quot;For customer complaints, always delegate to the Support Agent first. If the Support Agent cannot resolve it, escalate to the Supervisor Agent.&quot;</p>
            </>
          }
        />
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          rows={8}
          placeholder="For customer complaints, always delegate to the Support Agent first..."
          className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm leading-relaxed resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </div>
  );
}
