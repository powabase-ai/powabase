import { useParams } from "common";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Plus, ChevronRight, BookOpen } from "lucide-react";

import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, knowledgeBasesApi, type KnowledgeBaseListItem } from "@/lib/ai-api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { HorizontalCard } from "@/components/interfaces/AI/Shared/HorizontalCard";
import { CreateKBModal } from "@/components/interfaces/AI/KnowledgeBases/CreateKBModal";
import { buildBadges, anyActive } from "@/components/interfaces/AI/KnowledgeBases/kbListHelpers";
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

const SORT_OPTIONS: Array<{
  label: string;
  value: "created_at" | "name" | "updated_at";
}> = [
  { label: "Sort by created at", value: "created_at" },
  { label: "Sort by name", value: "name" },
  { label: "Sort by updated at", value: "updated_at" },
];

const KnowledgeBasesListPage: NextPageWithLayout = () => {
  const { ref } = useParams();
  const { token, isReady } = useProjectSupabaseClient();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);
  const [sortBy, setSortBy] = useState<"created_at" | "name" | "updated_at">(
    "created_at"
  );
  const sortDir = sortBy === "name" ? "asc" : "desc";

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    items,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    error: queryError,
  } = usePaginatedList<KnowledgeBaseListItem>({
    enabled: Boolean(hasAiAuth(token) && isReady && ref),
    queryKey: ["knowledge-bases", ref, debouncedSearch, sortBy] as const,
    fetchPage: ({ limit, offset, signal }) =>
      knowledgeBasesApi.list(
        token!,
        ref as string,
        {
          limit,
          offset,
          q: debouncedSearch || undefined,
          sort: sortBy,
          order: sortDir,
        },
        signal
      ),
  });

  useEffect(() => {
    if (queryError) setError(queryError.message);
  }, [queryError]);

  // Polling: refetch current paginated key every 5s while any visible KB
  // is indexing or enriching. refetchQueries (not invalidateQueries) keeps
  // keepPreviousData smooth — the visible list doesn't blank between ticks.
  // Depend on the derived boolean rather than `items` (which is a fresh array
  // reference on every render) so the interval isn't torn down + recreated
  // on every poll tick.
  const hasActive = anyActive(items);
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => {
      queryClient.refetchQueries({
        queryKey: ["knowledge-bases", ref, debouncedSearch, sortBy],
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActive, queryClient, ref, debouncedSearch, sortBy]);

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
          <h1 className="text-2xl font-semibold text-foreground mb-2">Knowledge Bases</h1>
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
                aria-label="Search knowledge bases"
                className={cn(
                  "w-full h-8 pl-9 pr-3 text-sm rounded-md",
                  "bg-surface-200 border border-default text-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-brand-400"
                )}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-1.5">
                  {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                  <ChevronRight size={14} className="rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={cn(sortBy === opt.value && "text-brand-600")}
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
            Create knowledge base
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="kb-list-scroll"
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
                  : "No knowledge bases yet"}
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const kb = items[virtualRow.index];
                  return (
                    <div
                      key={kb.id}
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
                        href={`/project/${ref}/knowledge-bases/${kb.id}`}
                        icon={<BookOpen className="text-emerald-300" size={20} strokeWidth={1.5} />}
                        name={kb.name}
                        description={kb.description}
                        badges={buildBadges(kb)}
                        rightMeta={
                          kb.created_at
                            ? `Created ${new Date(kb.created_at).toLocaleDateString()}`
                            : null
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

      <CreateKBModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ["knowledge-bases", ref] })
        }
      />
    </div>
  );
};

KnowledgeBasesListPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Knowledge Bases">{page}</AILayout>
  </DefaultLayout>
);

export default KnowledgeBasesListPage;
