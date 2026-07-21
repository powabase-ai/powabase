

import { useState } from "react";
import { agentsApi, type AgentStats } from "@/lib/ai-api";
import type { Agent } from "@/hooks/ai/useProjectSupabaseClient";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { ModelSelector } from "@/components/interfaces/AI/Agents/ModelSelector";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";
import { ModelSelectionInfoBody } from "@/components/interfaces/AI/Shared/ModelSelectionInfo";

interface OverviewTabProps {
  agent: Agent;
  stats: AgentStats | null;
  onAgentUpdate: (updated: Agent) => void;
}

export function OverviewTab({ agent, stats, onAgentUpdate }: OverviewTabProps) {
  const { token, ref } = useProjectSupabaseClient();
  const settings = (agent.settings as Record<string, unknown>) || {};
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");
  const [model, setModel] = useState(agent.model || "");
  const [reasoningEffort, setReasoningEffort] = useState<string>(
    String(settings.reasoning_effort ?? "")
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== agent.name) updates.name = name;
      if (model !== (agent.model || "")) updates.model = model;
      if (systemPrompt !== (agent.system_prompt || "")) updates.system_prompt = systemPrompt;
      const currentEffort = String(settings.reasoning_effort ?? "");
      if (reasoningEffort !== currentEffort) {
        const newSettings = { ...settings };
        if (reasoningEffort.trim()) newSettings.reasoning_effort = reasoningEffort.trim();
        else delete newSettings.reasoning_effort;
        updates.settings = newSettings;
      }
      if (Object.keys(updates).length === 0) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return;
      }
      await agentsApi.update(token, ref, agent.id, updates);
      onAgentUpdate({ ...agent, ...updates } as Agent);
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

      {/* Name */}
      <div>
        <FieldLabel
          label="Name"
          description="Display name used in logs, the API, and orchestration references. Keep it short and descriptive."
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm"
        />
      </div>

      {/* Model + Reasoning effort */}
      <div className="rounded-lg border border-default bg-surface-100 p-5 space-y-5">
        <div>
          <FieldLabel
            label="Model"
            description="The primary LLM that powers this agent's reasoning loop. The selector groups models by tier — start in 'balanced' and move up only if you need to."
            infoTitle="Model selection"
            infoContent={<ModelSelectionInfoBody />}
          />
          <ModelSelector value={model} onChange={setModel} placeholder="Select a model..." />
        </div>

        <div className="ml-5 border-l border-default pl-4">
          <FieldLabel
            label="Reasoning effort"
            description="How much the model thinks before answering. Costs reasoning tokens. Only takes effect on reasoning-capable models (e.g., Claude Opus, GPT-5)."
            infoTitle="Reasoning effort"
            infoContent={
              <>
                <p><strong>None:</strong> No reasoning requested (default).</p>
                <p><strong>Minimal/Low/Medium/High:</strong> Increasing budgets. LiteLLM translates per provider — Anthropic thinking budget, OpenAI reasoning effort, Gemini thinking level.</p>
                <p>If your model doesn&apos;t support reasoning, this setting is silently ignored at runtime (logged for debugging).</p>
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

      {/* System Prompt */}
      <div>
        <FieldLabel
          label="System prompt"
          description="Instructions injected at the start of every conversation. Defines the agent's persona, behavior rules, and domain knowledge — invisible to end users."
          infoTitle="System prompt"
          infoContent={
            <>
              <p>
                The system prompt defines the agent&apos;s persona, behavior rules,
                and domain knowledge. It is injected at the start of every
                conversation and is invisible to end users.
              </p>
              <p>Use it to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Set a role or persona (e.g. &quot;You are a senior tax advisor&quot;)</li>
                <li>Define response constraints (tone, length, format)</li>
                <li>Provide domain-specific context or terminology</li>
                <li>Restrict behavior (e.g. &quot;Never share internal pricing&quot;)</li>
              </ul>
              <p className="font-mono text-xs bg-surface-200 p-3 rounded-md whitespace-pre-wrap">
                {`You are a helpful customer support agent for Acme Corp.\nAlways be polite and concise.\nIf you don't know the answer, say so — never guess.\nEscalate billing issues to a human.`}
              </p>
            </>
          }
        />
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={10}
          placeholder="You are a helpful assistant..."
          className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 text-sm leading-relaxed resize-y"
        />
      </div>

      {/* Save button */}
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

      {/* Stats */}
      {stats && (
        <div className="bg-surface-100 border border-muted rounded-lg p-6">
          <h3 className="text-sm font-medium text-foreground mb-4">Stats</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-foreground-muted">Sessions</dt>
              <dd className="text-lg font-semibold text-foreground mt-0.5">{stats.session_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Total runs</dt>
              <dd className="text-lg font-semibold text-foreground mt-0.5">{stats.total_runs}</dd>
            </div>
            {Object.entries(stats.runs_by_status).map(([status, count]) => (
              <div key={status}>
                <dt className="text-xs text-foreground-muted capitalize">{status}</dt>
                <dd className="text-lg font-semibold text-foreground mt-0.5">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Details */}
      <div className="bg-surface-100 border border-muted rounded-lg p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">Details</h3>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-foreground-muted">Agent ID</dt>
            <dd className="text-foreground font-mono text-xs truncate mt-0.5">{agent.id}</dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Created</dt>
            <dd className="text-foreground mt-0.5">
              {agent.created_at ? new Date(agent.created_at).toLocaleString() : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Updated</dt>
            <dd className="text-foreground mt-0.5">
              {agent.updated_at ? new Date(agent.updated_at).toLocaleString() : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
