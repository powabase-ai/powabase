import { useParams } from "common";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Plus, ChevronRight, Trash2, Blocks } from "lucide-react";

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, orchestrationsApi } from "@/lib/ai-api";
import type { OrchestrationListItem } from "@/lib/ai-api/orchestrations-api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { HorizontalCard } from "@/components/interfaces/AI/Shared/HorizontalCard";
import type { HorizontalCardBadgeSpec } from "@/components/interfaces/AI/Shared/HorizontalCard";
import { FieldLabel } from "@/components/interfaces/AI/Shared/InfoTooltip";
import {
  Button_Shadcn_ as Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui";
import { cn } from "@/lib/utils";
import DefaultLayout from "@/components/layouts/DefaultLayout";
import AILayout from "@/components/layouts/AILayout/AILayout";
import type { NextPageWithLayout } from "@/types";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

const SORT_OPTIONS: Array<{
  label: string;
  value: "created_at" | "name" | "last_run_at";
  order: "asc" | "desc";
}> = [
  { label: "Sort by created at", value: "created_at", order: "desc" },
  { label: "Sort by name", value: "name", order: "asc" },
  { label: "Sort by last run", value: "last_run_at", order: "desc" },
];

const OrchestrationsPage: NextPageWithLayout = () => {
  const { ref } = useParams();
  const { token, isReady } = useProjectSupabaseClient();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);
  const [sortIdx, setSortIdx] = useState(0);
  const sort = SORT_OPTIONS[sortIdx];
  const [error, setError] = useState<string | null>(null);

  // Inline create panel state (preserved from original — orchestrations
  // uses an inline panel, unlike KB/Agents which use a modal).
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSystemPrompt, setNewSystemPrompt] = useState("");
  const [newStrategy, setNewStrategy] = useState("supervisor");
  const [isCreating, setIsCreating] = useState(false);

  const {
    items,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    error: queryError,
  } = usePaginatedList<OrchestrationListItem>({
    enabled: Boolean(hasAiAuth(token) && isReady && ref),
    queryKey: ["orchestrations", ref, debouncedSearch, sort.value, sort.order] as const,
    fetchPage: ({ limit, offset, signal }) =>
      orchestrationsApi.list(
        token!,
        ref as string,
        {
          limit,
          offset,
          q: debouncedSearch || undefined,
          sort: sort.value,
          order: sort.order,
        },
        signal,
      ),
  });

  useEffect(() => {
    if (queryError) setError(queryError.message);
  }, [queryError]);

  const handleCreate = async () => {
    if (!hasAiAuth(token) || !newName.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await orchestrationsApi.create(token, ref as string, {
        name: newName.trim(),
        strategy: newStrategy,
        settings: newSystemPrompt.trim()
          ? { orchestrator_config: { additional_instructions: newSystemPrompt.trim() } }
          : undefined,
      });
      setShowCreate(false);
      setNewName("");
      setNewSystemPrompt("");
      setNewStrategy("supervisor");
      queryClient.invalidateQueries({ queryKey: ["orchestrations", ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create orchestration");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (orch: OrchestrationListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasAiAuth(token)) return;
    if (!confirm(`Delete orchestration "${orch.name}"?`)) return;
    try {
      await orchestrationsApi.delete(token, ref as string, orch.id);
      queryClient.invalidateQueries({ queryKey: ["orchestrations", ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el?.getBoundingClientRect().height
        : undefined,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-6 py-6 border-b border-default shrink-0">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold text-foreground mb-2">Orchestrations</h1>
          <p className="text-foreground-light text-sm">
            {total} total{items.length < total ? ` · ${items.length} loaded` : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="p-4 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                aria-label="Search orchestrations"
                className={cn(
                  "w-full h-8 pl-9 pr-3 text-sm rounded-md",
                  "bg-surface-200 border border-default text-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-brand-400",
                )}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  {sort.label}
                  <ChevronRight size={14} className="rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {SORT_OPTIONS.map((opt, i) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortIdx(i)}
                    className={cn(sortIdx === i && "text-brand-600")}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2 flex items-center gap-1.5"
          >
            <Plus size={14} />
            Create orchestration
          </button>
        </div>

        {showCreate && (
          <div className="max-w-5xl mx-auto mt-4 p-6 bg-surface-100 border border-default rounded-xl space-y-4">
            <h2 className="text-lg font-medium text-foreground">Create Orchestration</h2>
            <div>
              <FieldLabel
                label="Name"
                description="A unique identifier for this orchestration."
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Orchestration"
                className="w-full max-w-md px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
              />
            </div>
            <div>
              <FieldLabel
                label="System prompt"
                description="Instructions injected into the orchestrator agent's system prompt."
              />
              <textarea
                value={newSystemPrompt}
                onChange={(e) => setNewSystemPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. For customer complaints, always delegate to the Support Agent first..."
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm resize-y"
              />
            </div>
            <div>
              <FieldLabel
                label="Strategy"
                description="How the orchestrator coordinates its agents."
                infoTitle="Strategy"
                infoContent={
                  <>
                    <p>The strategy determines how the orchestrator agent delegates work:</p>
                    <ul className="list-disc pl-4 space-y-2">
                      <li>
                        <strong>Supervisor</strong> — A central orchestrator LLM reads the user
                        message and decides which agent(s) to delegate to, in what order. Best
                        for complex routing logic where the orchestrator needs judgment.
                      </li>
                      <li>
                        <strong>Sequential</strong> (coming soon) — Agents execute in a fixed
                        order. Each agent&apos;s output becomes the next agent&apos;s input. Best
                        for pipeline-style workflows.
                      </li>
                      <li>
                        <strong>Parallel</strong> (coming soon) — All agents execute
                        simultaneously. Results are merged. Best for fan-out tasks like
                        multi-source search.
                      </li>
                    </ul>
                  </>
                }
              />
              <select
                value={newStrategy}
                onChange={(e) => setNewStrategy(e.target.value)}
                className="w-full max-w-xs px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
              >
                <option value="supervisor">Supervisor</option>
                <option value="sequential" disabled>
                  Sequential (coming soon)
                </option>
                <option value="parallel" disabled>
                  Parallel (coming soon)
                </option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !newName.trim()}
                className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-foreground-light hover:text-foreground text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="orchestrations-list-scroll"
        className="flex-1 overflow-auto px-6 pb-6"
      >
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-foreground-lighter text-sm">
                {debouncedSearch
                  ? `No matches for "${debouncedSearch}"`
                  : "No orchestrations yet"}
              </p>
            </div>
          ) : (
            <>
              <div
                style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
              >
                {virtualItems.map((virtualRow) => {
                const o = items[virtualRow.index];
                const badges: HorizontalCardBadgeSpec[] = [
                  { label: "strategy", value: o.strategy },
                ];
                if (o.entity_count > 0) {
                  badges.push({
                    label: "entities",
                    value: `${o.entity_count} agent${o.entity_count === 1 ? "" : "s"}`,
                  });
                }
                if (o.session_count > 0) {
                  badges.push({ label: "sessions", value: `${o.session_count} sessions` });
                }
                const meta = o.last_run_at
                  ? `Last run ${timeAgo(o.last_run_at)}`
                  : o.created_at
                    ? `Created ${timeAgo(o.created_at)}`
                    : "";
                return (
                  <div
                    key={o.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="pb-2"
                  >
                    <HorizontalCard
                      href={`/project/${ref}/orchestrations/${o.id}`}
                      icon={<Blocks className="text-emerald-300" size={20} strokeWidth={1.5} />}
                      name={o.name}
                      description={o.description || "No description"}
                      badges={badges}
                      rightMeta={meta || null}
                      actions={
                        <button
                          onClick={(e) => handleDelete(o, e)}
                          className="text-foreground-lighter hover:text-destructive-600 transition p-1"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      }
                    />
                  </div>
                );
                })}
              </div>
              {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-brand-400 border-t-transparent rounded-full" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

OrchestrationsPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Orchestrations">{page}</AILayout>
  </DefaultLayout>
);

export default OrchestrationsPage;
