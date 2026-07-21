

import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentMcpApi, hasAiAuth, type AgentMcpServer, type McpDiscoveredTool } from "@/lib/ai-api";
import { KeyValueEditor } from "@/components/interfaces/AI/Agents/KeyValueEditor";

interface McpTabProps {
  agentId: string;
}

export function McpTab({ agentId }: McpTabProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [servers, setServers] = useState<AgentMcpServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add server panel
  const [showAdd, setShowAdd] = useState(false);
  const [newServer, setNewServer] = useState({ name: "", url: "", transport: "http", headers: {} as Record<string, string> });
  const [isAdding, setIsAdding] = useState(false);

  // Discovered tools panel
  const [discoveredTools, setDiscoveredTools] = useState<McpDiscoveredTool[] | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);

  const fetchServers = async (showLoading = false) => {
    if (!isReady || !hasAiAuth(token)) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = await agentMcpApi.list(token, ref, agentId);
      setServers(res.mcp_servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MCP servers");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers(true);
  }, [isReady, token, agentId]);

  const handleAdd = async () => {
    if (!hasAiAuth(token) || !newServer.name.trim() || !newServer.url.trim()) return;
    setIsAdding(true);
    try {
      await agentMcpApi.add(token, ref, agentId, {
        name: newServer.name.trim(),
        url: newServer.url.trim(),
        transport: newServer.transport,
        headers: Object.keys(newServer.headers).length > 0 ? newServer.headers : undefined,
      });
      setShowAdd(false);
      setNewServer({ name: "", url: "", transport: "http", headers: {} });
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleEnabled = async (server: AgentMcpServer) => {
    if (!hasAiAuth(token)) return;
    try {
      await agentMcpApi.update(token, ref, agentId, server.id, {
        enabled: !server.enabled,
      });
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update server");
    }
  };

  const handleRemove = async (serverId: string) => {
    if (!hasAiAuth(token) || !confirm("Remove this MCP server?")) return;
    try {
      await agentMcpApi.remove(token, ref, agentId, serverId);
      await fetchServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove server");
    }
  };

  const handleDiscover = async (serverId: string) => {
    if (!hasAiAuth(token)) return;
    // MCP tool discovery deferred: /agents/:id/mcp-servers/:serverId/tools is
    // not implemented in agentic-project-service/routes/agents.py. The call
    // is guarded below so the UI shows "Discovery failed" rather than crash.
    // Pre-existing gap in both legacy and ported frontends — the port
    // faithfully preserved the call. Tracked as audit F5. Restore/enable the
    // button once the BE adds the route (likely to require SSE to the MCP
    // server to enumerate tools).
    setDiscoveringId(serverId);
    try {
      const res = await agentMcpApi.discoverTools(token, ref, agentId, serverId);
      setDiscoveredTools(res.tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscoveringId(null);
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

      {servers.length === 0 && !showAdd ? (
        <p className="text-sm text-foreground-muted">No MCP servers configured.</p>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="p-4 bg-surface-100 border border-muted rounded-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${server.enabled ? "bg-green-500" : "bg-gray-400"}`}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">{server.name}</span>
                    <span className="text-xs text-foreground-muted ml-2">{server.url}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 bg-surface-200 rounded text-foreground-lighter">
                    {server.transport}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDiscover(server.id)}
                    disabled={discoveringId === server.id}
                    className="text-xs text-brand-600 hover:text-brand-600"
                  >
                    {discoveringId === server.id ? "Discovering..." : "Discover Tools"}
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(server)}
                    className="text-xs text-foreground-muted hover:text-foreground"
                  >
                    {server.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleRemove(server.id)}
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

      {/* Discovered tools panel */}
      {discoveredTools && (
        <div className="p-4 bg-surface-100 border border-default rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-foreground">Discovered Tools ({discoveredTools.length})</h4>
            <button onClick={() => setDiscoveredTools(null)} className="text-xs text-foreground-muted">Close</button>
          </div>
          <div className="space-y-2">
            {discoveredTools.map((tool) => (
              <div key={tool.name} className="text-sm">
                <span className="font-mono text-xs text-foreground">{tool.name}</span>
                {tool.description && (
                  <span className="text-xs text-foreground-muted ml-2">{tool.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add server panel */}
      {showAdd ? (
        <div className="p-4 bg-surface-100 border border-default rounded-xl space-y-4">
          <h4 className="text-sm font-medium text-foreground">Add MCP Server</h4>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Name</label>
            <input
              type="text"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">URL</label>
            <input
              type="text"
              value={newServer.url}
              onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
              placeholder="https://mcp-server.example.com"
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Transport</label>
            <select
              value={newServer.transport}
              onChange={(e) => setNewServer({ ...newServer, transport: e.target.value })}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="http">HTTP</option>
              <option value="sse">SSE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Headers (optional)</label>
            <KeyValueEditor value={newServer.headers} onChange={(h) => setNewServer({ ...newServer, headers: h })} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding || !newServer.name.trim() || !newServer.url.trim()}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
            >
              {isAdding ? "Adding..." : "Add Server"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
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
          + Add Server
        </button>
      )}
    </div>
  );
}
