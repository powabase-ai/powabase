

import { useEffect, useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { agentKBApi, hasAiAuth, knowledgeBasesApi, type AgentKBAssignment, type KnowledgeBaseListItem } from "@/lib/ai-api";

interface KBTabProps {
  agentId: string;
}

// Backend page size ceiling (services/list_params.py clamps limit to [1, 100]).
// This tab wants "every KB in the project" for the assign-dropdown, so it
// requests the max page. Projects with >100 KBs will only see the first 100
// (by the list endpoint's default sort) — acceptable for now; revisit with a
// searchable picker (like the KB detail page's add-source modal) if it comes up.
const MAX_KBS_FOR_PICKER = 100;

export function KBTab({ agentId }: KBTabProps) {
  const { token, ref, isReady } = useProjectSupabaseClient();

  const [assignments, setAssignments] = useState<AgentKBAssignment[]>([]);
  const [projectKBs, setProjectKBs] = useState<KnowledgeBaseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const fetchData = async (showLoading = false) => {
    if (!isReady || !hasAiAuth(token)) return;
    if (showLoading) setIsLoading(true);
    try {
      const [kbRes, kbList] = await Promise.all([
        agentKBApi.list(token, ref, agentId),
        knowledgeBasesApi.list(token, ref, { limit: MAX_KBS_FOR_PICKER }),
      ]);
      setAssignments(kbRes.knowledge_bases);
      setProjectKBs(kbList.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [isReady, token, agentId]);

  const assignedIds = new Set(assignments.map((a) => a.knowledge_base_id));
  const unassignedKBs = projectKBs.filter((kb) => !assignedIds.has(kb.id));

  const handleAssign = async (kbId: string) => {
    if (!hasAiAuth(token)) return;
    try {
      await agentKBApi.assign(token, ref, agentId, { knowledge_base_id: kbId });
      setShowAssign(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign KB");
    }
  };

  const handleRemove = async (assignmentId: string) => {
    if (!hasAiAuth(token)) return;
    try {
      await agentKBApi.remove(token, ref, agentId, assignmentId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove KB");
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
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">
          Dynamic Search — Agent can search these KBs on demand during conversation
        </h3>
        <p className="text-xs text-foreground-muted">
          For pre-loaded context (injected into every message), use the KB toggles on the Runs page.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-sm text-destructive-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-foreground-muted">No knowledge bases assigned.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const kb = projectKBs.find((k) => k.id === a.knowledge_base_id);
            return (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 bg-surface-100 border border-muted rounded-lg"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {kb?.name || a.knowledge_base_id}
                  </span>
                  <div className="text-xs text-foreground-muted mt-0.5">
                    Method: {a.retrieval_method || "default"} · top_k: {a.top_k ?? "default"} · max tokens: {a.max_context_tokens ?? "default"}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(a.id)}
                  className="text-xs text-foreground-muted hover:text-destructive-600"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAssign ? (
        <div className="p-4 bg-surface-100 border border-default rounded-xl">
          <h4 className="text-sm font-medium text-foreground mb-3">Select a Knowledge Base</h4>
          {unassignedKBs.length === 0 ? (
            <p className="text-sm text-foreground-muted">All KBs are already assigned.</p>
          ) : (
            <div className="space-y-1">
              {unassignedKBs.map((kb) => (
                <button
                  key={kb.id}
                  onClick={() => handleAssign(kb.id)}
                  className="w-full text-left p-2 text-sm text-foreground hover:bg-surface-200 rounded-md transition"
                >
                  {kb.name}
                  {kb.description && (
                    <span className="text-xs text-foreground-muted ml-2">{kb.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowAssign(false)}
            className="mt-3 text-sm text-foreground-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAssign(true)}
          className="text-sm text-brand-600 hover:text-brand-600"
        >
          + Assign Knowledge Base
        </button>
      )}
    </div>
  );
}
