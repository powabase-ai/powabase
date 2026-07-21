

import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentHooksApi, hasAiAuth, type AgentHook } from "@/lib/ai-api";
import { orchestrationsApi } from "@/lib/ai-api/orchestrations-api";

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "PreResponse", "OnRunStart", "OnRunComplete"];
const HOOK_TYPES = ["approval", "http", "rule"];

interface HooksTabProps {
  agentId: string;
  orchestrationId?: string;
}

export function HooksTab({ agentId, orchestrationId }: HooksTabProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [hooks, setHooks] = useState<AgentHook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add hook form
  const [showAdd, setShowAdd] = useState(false);
  const [newEvent, setNewEvent] = useState("PreToolUse");
  const [newMatcher, setNewMatcher] = useState("");
  const [newType, setNewType] = useState("approval");
  const [isAdding, setIsAdding] = useState(false);

  // Type-specific config state
  const [approvalMessage, setApprovalMessage] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpTimeout, setHttpTimeout] = useState(10);
  const [ruleField, setRuleField] = useState("input");
  const [ruleOperator, setRuleOperator] = useState("CONTAINS");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleMessage, setRuleMessage] = useState("");

  const events = orchestrationId
    ? [...HOOK_EVENTS, "OnDelegation"]
    : HOOK_EVENTS;

  const fetchHooks = async (showLoading = false) => {
    if (!isReady || !hasAiAuth(token)) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = orchestrationId
        ? await orchestrationsApi.listHooks(token, ref, orchestrationId)
        : await agentHooksApi.list(token, ref, agentId);
      setHooks(res.hooks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hooks");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHooks(true);
  }, [isReady, token, agentId, orchestrationId]);

  const buildConfig = (): Record<string, unknown> => {
    switch (newType) {
      case "approval":
        return { message: approvalMessage };
      case "http":
        return { url: httpUrl, timeout: httpTimeout };
      case "rule":
        return { field: ruleField, operator: ruleOperator, value: ruleValue, action: "deny", message: ruleMessage };
      default:
        return {};
    }
  };

  const handleAdd = async () => {
    if (!hasAiAuth(token)) return;
    setIsAdding(true);
    try {
      const data = {
        event: newEvent,
        matcher: newMatcher || undefined,
        type: newType,
        config: buildConfig(),
      };
      if (orchestrationId) {
        await orchestrationsApi.addHook(token, ref, orchestrationId, data);
      } else {
        await agentHooksApi.add(token, ref, agentId, data);
      }
      setShowAdd(false);
      resetForm();
      await fetchHooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add hook");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (hookId: string) => {
    if (!hasAiAuth(token) || !confirm("Remove this hook?")) return;
    try {
      if (orchestrationId) {
        await orchestrationsApi.removeHook(token, ref, orchestrationId, hookId);
      } else {
        await agentHooksApi.remove(token, ref, agentId, hookId);
      }
      await fetchHooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove hook");
    }
  };

  const resetForm = () => {
    setNewEvent("PreToolUse");
    setNewMatcher("");
    setNewType("approval");
    setApprovalMessage("");
    setHttpUrl("");
    setHttpTimeout(10);
    setRuleField("input");
    setRuleOperator("CONTAINS");
    setRuleValue("");
    setRuleMessage("");
  };

  // Group hooks by event
  const hooksByEvent: Record<string, AgentHook[]> = {};
  for (const hook of hooks) {
    if (!hooksByEvent[hook.event]) hooksByEvent[hook.event] = [];
    hooksByEvent[hook.event].push(hook);
  }

  const describeHook = (hook: AgentHook): string => {
    const matcher = hook.matcher || "* (all tools)";
    const cfg = hook.config as Record<string, string>;
    switch (hook.type) {
      case "approval":
        return `${matcher} → approval — "${cfg.message || ""}"`;
      case "http":
        return `${matcher} → http — ${cfg.url || ""}`;
      case "rule":
        return `${matcher} → rule — ${cfg.field || ""} ${cfg.operator || ""} '${cfg.value || ""}' → deny`;
      default:
        return `${matcher} → ${hook.type}`;
    }
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

      {/* Hooks grouped by event */}
      {Object.keys(hooksByEvent).length === 0 ? (
        <p className="text-sm text-foreground-muted">No hooks configured.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(hooksByEvent).map(([event, eventHooks]) => (
            <div key={event}>
              <h4 className="text-sm font-medium text-foreground mb-2">{event}</h4>
              <div className="space-y-1 ml-4">
                {eventHooks.map((hook) => (
                  <div
                    key={hook.id}
                    className={`flex items-center justify-between py-2 px-3 rounded-md text-sm ${
                      hook.type === "approval"
                        ? "bg-blue-500/5 border border-blue-500/20"
                        : "bg-surface-100 border border-muted"
                    }`}
                  >
                    <span className="text-foreground font-mono text-xs">
                      {hook.type === "approval" && "🛡 "}
                      {describeHook(hook)}
                    </span>
                    <button
                      onClick={() => handleRemove(hook.id)}
                      className="text-xs text-foreground-muted hover:text-destructive-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add hook form */}
      {showAdd ? (
        <div className="p-4 bg-surface-100 border border-default rounded-xl space-y-4">
          <h4 className="text-sm font-medium text-foreground">Add Hook</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Event</label>
              <select
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {events.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Tool matcher (blank = all)</label>
              <input
                type="text"
                value={newMatcher}
                onChange={(e) => setNewMatcher(e.target.value)}
                placeholder="database_write"
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full max-w-xs px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {HOOK_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Type-specific config */}
          {newType === "approval" && (
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Approval message</label>
              <input
                type="text"
                value={approvalMessage}
                onChange={(e) => setApprovalMessage(e.target.value)}
                placeholder="Agent wants to modify the database"
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          )}
          {newType === "http" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Webhook URL</label>
                <input
                  type="text"
                  value={httpUrl}
                  onChange={(e) => setHttpUrl(e.target.value)}
                  placeholder="https://api.example.com/hook"
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Timeout (s)</label>
                <input
                  type="number"
                  value={httpTimeout}
                  onChange={(e) => setHttpTimeout(parseInt(e.target.value) || 10)}
                  className="w-32 px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}
          {newType === "rule" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-foreground-lighter mb-1">Field</label>
                  <input
                    type="text"
                    value={ruleField}
                    onChange={(e) => setRuleField(e.target.value)}
                    placeholder="input"
                    className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground-lighter mb-1">Operator</label>
                  <select
                    value={ruleOperator}
                    onChange={(e) => setRuleOperator(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="CONTAINS">CONTAINS</option>
                    <option value="NOT_CONTAINS">NOT CONTAINS</option>
                    <option value="STARTS_WITH">STARTS WITH</option>
                    <option value="MATCHES">MATCHES (regex)</option>
                    <option value="IN">IN (comma-sep)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-foreground-lighter mb-1">Value</label>
                  <input
                    type="text"
                    value={ruleValue}
                    onChange={(e) => setRuleValue(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Denial message</label>
                <input
                  type="text"
                  value={ruleMessage}
                  onChange={(e) => setRuleMessage(e.target.value)}
                  placeholder="This action is not allowed"
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
            >
              {isAdding ? "Adding..." : "Add Hook"}
            </button>
            <button
              onClick={() => { setShowAdd(false); resetForm(); }}
              className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-foreground text-sm rounded-md transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-brand-600 hover:text-brand-600"
        >
          + Add Hook
        </button>
      )}
    </div>
  );
}
