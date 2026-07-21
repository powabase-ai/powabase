import { useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentsApi, hasAiAuth } from "@/lib/ai-api";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";
import { ModelSelectionInfoBody } from "@/components/interfaces/AI/Shared/ModelSelectionInfo";
import { ModelSelector } from "@/components/interfaces/AI/Agents/ModelSelector";

const DEFAULT_MODEL = "gpt-5-nano";

export interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAgentModal({ open, onOpenChange, onSuccess }: CreateAgentModalProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [createName, setCreateName] = useState("");
  const [createModel, setCreateModel] = useState(DEFAULT_MODEL);
  const [createSystemPrompt, setCreateSystemPrompt] = useState("");
  const [createMaxContextTokens, setCreateMaxContextTokens] = useState<string>("32000");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCreateName("");
    setCreateModel(DEFAULT_MODEL);
    setCreateSystemPrompt("");
    setCreateMaxContextTokens("32000");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || !hasAiAuth(token) || !createName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await agentsApi.create(token, ref, {
        name: createName.trim(),
        model: createModel.trim() || "gpt-4",
        system_prompt: createSystemPrompt.trim() || null,
        settings: {
          max_context_tokens: parseInt(createMaxContextTokens) || 32000,
        },
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-100 border border-default rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar">
        <h3 className="text-xl font-semibold text-foreground mb-4">Create agent</h3>

        {error && (
          <div className="mb-4 p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline ml-2">
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreate}>
          <div className="space-y-4 mb-6">
            <div>
              <FieldLabel
                htmlFor="create-agent-name"
                label="Name"
                description="A unique, human-readable identifier for this agent."
              />
              <input
                id="create-agent-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Customer support agent"
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                required
                autoFocus
              />
            </div>
            <div>
              <FieldLabel
                label="Model"
                description="The primary LLM powering this agent."
                infoTitle="Model selection"
                infoContent={<ModelSelectionInfoBody />}
              />
              <ModelSelector value={createModel} onChange={setCreateModel} />
            </div>
            <div>
              <FieldLabel
                label="System prompt"
                description="Instructions that define the agent's persona and behavior."
                infoContent={
                  <>
                    <p>The system prompt is prepended to every conversation with this agent. It controls:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <strong>Persona</strong> — Who the agent is (e.g., &quot;You are a customer support specialist&quot;).
                      </li>
                      <li>
                        <strong>Behavior rules</strong> — Constraints, tone, formatting preferences.
                      </li>
                      <li>
                        <strong>Domain knowledge</strong> — Context the agent should always have.
                      </li>
                    </ul>
                    <p className="font-mono text-xs bg-surface-200 p-3 rounded-md">
                      Example: &quot;You are a helpful support agent for Acme Corp. Always greet the customer by name. Escalate billing issues to a human. Respond in the customer&apos;s language.&quot;
                    </p>
                    <p>Leave blank to use default behavior. You can edit this after creation.</p>
                  </>
                }
              />
              <textarea
                value={createSystemPrompt}
                onChange={(e) => setCreateSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                rows={3}
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <FieldLabel
                label="Max context tokens"
                description="Maximum tokens of retrieved context (from knowledge bases) sent to the LLM per query."
                infoContent={
                  <>
                    <p>
                      When the agent queries a knowledge base, retrieved chunks are injected into the LLM prompt. This setting
                      limits how many tokens of retrieved context are included.
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <strong>Lower values</strong> (e.g., 4000) — Faster, cheaper, but may miss relevant context.
                      </li>
                      <li>
                        <strong>Higher values</strong> (e.g., 64000) — More context available, but slower and more expensive.
                      </li>
                    </ul>
                    <p>Range: 1,000 – 128,000. Default: 32,000.</p>
                  </>
                }
              />
              <input
                type="number"
                value={createMaxContextTokens}
                onChange={(e) => setCreateMaxContextTokens(e.target.value)}
                placeholder="32000"
                min={1000}
                max={128000}
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-foreground-light hover:text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !createName.trim()}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
