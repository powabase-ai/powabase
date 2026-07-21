

import { useEffect, useState } from "react";
import { Bot, Wrench } from "lucide-react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import {
  orchestrationsApi,
  type OrchestrationEntity,
  toolsApi,
  type CustomTool,
  agentsApi,
  type AgentListItem,
  hasAiAuth,
} from "@/lib/ai-api";
import { FieldLabel, InfoTooltip } from "@/components/interfaces/AI/Shared/InfoTooltip";

interface EntitiesTabProps {
  orchId: string;
}

// Backend page size ceiling (services/list_params.py clamps limit to [1, 100]).
// See kb-tab.tsx for the same tradeoff on a similar "pick from all N" dropdown.
const MAX_AGENTS_FOR_PICKER = 100;

export function EntitiesTab({ orchId }: EntitiesTabProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [entities, setEntities] = useState<OrchestrationEntity[]>([]);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add agent form
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  // Add tool form
  const [showAddTool, setShowAddTool] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState("");

  // Configure entity panel
  const [configuringEntity, setConfiguringEntity] = useState<OrchestrationEntity | null>(null);
  const [configRole, setConfigRole] = useState("");
  const [configMaxSteps, setConfigMaxSteps] = useState("");

  const fetchData = async () => {
    if (!isReady || !hasAiAuth(token)) return;
    setIsLoading(true);
    try {
      const [entityRes, agentRes, toolRes] = await Promise.all([
        orchestrationsApi.listEntities(token, ref, orchId),
        agentsApi.list(token, ref, { limit: MAX_AGENTS_FOR_PICKER }),
        toolsApi.list(token, ref),
      ]);
      setEntities(entityRes.entities);
      setAgents(agentRes.items);
      setTools(toolRes.tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isReady, token, orchId]);

  const handleAddAgent = async () => {
    if (!hasAiAuth(token) || !selectedAgentId) return;
    try {
      await orchestrationsApi.addEntity(token, ref, orchId, {
        entity_type: "agent",
        entity_ref_id: selectedAgentId,
        role_description: roleDescription || undefined,
        position: entities.length,
      });
      setShowAddAgent(false);
      setSelectedAgentId("");
      setRoleDescription("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    }
  };

  const handleAddTool = async () => {
    if (!hasAiAuth(token) || !selectedToolId) return;
    try {
      await orchestrationsApi.addEntity(token, ref, orchId, {
        entity_type: "tool",
        entity_ref_id: selectedToolId,
      });
      setShowAddTool(false);
      setSelectedToolId("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tool");
    }
  };

  const handleRemoveEntity = async (entityId: string) => {
    if (!hasAiAuth(token) || !confirm("Remove this entity?")) return;
    try {
      await orchestrationsApi.removeEntity(token, ref, orchId, entityId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const handleSaveConfig = async () => {
    if (!hasAiAuth(token) || !configuringEntity) return;
    try {
      const updates: Record<string, unknown> = {};
      if (configRole !== (configuringEntity.role_description || "")) updates.role_description = configRole;
      if (configMaxSteps) {
        updates.config = { ...configuringEntity.config, max_steps: parseInt(configMaxSteps) || 10 };
      }
      await orchestrationsApi.updateEntity(token, ref, orchId, configuringEntity.id, updates);
      setConfiguringEntity(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const getEntityName = (entity: OrchestrationEntity): string => {
    if (entity.entity_type === "agent") {
      const agent = agents.find((a) => a.id === entity.entity_ref_id);
      return agent?.name || entity.agent_name || entity.entity_ref_id;
    }
    const tool = tools.find((t) => t.id === entity.entity_ref_id);
    return tool?.name || entity.tool_name || entity.entity_ref_id;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-sm text-destructive-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-start gap-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Agents & Tools</h3>
          <p className="text-xs text-foreground-muted mt-1 leading-normal">The agents and tools available to the orchestrator. Agents handle delegated tasks with their own model, tools, and knowledge bases. Tools are called directly by the orchestrator for simple lookups or API calls.</p>
        </div>
        <InfoTooltip title="Entities">
          <p>Entities are the building blocks of an orchestration:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Agents</strong> — Autonomous AI agents that receive delegated tasks. Each agent uses its own model, tools, and knowledge bases. The orchestrator decides when to invoke them.</li>
            <li><strong>Tools</strong> — Direct tools (HTTP endpoints) that the orchestrator can call without delegation. Useful for simple lookups or API calls.</li>
          </ul>
          <p>Position determines the order shown in the UI. For the Supervisor strategy, the orchestrator decides execution order dynamically.</p>
        </InfoTooltip>
      </div>

      {/* Entity list */}
      {entities.length === 0 ? (
        <p className="text-sm text-foreground-muted">No entities added yet. Add agents or tools below to build your orchestration.</p>
      ) : (
        <div className="space-y-2">
          {entities
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((entity, i) => (
              <div
                key={entity.id}
                className="p-4 bg-surface-100 border border-muted rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground-muted">{i + 1}.</span>
                      {entity.entity_type === "agent" ? (
                        <Bot size={14} className="text-foreground-light shrink-0" />
                      ) : (
                        <Wrench size={14} className="text-foreground-light shrink-0" />
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {getEntityName(entity)}
                      </span>
                    </div>
                    {entity.role_description && (
                      <p className="text-xs text-foreground-muted mt-1 ml-8">
                        Role: &quot;{entity.role_description}&quot;
                      </p>
                    )}
                    {entity.config && "max_steps" in entity.config && (
                      <p className="text-xs text-foreground-muted mt-0.5 ml-8">
                        Max steps: {String(entity.config.max_steps)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {entity.entity_type === "agent" && (
                      <button
                        onClick={() => {
                          setConfiguringEntity(entity);
                          setConfigRole(entity.role_description || "");
                          setConfigMaxSteps(String(entity.config?.max_steps || ""));
                        }}
                        className="text-xs text-brand-600 hover:text-brand-600"
                      >
                        Configure
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveEntity(entity.id)}
                      className="text-xs text-foreground-muted hover:text-destructive-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Configure panel */}
      {configuringEntity && (
        <div className="p-4 bg-surface-100 border border-default rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-foreground">
            Configure: {getEntityName(configuringEntity)}
          </h4>
          <div>
            <FieldLabel
              label="Role description"
              description="Injected into the orchestrator's prompt so it knows when and how to use this agent. Be specific about capabilities and intended use cases."
              infoTitle="Role description"
              infoContent={
                <>
                  <p>The role description is injected into the orchestrator&apos;s prompt so it knows the agent&apos;s purpose.</p>
                  <p className="font-mono text-xs bg-surface-200 p-3 rounded-md">Example: &quot;Handles customer billing inquiries. Can look up invoices, process refunds, and update payment methods.&quot;</p>
                </>
              }
            />
            <textarea
              value={configRole}
              onChange={(e) => setConfigRole(e.target.value)}
              rows={4}
              placeholder="Handles customer billing inquiries. Can look up invoices, process refunds, and update payment methods."
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 leading-relaxed resize-y"
            />
          </div>
          <div>
            <FieldLabel
              label="Max steps"
              description="Override the agent's default max ReAct iterations for this orchestration. Leave blank to use the agent's own setting."
            />
            <input
              type="number"
              value={configMaxSteps}
              onChange={(e) => setConfigMaxSteps(e.target.value)}
              placeholder="10"
              className="w-32 px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveConfig} className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2">Save</button>
            <button onClick={() => setConfiguringEntity(null)} className="px-4 py-2 bg-surface-200 text-foreground text-sm rounded-md transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Add buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        {showAddAgent ? (
          <div className="flex-1 p-4 bg-surface-100 border border-default rounded-lg space-y-3">
            <h4 className="text-sm font-medium text-foreground">Add Agent</h4>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">Select an agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Role description (optional)"
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleAddAgent} disabled={!selectedAgentId} className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2">Add</button>
              <button type="button" onClick={() => setShowAddAgent(false)} className="px-4 py-2 bg-surface-200 text-foreground text-sm rounded-md transition">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddAgent(true)} className="text-sm text-brand-600 hover:text-brand-600">+ Add Agent</button>
        )}

        {showAddTool ? (
          <div className="flex-1 p-4 bg-surface-100 border border-default rounded-lg space-y-3">
            <h4 className="text-sm font-medium text-foreground">Add Direct Tool</h4>
            <select
              value={selectedToolId}
              onChange={(e) => setSelectedToolId(e.target.value)}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">Select a tool...</option>
              {tools.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddTool} disabled={!selectedToolId} className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2">Add</button>
              <button type="button" onClick={() => setShowAddTool(false)} className="px-4 py-2 bg-surface-200 text-foreground text-sm rounded-md transition">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddTool(true)} className="text-sm text-brand-600 hover:text-brand-600">+ Add Tool</button>
        )}
      </div>
    </div>
  );
}
