import { useParams } from "common";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/router";
import { Search, Plus, ChevronRight, Trash2, GitBranch } from "lucide-react";

import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";
import { hasAiAuth } from "@/lib/ai-api";
import { workflowsApi, type WorkflowListItem } from "@/lib/ai-api/workflows-api";
import {
  useCreateWorkflowMutation,
  useDeleteWorkflowMutation,
} from "@/data/ai-workflows";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { HorizontalCard } from "@/components/interfaces/AI/Shared/HorizontalCard";
import type { HorizontalCardBadgeSpec } from "@/components/interfaces/AI/Shared/HorizontalCard";
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
  value: "created_at" | "name" | "updated_at" | "last_execution_at";
  order: "asc" | "desc";
}> = [
  { label: "Sort by created at", value: "created_at", order: "desc" },
  { label: "Sort by name", value: "name", order: "asc" },
  { label: "Sort by updated at", value: "updated_at", order: "desc" },
  { label: "Sort by last run", value: "last_execution_at", order: "desc" },
];

function buildBadges(w: WorkflowListItem): HorizontalCardBadgeSpec[] {
  const out: HorizontalCardBadgeSpec[] = [];
  const stateTone: HorizontalCardBadgeSpec["tone"] =
    w.state === "deployed" ? "success" : "default";
  out.push({ label: "state", value: w.state || "internal", tone: stateTone });
  if (w.version && w.version > 1) {
    out.push({ label: "version", value: `v${w.version}` });
  }
  if (w.execution_count > 0) {
    out.push({ label: "runs", value: w.execution_count });
  }
  const hasSchedule =
    w.schedule_config &&
    typeof w.schedule_config === "object" &&
    Object.keys(w.schedule_config).length > 0;
  if (hasSchedule) {
    out.push({ label: "schedule", value: "on schedule", tone: "info" });
  }
  return out;
}

const WorkflowsListPage: NextPageWithLayout = () => {
  const { ref } = useParams();
  const router = useRouter();
  const { data: token } = useSessionAccessTokenQuery();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);
  const [sortIdx, setSortIdx] = useState(0);
  const sort = SORT_OPTIONS[sortIdx];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useCreateWorkflowMutation();
  const deleteMutation = useDeleteWorkflowMutation();

  const {
    items,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    error: queryError,
  } = usePaginatedList<WorkflowListItem>({
    enabled: Boolean(hasAiAuth(token) && ref),
    queryKey: ["workflows", ref, debouncedSearch, sort.value, sort.order] as const,
    fetchPage: ({ limit, offset, signal }) =>
      workflowsApi.list(
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    try {
      const result = await createMutation.mutateAsync({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
      });
      setCreateName("");
      setCreateDescription("");
      setShowCreateModal(false);
      router.push(`/project/${ref}/workflows/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const handleDelete = async (w: WorkflowListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete workflow "${w.name}"?`)) return;
    setDeletingId(w.id);
    try {
      await deleteMutation.mutateAsync(w.id);
      queryClient.invalidateQueries({ queryKey: ["workflows", ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
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
          <h1 className="text-2xl font-semibold text-foreground mb-2">Workflows</h1>
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
                aria-label="Search workflows"
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
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2 flex items-center gap-1.5"
          >
            <Plus size={14} />
            Create workflow
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="workflows-list-scroll"
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
                  : "No workflows yet"}
              </p>
            </div>
          ) : (
            <>
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                {virtualItems.map((virtualRow) => {
                const w = items[virtualRow.index];
                const meta = w.last_execution_at
                  ? `Last run ${timeAgo(w.last_execution_at)}`
                  : w.created_at
                    ? `Created ${timeAgo(w.created_at)}`
                    : "";
                return (
                  <div
                    key={w.id}
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
                      href={`/project/${ref}/workflows/${w.id}`}
                      icon={<GitBranch className="text-emerald-300" size={20} strokeWidth={1.5} />}
                      name={w.name}
                      description={w.description || "No description"}
                      badges={buildBadges(w)}
                      rightMeta={meta || null}
                      actions={
                        <button
                          onClick={(e) => handleDelete(w, e)}
                          disabled={deletingId === w.id}
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

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface-100 border border-default rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar">
            <h3 className="text-xl font-semibold text-foreground mb-4">
              Create workflow
            </h3>
            <form onSubmit={handleCreate}>
              <div className="space-y-4 mb-6">
                <div>
                  <label
                    htmlFor="create-workflow-name"
                    className="block text-sm text-foreground-light mb-1.5"
                  >
                    Name
                  </label>
                  <input
                    id="create-workflow-name"
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Document processing pipeline"
                    className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-workflow-desc"
                    className="block text-sm text-foreground-light mb-1.5"
                  >
                    Description (optional)
                  </label>
                  <textarea
                    id="create-workflow-desc"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Describe what this workflow does..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateName("");
                    setCreateDescription("");
                  }}
                  className="px-4 py-2 text-foreground-light hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !createName.trim()}
                  className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

WorkflowsListPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Workflows">{page}</AILayout>
  </DefaultLayout>
);

export default WorkflowsListPage;
