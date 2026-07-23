

import { useParams } from "common"
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DefaultLayout from "@/components/layouts/DefaultLayout"
import AILayout from "@/components/layouts/AILayout/AILayout"
import type { NextPageWithLayout } from "@/types"
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSearch, FileText, Filter, MessageSquare, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
  Checkbox_Shadcn_ as Checkbox,
  Popover_Shadcn_ as Popover,
  PopoverContent_Shadcn_ as PopoverContent,
  PopoverTrigger_Shadcn_ as PopoverTrigger,
} from "ui";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "ui";
import { cn } from "@/lib/utils";
import {
  sessionsApi,
  SessionListItem,
  ChatMessage,
  streamAgentRun,
  StreamRunEvent,
  Citation,
  orchestrationsApi,
  type Orchestration,
  type ActivityItem,
  agentsApi,
  knowledgeBasesApi,
  hasAiAuth,
} from "@/lib/ai-api";
import { runsApi, streamOrchestrationRun, truncateRunId, type OrchestrationRun } from "@/lib/ai-api/runs-api";
import { ExecutionTrace, type TraceStep } from "@/components/interfaces/AI/Agents/ExecutionTrace";
import { buildTraceTree, buildActivityItemsFromEvents, buildReasoningSteps, derivePillState, type ToolCallRecord } from "@/lib/trace-utils";
import {
  applyContentDelta,
  applyTerminalChunkAppend,
} from "@/lib/stream-handlers";
import { ApprovalCard } from "@/components/interfaces/AI/Agents/ApprovalCard";
import { StreamingActivityFeed } from "@/components/interfaces/AI/Agents/StreamingActivityFeed";
import {
  useProjectSupabaseClient,
  Agent,
  KnowledgeBase,
  IndexedSource,
  AgentRun,
} from "@/hooks/ai/useProjectSupabaseClient";
import { ResizableLayout } from "@/components/layouts/ProjectLayout";
import { MarkdownText } from "@/components/interfaces/AI/Shared/MarkdownText";
import {
  ReasoningModelZeroAlert,
  TokenTrackingInfoTooltip,
} from "@/components/interfaces/Observability/TokenTrackingInfo";
import { MarkdownToggle } from "@/components/interfaces/AI/Shared/MarkdownToggle";
import { CitationText } from "@/components/interfaces/AI/Shared/CitationText";
import { ReasoningPill } from "@/components/interfaces/AI/Shared/ReasoningPill";
import { TypewriterStream } from "@/components/Shared/TypewriterStream";

/** Format a timestamp as a relative time string (e.g. "2h ago", "3d ago"). */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffS = Math.max(0, Math.floor((now - then) / 1000));
  if (diffS < 60) return "just now";
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  const diffMo = Math.floor(diffD / 30);
  return `${diffMo}mo ago`;
}

/** Render JSON with lightweight color coding for keys, strings, numbers, booleans, and nulls.
 *
 *  Note on colors: this project remaps Tailwind named palettes
 *  (purple/emerald/amber/sky/zinc) onto Radix tokens that mostly resolve
 *  near the surface-200 background — text becomes invisible on the JSON
 *  block. Use canonical Tailwind hex values via inline `style` so they
 *  bypass the remap. See memory/project_tailwind_radix_remap.md. */
function ColoredJson({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2) ?? "null";
  // Split into tokens while preserving structure
  const parts = json.split(/("(?:[^"\\]|\\.)*")/g);
  // Canonical Tailwind shades chosen for legibility on the surface-200
  // dark background. Punctuation uses the foreground-light token so
  // braces/commas don't disappear either.
  const COLORS = {
    key: "#c4b5fd", // violet-300
    string: "#6ee7b7", // emerald-300
    bool: "#fcd34d", // amber-300
    nullish: "#a1a1aa", // zinc-400
    number: "#7dd3fc", // sky-300
    punct: "#cbd5e1", // slate-300 — braces, commas, colons
  };
  return (
    <pre
      className="bg-surface-200 rounded-md p-3 whitespace-pre-wrap break-words text-xs font-mono leading-relaxed"
      style={{ color: COLORS.punct }}
    >
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // Quoted string — check if it's a key (followed by ':') or a value
          const next = parts[i + 1] || "";
          const isObjKey = /^\s*:/.test(next);
          return (
            <span key={i} style={{ color: isObjKey ? COLORS.key : COLORS.string }}>
              {part}
            </span>
          );
        }
        // Non-quoted: colorize numbers, booleans, null; punctuation
        // inherits the parent <pre> color.
        return (
          <span key={i}>
            {part
              .split(/\b(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g)
              .map((seg, j) => {
                if (j % 2 === 1) {
                  if (/^(true|false)$/.test(seg)) {
                    return (
                      <span key={j} style={{ color: COLORS.bool }}>
                        {seg}
                      </span>
                    );
                  }
                  if (seg === "null") {
                    return (
                      <span key={j} style={{ color: COLORS.nullish }}>
                        {seg}
                      </span>
                    );
                  }
                  return (
                    <span key={j} style={{ color: COLORS.number }}>
                      {seg}
                    </span>
                  );
                }
                return <span key={j}>{seg}</span>;
              })}
          </span>
        );
      })}
    </pre>
  );
}

/** Collapsible section with gradient fade and "Show all" / "Show less" toggle. */
function ExpandableSection({
  title,
  maxHeight = 200,
  children,
}: {
  title: string;
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const check = () => setNeedsExpand(el.scrollHeight > maxHeight + 8);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-foreground font-medium text-sm">{title}</h3>
        {needsExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-600 hover:text-brand-600 transition shrink-0"
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>
      <div className="relative">
        <div
          ref={contentRef}
          style={!expanded && needsExpand ? { maxHeight: `${maxHeight}px` } : undefined}
          className={!expanded && needsExpand ? "overflow-hidden" : ""}
        >
          {children}
        </div>
        {!expanded && needsExpand && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-surface-100 to-transparent pointer-events-none rounded-b-md" />
        )}
      </div>
    </section>
  );
}

/** Collapsible group of retrieved items from the same parent document. */
function DocumentGroup({
  group,
}: {
  group: {
    sourceId: string;
    docName: string;
    docDescription: string;
    items: Array<{
      _type?: string;
      id?: string;
      item_id?: string;
      knowledge_base_id?: string;
      kb_name?: string;
      indexing_strategy?: string;
      chunk_size?: number;
      overlap?: number;
      retrieval_method?: string;
      score?: number;
      source_id?: string;
      source_name?: string;
      text?: string;
      meta?: Record<string, unknown>;
      images?: Array<{ page: number; content?: string; url?: string; format: string }>;
      enrichment_metadata?: Record<string, unknown>;
      included_in_context?: boolean;
    }>;
  };
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left py-1.5 group"
      >
        <ChevronDown
          size={14}
          className={`shrink-0 text-foreground-muted transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
        />
        <FileText size={14} className="shrink-0 text-foreground-muted" />
        <span className="flex-1 text-xs font-medium text-foreground truncate">
          {group.docName || "Unknown document"}
        </span>
        <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-surface-200 text-foreground-muted">
          {group.items.length} {group.items.length === 1 ? "chunk" : "chunks"}
        </span>
      </button>
      {expanded && (
        <>
          {group.docDescription && (
            <p className="ml-8 text-[11px] text-foreground-muted italic truncate mb-1">
              {group.docDescription}
            </p>
          )}
          <ul className="ml-4 space-y-2 mt-1">
            {group.items.map((item, i) => (
              <li key={`${item.id ?? item.item_id ?? "item"}-${i}`} className={item.included_in_context === false ? "opacity-50" : ""}>
                <RetrievedItemCard item={item} index={i} grouped />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Expandable card for a single retrieved item (chunk / node).
 *  Collapsed by default — shows header only. Click to expand full text + metadata.
 */
function RetrievedItemCard({
  item,
  index,
  grouped,
}: {
  item: {
    _type?: string;
    id?: string;
    item_id?: string;
    knowledge_base_id?: string;
    kb_name?: string;
    indexing_strategy?: string;
    chunk_size?: number;
    overlap?: number;
    retrieval_method?: string;
    score?: number;
    retrieval_score?: number;
    reranker_score?: number | null;
    source_id?: string;
    source_name?: string;
    text?: string;
    meta?: Record<string, unknown>;
    images?: Array<{ page: number; content?: string; url?: string; format: string }>;
    enrichment_metadata?: Record<string, unknown>;
    included_in_context?: boolean;
  };
  index: number;
  grouped?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const meta = item.meta ?? {};
  const docName = (meta.doc_name as string) || "";
  const docDescription = (meta.doc_description as string) || "";
  const sectionTitle = (meta.title as string) || "";
  const pages = meta.pages as number[] | undefined;

  // Build header: when grouped, skip docName (shown in group header); otherwise "DocName — SectionTitle"
  const headerParts: string[] = [];
  if (!grouped && docName) headerParts.push(docName);
  if (sectionTitle && sectionTitle !== docName) headerParts.push(sectionTitle);
  const header = headerParts.length > 0
    ? headerParts.join(" — ")
    : pages && pages.length > 0
      ? pages.length === 1
        ? `Page ${pages[0]}`
        : `Pages ${pages[0]}\u2013${pages[pages.length - 1]}`
      : `Item ${index + 1}`;

  // All metadata rows to display when expanded
  const metaRows: { label: string; value: string }[] = [];
  if (item.kb_name) metaRows.push({ label: "KB Name", value: item.kb_name });
  if (item.indexing_strategy) metaRows.push({ label: "Indexing strategy", value: item.indexing_strategy });
  if (item.chunk_size != null) metaRows.push({ label: "Max chunk size", value: String(item.chunk_size) });
  if (item.overlap != null) metaRows.push({ label: "Overlap", value: String(item.overlap) });
  if (item.retrieval_method) metaRows.push({ label: "Retrieval Strategy", value: item.retrieval_method });
  if (docName) metaRows.push({ label: "Document", value: docName });
  if (docDescription) metaRows.push({ label: "Description", value: docDescription });
  if (sectionTitle) metaRows.push({ label: "Section", value: sectionTitle });
  if (meta.node_id) metaRows.push({ label: "Node ID", value: String(meta.node_id) });
  if (meta.doc_rank != null) metaRows.push({ label: "Doc rank", value: String(meta.doc_rank) });
  if (meta.chunk_size != null) metaRows.push({ label: "Chunk tokens (actual)", value: String(meta.chunk_size) });
  const resolvedId = item.id ?? item.item_id;
  if (resolvedId) {
    const idLabel = item._type === "page_index_node" ? "Node ID (DB)" : "Item ID";
    metaRows.push({ label: idLabel, value: resolvedId });
  }
  if (item.source_id) metaRows.push({ label: "Source ID", value: item.source_id });
  if (item.knowledge_base_id) metaRows.push({ label: "KB ID", value: item.knowledge_base_id });

  // Any extra meta keys not already shown. Suppresses keys that are either
  // rendered explicitly above (doc_name/title/etc. via metaRows) or lifted to
  // top-level fields on the item (source_name, and all the per-strategy scores
  // — vector_similarity_score/hybrid_search_score/bm25_score collapse into
  // item.retrieval_score; reranker_score surfaces as a badge; reranker_config
  // is internal tuning noise).
  const shownKeys = new Set(["doc_name", "doc_description", "doc_summary", "title", "node_id", "doc_rank", "retrieval_method", "strategy", "chunk_size", "pages", "vector_similarity_score", "hybrid_search_score", "bm25_score", "reranker_score", "reranker_config", "source_name"]);
  for (const [k, v] of Object.entries(meta)) {
    if (!shownKeys.has(k) && v != null && v !== "") {
      metaRows.push({ label: k, value: typeof v === "object" ? JSON.stringify(v) : String(v) });
    }
  }

  return (
    <div className="bg-surface-200 rounded-lg border border-muted overflow-hidden">
      {/* Clickable header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-surface-300 transition-colors"
      >
        <ChevronDown
          size={14}
          className={`shrink-0 text-foreground-muted transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
        />
        <span className="flex-1 text-xs font-medium text-foreground truncate">
          {header}
        </span>
        {item.included_in_context === false && (
          <span className="text-[10px] font-medium shrink-0 px-2 py-0.5 rounded bg-surface-300 text-foreground-muted">
            not sent to LLM
          </span>
        )}
        {item.reranker_score != null && (
          <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-brand-400/15 text-brand-500">
            rerank {item.reranker_score.toFixed(4)}
          </span>
        )}
        {item.retrieval_score != null && (
          <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-surface-100 text-foreground-muted">
            {item.reranker_score != null ? `sim ${item.retrieval_score.toFixed(4)}` : item.retrieval_score.toFixed(4)}
          </span>
        )}
        {item.retrieval_score == null && item.reranker_score == null && item.score != null && (
          <span className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded bg-surface-100 text-foreground-muted">
            {item.score.toFixed(4)}
          </span>
        )}
      </button>

      {/* Expanded body — full text + all metadata */}
      {expanded && (
        <div className="border-t border-muted">
          {/* Document description (if available) */}
          {docDescription && (
            <div className="px-3 pt-2 pb-1">
              <p className="text-xs text-foreground-muted italic leading-relaxed">{docDescription}</p>
            </div>
          )}

          {/* Full text content — no truncation */}
          {item.text && (
            <div className="px-3 py-2">
              <MarkdownText className="text-foreground text-sm leading-relaxed">
                {item.text}
              </MarkdownText>
            </div>
          )}

          {/* Page images (image-mode retrieval) */}
          {item.images && item.images.length > 0 && (
            <div className="px-3 py-2 border-t border-muted">
              <p className="text-[10px] font-medium text-foreground-muted uppercase tracking-wide mb-2">
                Page images ({item.images.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {item.images.map((img, i) => {
                  const fmt = img.format || "png";
                  const mime = fmt === "jpg" || fmt === "jpeg"
                    ? "image/jpeg" : `image/${fmt}`;
                  const src = img.url
                    ? img.url
                    : `data:${mime};base64,${img.content}`;
                  return (
                    <button
                      key={img.page}
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="block rounded border border-muted overflow-hidden hover:border-foreground-muted transition-colors cursor-pointer text-left"
                    >
                      <img src={src} alt={`Page ${img.page}`}
                           className="w-full h-auto" loading="lazy" />
                      <span className="block text-center text-[10px] text-foreground-muted py-0.5 bg-surface-100">
                        Page {img.page}
                      </span>
                    </button>
                  );
                })}
              </div>
              {lightboxIndex !== null && item.images && (
                <ImageLightbox
                  images={item.images}
                  initialIndex={lightboxIndex}
                  onClose={() => setLightboxIndex(null)}
                />
              )}
            </div>
          )}

          {/* All metadata */}
          {metaRows.length > 0 && (
            <div className="px-3 pb-2.5 pt-1 border-t border-muted space-y-1 text-xs">
              {metaRows.map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <span className="text-foreground-muted shrink-0 w-36">{label}</span>
                  <span className="text-foreground-light font-mono break-all select-all">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Enrichment metadata */}
          {item.enrichment_metadata && Object.keys(item.enrichment_metadata).length > 0 && (
            <div className="px-3 py-2 border-t border-muted">
              <p className="text-[10px] font-medium text-foreground-muted uppercase tracking-wide mb-1.5">
                Enrichment metadata
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(item.enrichment_metadata).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-100 text-xs">
                    <span className="text-foreground-muted">{k}:</span>
                    <span className="text-foreground font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: Array<{ page: number; content?: string; url?: string; format: string }>;
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const clampedIndex = Math.min(index, images.length - 1);

  useEffect(() => {
    const len = images.length;
    if (len === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + len) % len);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % len);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length]);

  if (images.length === 0) return null;
  const img = images[clampedIndex];
  const fmt = img.format || "png";
  const mime = fmt === "jpg" || fmt === "jpeg" ? "image/jpeg" : `image/${fmt}`;
  const src = img.url ? img.url : `data:${mime};base64,${img.content}`;
  const hasMultiple = images.length > 1;

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  const handleDownload = async () => {
    const filename = `page-${img.page}.${img.format || "png"}`;
    if (img.url) {
      // Signed URL: fetch as blob and trigger download
      try {
        const resp = await fetch(img.url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
      } catch {
        // Fallback: open URL directly
        window.open(img.url, "_blank");
      }
    } else if (img.content) {
      // Base64 content: decode and trigger download
      const byteString = atob(img.content);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let j = 0; j < byteString.length; j++) ia[j] = byteString.charCodeAt(j);
      const blob = new Blob([ab], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl sm:max-w-4xl w-[90vw] max-h-[90vh] flex flex-col p-0 gap-0" hideClose>
        <DialogTitle className="sr-only">Page {img.page}</DialogTitle>
        <div className="flex items-center justify-between px-4 py-2 border-b border-muted shrink-0">
          <span className="text-sm text-foreground-muted">
            Page {img.page}{hasMultiple && ` (${clampedIndex + 1} / ${images.length})`}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleDownload} className="p-1.5 rounded hover:bg-surface-200 text-foreground-muted hover:text-foreground transition" title="Download image">
              <Download size={16} />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-surface-200 text-foreground-muted hover:text-foreground transition" title="Close">
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto relative">
          {hasMultiple && (
            <button type="button" onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-200 hover:bg-surface-300 text-foreground transition z-10" title="Previous">
              <ChevronLeft size={20} />
            </button>
          )}
          <img src={src} alt={`Page ${img.page}`} className="max-w-full max-h-[75vh] object-contain rounded" />
          {hasMultiple && (
            <button type="button" onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-200 hover:bg-surface-300 text-foreground transition z-10" title="Next">
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RunsPage: NextPageWithLayout = () => {
  const { ref } = useParams()
  const { token, isReady } = useProjectSupabaseClient();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionRuns, setSessionRuns] = useState<AgentRun[]>([]);
  const [retrievedContextByRunId, setRetrievedContextByRunId] = useState<Record<string, unknown[] | null>>({});
  const [retrievedContextLoadingByRunId, setRetrievedContextLoadingByRunId] = useState<Record<string, boolean>>({});
  const retrievedContextByRunIdRef = useRef<Record<string, unknown[] | null>>({});
  const retrievedContextLoadingByRunIdRef = useRef<Record<string, boolean>>({});

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(`runs-page:${ref}`);
      if (stored) return JSON.parse(stored).agentId || null;
    } catch {}
    return null;
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Source filter state: per-KB source_ids selection
  const [kbSourceFilters, setKbSourceFilters] = useState<Record<string, string[]>>({});
  const [sourceFilterModalKbId, setSourceFilterModalKbId] = useState<string | null>(null);
  const [modalIndexedSources, setModalIndexedSources] = useState<(IndexedSource & { source_name?: string; file_type?: string })[]>([]);
  const [isLoadingModalSources, setIsLoadingModalSources] = useState(false);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citationCandidates, setCitationCandidates] = useState<Citation[]>([]);
  useEffect(() => {
    retrievedContextByRunIdRef.current = retrievedContextByRunId;
  }, [retrievedContextByRunId]);

  useEffect(() => {
    retrievedContextLoadingByRunIdRef.current = retrievedContextLoadingByRunId;
  }, [retrievedContextLoadingByRunId]);

  const [citationsEnabled, setCitationsEnabled] = useState(false);

  // Orchestration support
  const [selectedType, setSelectedType] = useState<"agent" | "orchestration">(() => {
    if (typeof window === "undefined") return "agent";
    try {
      const stored = localStorage.getItem(`runs-page:${ref}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.type === "orchestration") return "orchestration";
      }
    } catch {}
    return "agent";
  });
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [orchRunDetailMap, setOrchRunDetailMap] = useState<Map<string, OrchestrationRun>>(new Map());
  const [selectedOrchId, setSelectedOrchId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(`runs-page:${ref}`);
      if (stored) return JSON.parse(stored).orchId || null;
    } catch {}
    return null;
  });

  // Persist runs page selection to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`runs-page:${ref}`, JSON.stringify({
        type: selectedType,
        agentId: selectedAgentId,
        orchId: selectedOrchId,
      }));
    } catch {}
  }, [selectedType, selectedAgentId, selectedOrchId, ref]);

  // Execution trace + approval
  const [traceMap, setTraceMap] = useState<Map<string, TraceStep[]>>(new Map());
  // Per-run raw events, used by ExecutionTrace to render per-step reasoning via
  // buildReasoningSteps (issue #106 Task 29).
  const [eventsMap, setEventsMap] = useState<Map<string, Array<{ event: string; [key: string]: unknown }>>>(new Map());
  const rawTraceEventsRef = useRef<Array<{ event: string; [key: string]: unknown }>>([]);
  // Tick to force re-render when ref-only data (reasoning_delta) updates so the
  // ReasoningPill can recompute steps from rawTraceEventsRef.current.
  const [, setReasoningEventTick] = useState(0);

  // Streaming activity feed
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const activityCounterRef = useRef(0);
  const activeDelegationIdRef = useRef<string | null>(null);
  const streamingRunIdRef = useRef<string | null>(null);
  const streamStartedAtRef = useRef<number | null>(null);
  const hasContentDeltaRef = useRef(false);

  const [pendingApproval, setPendingApproval] = useState<{
    runId: string; toolName: string; toolInput: Record<string, unknown>; message: string;
  } | null>(null);
  const [approvalResolved, setApprovalResolved] = useState<"approved" | "denied" | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDateAfter, setFilterDateAfter] = useState("");
  const [filterDateBefore, setFilterDateBefore] = useState("");
  const [filterMinRuns, setFilterMinRuns] = useState("");
  const [filterMaxRuns, setFilterMaxRuns] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Pinned session ref: snapshot of selected session for stability
  const pinnedSessionRef = useRef<SessionListItem | null>(null);

  // AbortController for in-flight SSE stream — allows graceful disconnect on unmount
  const streamAbortRef = useRef<AbortController | null>(null);

  // Polling ref for in-progress runs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startSessionIdRef = useRef<string | null>(null);

  // Scroll-to-bottom for message list
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }
    }
  }, []);
  const forceScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cleanup: abort in-flight stream and stop polling on unmount
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Computed filter helpers
  const activeFilterCount =
    (filterDateAfter ? 1 : 0) +
    (filterDateBefore ? 1 : 0) +
    (filterMinRuns ? 1 : 0) +
    (filterMaxRuns ? 1 : 0);
  const hasFiltersOrSearch = !!debouncedSearch || activeFilterCount > 0;

  // Fetch agents for the type picker
  const fetchAgents = useCallback(async () => {
    if (!isReady || !hasAiAuth(token)) return;
    setIsLoadingAgents(true);
    setError(null);
    try {
      // Backend page size ceiling (list endpoints clamp limit to
      // [1, 100]) — same tradeoff as the KB-picker dropdowns elsewhere. A
      // project with more than 100 agents (realistic on prod; unlikely on a
      // single-project self-host) will only see the first page here — this
      // picker has no search/pagination UI of its own.
      const res = await agentsApi.list(token, ref!, { limit: 100 });
      setAgents(res.items as Agent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agents");
    } finally {
      setIsLoadingAgents(false);
    }
  }, [isReady, token, ref!]);

  // Fetch orchestrations
  const fetchOrchestrations = useCallback(async () => {
    if (!isReady || !hasAiAuth(token)) return;
    try {
      const res = await orchestrationsApi.list(token, ref!);
      setOrchestrations(res.items);
    } catch {
      // non-blocking
    }
  }, [isReady, token, ref!]);

  // Fetch knowledge bases for the KB-context picker
  const fetchKbs = useCallback(async () => {
    if (!isReady || !hasAiAuth(token)) return;
    try {
      // Same 100-row backend ceiling as fetchAgents above — a project with
      // more than 100 KBs will only see the first page in this picker.
      const res = await knowledgeBasesApi.list(token, ref!, { limit: 100 });
      setKnowledgeBases(res.items as KnowledgeBase[]);
    } catch {
      // non-blocking
    }
  }, [isReady, token, ref!]);

  // Open source filter modal for a KB — fetches its indexed sources
  const openSourceFilterModal = useCallback(async (kbId: string) => {
    setSourceFilterModalKbId(kbId);
    setIsLoadingModalSources(true);
    setModalIndexedSources([]);
    try {
      if (!hasAiAuth(token)) return;
      // listIndexedSources already flattens source_name/file_type from the
      // sources join server-side — no client-side remap needed. Backend caps
      // limit at 200; a KB with more indexed sources than that will only show
      // the first page here (same class of tradeoff as the picker dropdowns).
      const res = await knowledgeBasesApi.listIndexedSources(token, ref!, kbId, { limit: 200 });
      setModalIndexedSources(res.items as unknown as (IndexedSource & { source_name?: string; file_type?: string })[]);
    } catch {
      // non-blocking
    } finally {
      setIsLoadingModalSources(false);
    }
  }, [token, ref!]);

  // Fetch sessions — agent mode uses sessionsApi, orchestration mode uses orchestrationsApi
  const fetchSessions = useCallback(async () => {
    if (!isReady || !hasAiAuth(token)) {
      setSessions([]);
      return;
    }
    if (selectedType === "orchestration") {
      if (!selectedOrchId) { setSessions([]); return; }
      setIsLoadingSessions(true);
      try {
        const data = await orchestrationsApi.listSessions(token, ref!, selectedOrchId);
        setSessions(data.sessions);
      } catch {
        setSessions([]);
      } finally {
        setIsLoadingSessions(false);
      }
      return;
    }
    // Agent mode
    if (!selectedAgentId) { setSessions([]); return; }
    setIsLoadingSessions(true);
    setError(null);
    try {
      const opts: Parameters<typeof sessionsApi.listForAgent>[3] = {
        limit: hasFiltersOrSearch ? 200 : undefined,
      };
      if (debouncedSearch) opts.search = debouncedSearch;
      if (filterDateAfter) opts.created_after = filterDateAfter;
      if (filterDateBefore) opts.created_before = filterDateBefore;
      if (filterMinRuns) opts.min_runs = Number(filterMinRuns);
      if (filterMaxRuns) opts.max_runs = Number(filterMaxRuns);
      const data = await sessionsApi.listForAgent(token, ref!, selectedAgentId, opts);
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setIsLoadingSessions(false);
    }
  }, [isReady, token, ref!, selectedAgentId, selectedOrchId, selectedType, debouncedSearch, filterDateAfter, filterDateBefore, filterMinRuns, filterMaxRuns, hasFiltersOrSearch]);

  const fetchSessionsRef = useRef(fetchSessions);

  // Fetch messages for a session
  const fetchMessages = useCallback(async () => {
    if (!isReady || !hasAiAuth(token) || !selectedSessionId) {
      if (!selectedSessionId) setMessages([]);
      return;
    }
    setIsLoadingMessages(true);
    setError(null);
    try {
      let data: {
        messages: Array<{
          role: string;
          content: string;
          run_id?: string;
          activityItems?: ActivityItem[];
          events?: Array<{ type?: string; event?: string; [key: string]: unknown }>;
          reasoning_requested?: boolean;
          reasoning_duration_ms?: number | null;
          reasoning?: { thinking_blocks?: Array<{ type?: string }>; summary_text?: string | null } | null;
          tool_calls?: Array<{
            step: number;
            tool_name: string;
            arguments: Record<string, unknown> | string | unknown[];
            result: string | unknown[] | Record<string, unknown>;
            duration_ms: number;
          }>;
        }>;
        events?: Array<{ type: string; [key: string]: unknown }>;
      };
      if (selectedType === "orchestration" && selectedOrchId) {
        data = await orchestrationsApi.getSessionMessages(token, ref!, selectedOrchId, selectedSessionId);
        // Rebuild trace and activity items per-message from each assistant
        // message's `events` field. Each orchestration run has its own events
        // — older code only rendered the last run's pill because the BE used
        // to return events flattened across runs (#106 Bug B fix landed
        // per-message events).
        const newMap = new Map<string, TraceStep[]>();
        const newEventsMap = new Map<string, Array<{ event: string; [key: string]: unknown }>>();
        let lastActivityItems: ActivityItem[] = [];
        for (const msg of data.messages || []) {
          if (msg.role !== "assistant" || !msg.run_id || !msg.events) continue;
          const mapped = msg.events.map((e) => ({ ...e, event: e.event || e.type || "" }));
          const typed = mapped as Array<{ event: string; [key: string]: unknown }>;
          newEventsMap.set(msg.run_id, typed);
          // Pass per-message tool_calls so MultimodalOutput can render image
          // blocks instead of the literal "[multimodal content]" preview text.
          // get_orchestration_session_messages hydrates these per orchestration
          // run from ai.tool_call_events of its child agent_runs.
          newMap.set(
            msg.run_id,
            buildTraceTree(typed, msg.tool_calls as ToolCallRecord[] | undefined),
          );
          // Activity items only attach to the *latest* assistant message
          // (the FE only shows one running activity feed at a time).
          lastActivityItems = buildActivityItemsFromEvents(typed);
        }
        // Back-compat: old BE returned flattened `data.events` only. If no
        // per-message events were present but flat events exist, map them to
        // the last assistant run_id (legacy behavior).
        if (newEventsMap.size === 0 && data.events && data.events.length > 0) {
          const mapped = data.events.map((e) => ({ ...e, event: e.type || "" }));
          const typedMapped = mapped as Array<{ event: string; [key: string]: unknown }>;
          // tool_calls are hydrated server-side from ai.tool_call_events so
          // multimodal results (image_url / image_ref blocks) flow through to
          // ExecutionTrace's MultimodalOutput renderer. Cast required because
          // the local `data` type is narrower than the API return type.
          const tree = buildTraceTree(
            typedMapped,
            (data as { tool_calls?: ToolCallRecord[] }).tool_calls,
          );
          const lastAssistant = [...(data.messages || [])].reverse().find((m) => m.run_id);
          if (lastAssistant?.run_id) {
            newMap.set(lastAssistant.run_id, tree);
            newEventsMap.set(lastAssistant.run_id, typedMapped);
            lastActivityItems = buildActivityItemsFromEvents(typedMapped);
          }
        }
        setTraceMap(newMap);
        setEventsMap(newEventsMap);
        const orchActivityItems = lastActivityItems;
        // Build sessionRuns for the debug panel from orchestration messages.
        // Pair each assistant message with the most recent preceding user
        // message so the debug panel's "Input messages" section shows the
        // prompt that triggered the run instead of an empty array.
        const allMsgs = data.messages || [];
        const orchRuns: AgentRun[] = []
        for (let i = 0; i < allMsgs.length; i++) {
          const m = allMsgs[i]
          if (m.role !== "assistant" || !m.run_id) continue
          let userInput = ""
          for (let j = i - 1; j >= 0; j--) {
            if (allMsgs[j].role === "user") {
              userInput = allMsgs[j].content
              break
            }
          }
          orchRuns.push({
            id: m.run_id,
            session_id: selectedSessionId!,
            run_id: m.run_id,
            status: "completed",
            input_messages: userInput
              ? [{ role: "user", content: userInput }]
              : [],
            output_messages: [{ role: "assistant", content: m.content }],
            content: m.content,
            usage: null,
            retrieved_context: null,
            error: null,
            started_at: null,
            completed_at: null,
            created_at: null,
          })
        }
        setSessionRuns(orchRuns);
        // Attach activity items to last assistant message
        if (orchActivityItems.length > 0) {
          const lastAssistant = [...(data.messages || [])].reverse().find(m => m.run_id);
          if (lastAssistant?.run_id) {
            data.messages = data.messages.map(m =>
              m.role === "assistant" && m.run_id === lastAssistant.run_id
                ? { ...m, activityItems: orchActivityItems }
                : m
            );
          }
        }
      } else {
        try {
          data = await sessionsApi.getMessages(token, ref!, selectedSessionId);
        } catch (msgErr) {
          console.error("Failed to fetch messages:", msgErr);
          data = { messages: [] };
        }
        // Load runs with events to build per-message traces + activity items
        try {
          const runsData = await sessionsApi.getRuns(token, ref!, selectedSessionId);
          const newMap = new Map<string, TraceStep[]>();
          const activityMap = new Map<string, ActivityItem[]>();
          const newEventsMap = new Map<string, Array<{ event: string; [key: string]: unknown }>>();
          for (const run of runsData.runs) {
            if (run.events && run.events.length > 0) {
              const mapped = run.events.map((e: Record<string, unknown>) => ({ ...e, event: (e.type as string) || "" }));
              const typedMapped = mapped as Array<{ event: string; [key: string]: unknown }>;
              // buildTraceTree always ends with a response step (Task 17)
              const tree = buildTraceTree(typedMapped, run.tool_calls as ToolCallRecord[] | undefined);
              newMap.set(run.run_id, tree);
              const items = buildActivityItemsFromEvents(typedMapped);
              if (items.length > 0) activityMap.set(run.run_id, items);
              newEventsMap.set(run.run_id, typedMapped);
            }
          }
          setTraceMap(newMap);
          setEventsMap(newEventsMap);
          // Enrich messages with reconstructed activity items + raw events for ReasoningPill
          if (activityMap.size > 0 || newEventsMap.size > 0) {
            data.messages = data.messages.map(m => {
              if (m.role !== "assistant" || !m.run_id) return m;
              const enriched = { ...m };
              if (activityMap.has(m.run_id)) enriched.activityItems = activityMap.get(m.run_id);
              if (newEventsMap.has(m.run_id)) enriched.events = newEventsMap.get(m.run_id);
              return enriched;
            });
          }
        } catch {
          setTraceMap(new Map());
          setEventsMap(new Map());
        }
      }
      setMessages(data.messages as ChatMessage[]);
      setTimeout(forceScrollToBottom, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch messages");
    } finally {
      setIsLoadingMessages(false);
    }
  }, [isReady, token, ref!, selectedSessionId, selectedOrchId, selectedType, forceScrollToBottom]);

  // Fetch runs for the selected session using sessionsApi (handles session_id translation)
  const fetchSessionRuns = useCallback(async () => {
    if (!isReady || !hasAiAuth(token) || !selectedSessionId) {
      setSessionRuns([]);
      return;
    }
    // In orchestration mode, sessionRuns are populated by fetchMessages — no separate fetch needed
    if (selectedType === "orchestration") return;
    try {
      const data = await sessionsApi.getRuns(token, ref!, selectedSessionId, { limit: 100 });
      // Map to AgentRun type expected by the component
      const runs: AgentRun[] = data.runs.map((r) => ({
        id: r.id,
        session_id: selectedSessionId, // The runs are for this session
        run_id: r.run_id,
        status: r.status,
        input_messages: r.input_messages,
        output_messages: r.output_messages,
        content: r.content,
        usage: r.usage,
        model: r.model ?? null,
        error: r.error,
        started_at: r.started_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
      }));
      setSessionRuns(runs);
    } catch {
      setSessionRuns([]);
    }
  }, [isReady, token, ref!, selectedSessionId]);

  const fetchRunRetrievedContext = useCallback(async (runId: string) => {
    if (!isReady || !hasAiAuth(token) || !selectedSessionId || selectedType === "orchestration") return;
    if (
      retrievedContextByRunIdRef.current[runId] !== undefined
      || retrievedContextLoadingByRunIdRef.current[runId]
    ) {
      return;
    }
    setRetrievedContextLoadingByRunId((prev) => ({ ...prev, [runId]: true }));
    try {
      const data = await sessionsApi.getRunRetrievedContext(
        token,
        ref!,
        selectedSessionId,
        runId
      );
      setRetrievedContextByRunId((prev) => ({
        ...prev,
        [runId]: data.retrieved_context ?? null,
      }));
    } catch {
      setRetrievedContextByRunId((prev) => ({ ...prev, [runId]: null }));
    } finally {
      setRetrievedContextLoadingByRunId((prev) => ({ ...prev, [runId]: false }));
    }
  }, [
    isReady,
    token,
    selectedSessionId,
    selectedType,
    ref!,
  ]);

  // Fetch full orchestration run detail (including child_runs) when debug panel opens
  const orchRunDetailMapRef = useRef<Map<string, OrchestrationRun>>(orchRunDetailMap);
  useEffect(() => { orchRunDetailMapRef.current = orchRunDetailMap; }, [orchRunDetailMap]);

  const fetchOrchRunDetail = useCallback(async (runId: string) => {
    if (!isReady || !hasAiAuth(token) || selectedType !== "orchestration") return;
    if (orchRunDetailMapRef.current.has(runId)) return; // already fetched
    try {
      const data = await runsApi.getOrchestrationRun(token, ref!, runId);
      setOrchRunDetailMap((prev) => {
        const next = new Map(prev);
        next.set(runId, data);
        return next;
      });
    } catch (err) {
      // Don't surface to the user — child_runs section just won't render.
      // Log for debugging.
      console.error("Failed to fetch orchestration run detail:", err);
    }
  }, [isReady, token, ref, selectedType]);

  // Snapshot selected session for pinning
  useEffect(() => {
    if (!selectedSessionId) {
      pinnedSessionRef.current = null;
      return;
    }
    const found = sessions.find((s) => s.session_id === selectedSessionId);
    if (found) pinnedSessionRef.current = found;
  }, [selectedSessionId, sessions]);

  // Display sessions: prepend pinned session if not in results
  const displaySessions = useMemo(() => {
    if (!selectedSessionId || !pinnedSessionRef.current) return sessions;
    const inResults = sessions.some((s) => s.session_id === selectedSessionId);
    if (inResults) return sessions;
    return [pinnedSessionRef.current, ...sessions];
  }, [sessions, selectedSessionId]);

  // Set of session IDs actually returned by the current query (for pinned detection)
  const sessionIdsInResults = useMemo(
    () => new Set(sessions.map((s) => s.session_id)),
    [sessions]
  );

  useEffect(() => {
    fetchAgents();
    fetchKbs();
    fetchOrchestrations();
  }, [fetchAgents, fetchKbs, fetchOrchestrations]);

  // Default to first agent when list loads (only in agent mode), validate stored ID
  useEffect(() => {
    if (selectedType === "agent" && agents.length > 0) {
      if (selectedAgentId === null || !agents.some(a => a.id === selectedAgentId)) {
        setSelectedAgentId(agents[0].id);
      }
    }
  }, [agents, selectedAgentId, selectedType]);

  // Default to first orchestration when list loads (only in orchestration mode), validate stored ID
  useEffect(() => {
    if (selectedType === "orchestration" && orchestrations.length > 0) {
      if (selectedOrchId === null || !orchestrations.some(o => o.id === selectedOrchId)) {
        setSelectedOrchId(orchestrations[0].id);
      }
    }
  }, [orchestrations, selectedOrchId, selectedType]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessionsRef.current = fetchSessions;
  }, [fetchSessions]);

  useEffect(() => {
    fetchMessages();
    setSelectedRunId(null);
    setRetrievedContextByRunId({});
    setRetrievedContextLoadingByRunId({});
  }, [fetchMessages, selectedSessionId]);

  // Poll for in-progress runs: when selecting a session that has RUNNING runs,
  // periodically re-fetch messages until no runs are running.
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (!isReady || !hasAiAuth(token) || !selectedSessionId || isStreaming) return;

    let active = true;

    const checkRunning = async (): Promise<boolean> => {
      try {
        const data = await sessionsApi.getRuns(token, ref!, selectedSessionId, { limit: 100 });
        const hasRunning = data.runs.some((r) => r.status === "running");
        if (active && (hasRunning || pollingRef.current)) {
          const msgData = await sessionsApi.getMessages(token, ref!, selectedSessionId);
          if (active) {
            setMessages(msgData.messages);
          }
        }
        if (!hasRunning && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (active) fetchSessionsRef.current();
        }
        return hasRunning;
      } catch {
        return false;
      }
    };

    // Initial check — start polling only if there are running runs
    checkRunning().then((hasRunning) => {
      if (active && hasRunning && !pollingRef.current) {
        pollingRef.current = setInterval(checkRunning, 3000);
      }
    });

    return () => {
      active = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, token, ref!, selectedSessionId, isStreaming]);

  useEffect(() => {
    if (selectedRunId && selectedSessionId) {
      fetchSessionRuns();
      fetchRunRetrievedContext(selectedRunId);
    }
  }, [selectedRunId, selectedSessionId, fetchSessionRuns, fetchRunRetrievedContext]);

  const handleNewConversation = () => {
    setSelectedSessionId(null);
    setMessages([]);
    setSelectedRunId(null);
    setSessionRuns([]);
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasAiAuth(token) || !confirm("Delete this session and all its messages?")) return;
    try {
      await sessionsApi.delete(token, ref!, sessionId);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setMessages([]);
        setSelectedRunId(null);
        setSessionRuns([]);
      }
      fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = selectedType === "agent" ? selectedAgentId : selectedOrchId;
    if (!isReady || !hasAiAuth(token) || !targetId || !inputMessage.trim() || isStreaming) return;
    const message = inputMessage.trim();
    setInputMessage("");
    setIsStreaming(true);
    setError(null);

    // Create an AbortController so we can cancel the stream on unmount
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    rawTraceEventsRef.current = [];
    streamingRunIdRef.current = null;
    streamStartedAtRef.current = Date.now();
    setActivityItems([]);
    activityCounterRef.current = 0;
    activeDelegationIdRef.current = null;
    hasContentDeltaRef.current = false;
    setPendingApproval(null);
    setApprovalResolved(null);

    const placeholder: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, { role: "user", content: message }, placeholder]);
    setTimeout(forceScrollToBottom, 0);

    const onEvent = (event: StreamRunEvent) => {
      if (event.event === "start") {
        // Capture session_id but do NOT set selectedSessionId yet — doing so
        // triggers fetchMessages which overwrites optimistic messages with an
        // empty list (RUNNING runs are excluded from get_chat_messages).
        if (event.session_id) startSessionIdRef.current = event.session_id;
        streamingRunIdRef.current = event.run_id;
        if (event.citation_candidates) {
          setCitationCandidates(event.citation_candidates);
        }
        // Stamp reasoning_requested on the placeholder assistant message so
        // derivePillState renders the pill as soon as streaming begins.
        const reasoningRequested = !!event.reasoning_requested;
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx]?.role === "assistant") {
            next[lastIdx] = {
              ...next[lastIdx],
              reasoning_requested: reasoningRequested,
            };
          }
          return next;
        });
      } else if (event.event === "chunk") {
        if (hasContentDeltaRef.current) {
          // Streaming mode: bubble already correct from deltas. The BE's chunk content
          // should equal last.content (both derived from the same buffer), but we
          // don't trust server-vs-React equality enough to SET. Ignore.
          setTimeout(scrollToBottom, 0);
          return;
        }
        // Non-streaming mode (kill switch off) — today's APPEND behavior preserved
        setMessages((prev) => applyTerminalChunkAppend(prev, event.content));
        setTimeout(scrollToBottom, 0);
      } else if (event.event === "content_delta") {
        hasContentDeltaRef.current = true;
        setMessages((prev) => applyContentDelta(prev, event.delta));
        setTimeout(scrollToBottom, 0);
      } else if (event.event === "reasoning_delta") {
        // Push to raw events; ReasoningPill recomputes from rawTraceEventsRef
        // on next render via buildReasoningSteps.
        rawTraceEventsRef.current.push(event as { event: string; [key: string]: unknown });
        setReasoningEventTick((t) => t + 1);
      } else if (event.event === "complete") {
        // T22: expose raw trace events for Playwright Q1 structural check
        // (non-prod only — gated by NODE_ENV)
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __rawTraceEvents?: unknown }).__rawTraceEvents =
            rawTraceEventsRef.current;
        }
        // Rebuild activity items from the synchronously-updated raw events ref
        // (avoids stale-closure issues with the React state-based activityItemsRef)
        const finalItems = buildActivityItemsFromEvents(rawTraceEventsRef.current);
        const savedRunId = event.run_id;

        // If the run completed in a failed state, surface the underlying
        // error verbatim. The backend may also have emitted a separate
        // `event: error` ahead of this; calling setError twice is harmless,
        // but for the orchestration path (which doesn't emit a separate
        // error event) this is the only place the user sees the message.
        if (event.status === "failed" && event.error) {
          setError(String(event.error));
        }

        // Compute reasoning duration from when the stream started (captured in
        // streamStartedAtRef when the user submitted) to now (complete fired).
        // This is the FE-side approximation; matches what the user perceives as
        // "time spent thinking" in chat. BE-side started_at/completed_at on
        // agent_runs is more authoritative for historical runs (forwarded by
        // get_chat_messages once that follow-up lands).
        const durationMs =
          streamStartedAtRef.current !== null
            ? Date.now() - streamStartedAtRef.current
            : null;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            // ...last preserves reasoning_requested (set on start event) so the
            // pill keeps rendering after streaming completes. TODO: forward
            // `reasoning` from the BE complete event when available; today the
            // post-complete refetch via sessionsApi.getMessages picks it up.
            const failureSuffix =
              event.status === "failed" && event.error
                ? `\n\n_Error: ${String(event.error)}_`
                : "";
            next[next.length - 1] = {
              ...last,
              // `??` not `||`: a PreResponse hook may redact the answer to "",
              // and `||` would treat that as "server sent nothing" and fall back
              // to the accumulated pre-redaction text — rendering the unredacted
              // answer while the DB row and audit record say it was withheld.
              content: (event.content ?? last.content ?? "") + failureSuffix,
              run_id: event.run_id,
              citations: event.citations,
              activityItems: finalItems.length > 0 ? finalItems : undefined,
              reasoning_duration_ms: durationMs,
            };
          }
          return next;
        });
        setCitationCandidates([]);
        setActivityItems([]);
        activityCounterRef.current = 0;
        activeDelegationIdRef.current = null;
        // Build trace tree from collected events, enriched with full tool outputs.
        // buildTraceTree always ends with a response step (Task 17).
        const tree = buildTraceTree(rawTraceEventsRef.current, event.tool_calls);
        const eventsSnapshot = [...rawTraceEventsRef.current];
        if (streamingRunIdRef.current) {
          setTraceMap((prev) => {
            const next = new Map(prev);
            next.set(streamingRunIdRef.current!, tree);
            return next;
          });
          setEventsMap((prev) => {
            const next = new Map(prev);
            next.set(streamingRunIdRef.current!, eventsSnapshot);
            return next;
          });
        }
        // Agent mode: update session list and re-fetch assembled messages
        if (selectedType === "agent") {
          if (event.session_id) setSelectedSessionId(event.session_id);
          fetchSessions();
          // Refresh sessionRuns proactively so the debug panel can resolve
          // the just-completed run without waiting for the user click to
          // trigger a refetch. Without this, opening the panel immediately
          // after streaming completes can show a stale "Loading run
          // details…" state until the user refreshes the browser.
          //
          // We pass event.session_id directly because setSelectedSessionId
          // hasn't propagated yet (state update is async), so the
          // useCallback closure inside fetchSessionRuns still sees the
          // pre-stream selectedSessionId.
          const completedSessionId: string | undefined = event.session_id
          if (completedSessionId && hasAiAuth(token)) {
            sessionsApi
              .getRuns(token, ref!, completedSessionId, { limit: 100 })
              .then((data) => {
                const runs: AgentRun[] = data.runs.map((r) => ({
                  id: r.id,
                  session_id: completedSessionId,
                  run_id: r.run_id,
                  status: r.status,
                  input_messages: r.input_messages,
                  output_messages: r.output_messages,
                  content: r.content,
                  usage: r.usage,
                  model: r.model ?? null,
                  error: r.error,
                  started_at: r.started_at,
                  completed_at: r.completed_at,
                  created_at: r.created_at,
                }))
                setSessionRuns(runs)
              })
              .catch(() => {})
          }
          if (event.session_id && hasAiAuth(token)) {
            sessionsApi
              .getMessages(token, ref!, event.session_id)
              .then((data) => {
                // Re-attach activity items: carry forward from current messages +
                // attach finalItems for the run that just completed
                setMessages((prev) => {
                  const prevActivityByRunId = new Map<string, ActivityItem[]>();
                  const prevDurationByRunId = new Map<string, number | null>();
                  for (const m of prev) {
                    if (m.run_id && m.activityItems) prevActivityByRunId.set(m.run_id, m.activityItems);
                    if (m.run_id && m.reasoning_duration_ms != null) {
                      prevDurationByRunId.set(m.run_id, m.reasoning_duration_ms);
                    }
                  }
                  if (finalItems.length > 0 && savedRunId) {
                    prevActivityByRunId.set(savedRunId, finalItems);
                  }
                  if (durationMs != null && savedRunId) {
                    prevDurationByRunId.set(savedRunId, durationMs);
                  }
                  return (data.messages as ChatMessage[]).map(msg => {
                    if (msg.role !== "assistant" || !msg.run_id) return msg;
                    const enriched = { ...msg };
                    if (prevActivityByRunId.has(msg.run_id)) {
                      enriched.activityItems = prevActivityByRunId.get(msg.run_id);
                    }
                    if (prevDurationByRunId.has(msg.run_id)) {
                      enriched.reasoning_duration_ms = prevDurationByRunId.get(msg.run_id) ?? null;
                    }
                    return enriched;
                  });
                });
                setTimeout(forceScrollToBottom, 0);
              })
              .catch(() => {});
          }
        } else {
          // Orchestration mode: update session list and scroll
          if (event.session_id) setSelectedSessionId(event.session_id);
          fetchSessions();
          setTimeout(forceScrollToBottom, 0);
        }
      } else if (["tool_call", "tool_result", "delegation_started", "delegation_completed", "step_started", "step_completed", "reasoning", "step_reset", "reasoning_dropped_at_provider_switch"].includes(event.event)) {
        // Collect raw events — tree is built on "complete"
        rawTraceEventsRef.current.push(event as { event: string; [key: string]: unknown });
        // Update streaming activity feed (merge paired events)
        if (event.event === "tool_call") {
          const id = `tc_${activityCounterRef.current++}`;
          setActivityItems((prev) => [...prev, {
            id,
            kind: "tool",
            status: "running",
            toolName: event.tool_name,
            arguments: event.arguments,
            parentDelegationId: activeDelegationIdRef.current ?? undefined,
            startedAt: Date.now(),
          }]);
        } else if (event.event === "tool_result") {
          setActivityItems((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].kind === "tool" && next[i].toolName === event.tool_name && next[i].status === "running") {
                next[i] = { ...next[i], status: "done", resultPreview: event.result_preview, durationMs: event.duration_ms };
                break;
              }
            }
            return next;
          });
        } else if (event.event === "delegation_started") {
          const id = `del_${activityCounterRef.current++}`;
          activeDelegationIdRef.current = id;
          setActivityItems((prev) => [...prev, {
            id,
            kind: "delegation",
            status: "running",
            agentName: event.agent,
            startedAt: Date.now(),
          }]);
        } else if (event.event === "delegation_completed") {
          setActivityItems((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].kind === "delegation" && next[i].agentName === event.agent && next[i].status === "running") {
                next[i] = { ...next[i], status: "done" };
                break;
              }
            }
            return next;
          });
          activeDelegationIdRef.current = null;
        } else if (event.event === "reasoning") {
          // Already pushed to rawTraceEventsRef above; bump tick so the
          // ReasoningPill recomputes via buildReasoningSteps on next render.
          setReasoningEventTick((t) => t + 1);
        } else if (event.event === "step_reset" || event.event === "reasoning_dropped_at_provider_switch") {
          // Already pushed to rawTraceEventsRef above; bump tick so the
          // ReasoningPill recomputes via buildReasoningSteps on next render.
          setReasoningEventTick((t) => t + 1);
        }
      } else if (event.event === "approval_requested") {
        setPendingApproval({ runId: event.run_id, toolName: event.tool_name, toolInput: event.tool_input, message: event.message });
      } else if (event.event === "error") {
        setError(event.error);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content || `Error: ${event.error}` };
          }
          return next;
        });
      }
    };

    try {
      if (selectedType === "orchestration" && selectedOrchId) {
        await streamOrchestrationRun(
          token,
          ref!,
          selectedOrchId,
          { message, session_id: selectedSessionId ?? undefined },
          onEvent,
          { signal: abortController.signal }
        );
      } else if (selectedAgentId) {
        await streamAgentRun(
          token,
          ref!,
          selectedAgentId,
          {
            message,
            session_id: selectedSessionId ?? undefined,
            knowledge_bases:
              selectedKbIds.length > 0
                ? selectedKbIds.map((id) => {
                    const sourceIds = kbSourceFilters[id];
                    return sourceIds?.length ? { id, source_ids: sourceIds } : { id };
                  })
                : undefined,
            citations_enabled: citationsEnabled || undefined,
          },
          onEvent,
          { signal: abortController.signal }
        );
      }
    } catch (err) {
      // AbortError means user navigated away — set selectedSessionId so polling
      // picks up the run when they return to this page.
      if (err instanceof DOMException && err.name === "AbortError") {
        if (startSessionIdRef.current) {
          setSelectedSessionId(startSessionIdRef.current);
        }
        return;
      }
      setError(err instanceof Error ? err.message : "Stream failed");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: last.content || (err instanceof Error ? err.message : "Stream failed"),
          };
        }
        return next;
      });
    } finally {
      streamAbortRef.current = null;
      startSessionIdRef.current = null;
      setIsStreaming(false);
    }
  };

  const selectedRun: AgentRun | null =
    sessionRuns.find((r) => r.run_id === selectedRunId) ?? null;
  const selectedRunRetrievedContext =
    selectedRunId ? retrievedContextByRunId[selectedRunId] : null;
  const isLoadingSelectedRunRetrievedContext =
    selectedRunId ? !!retrievedContextLoadingByRunId[selectedRunId] : false;

  const selectedAgent: Agent | null =
    selectedAgentId ? agents.find((a) => a.id === selectedAgentId) ?? null : null;

  const selectedSession: SessionListItem | null =
    selectedSessionId ? displaySessions.find((s) => s.session_id === selectedSessionId) ?? null : null;

  if (isLoadingAgents) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Left panel: Agent selector, metadata, New Session button, sessions list
  const runsSidebarPanel = (
    <div className="h-full flex flex-col">
      {/* Type + entity selector */}
      <div className={`p-3 ${selectedAgent ? "border-l-2 border-l-emerald-500/50" : ""} ${!selectedAgent && selectedType === "agent" ? "border-b border-muted" : ""}`}>
        <label className="text-xs text-foreground-muted uppercase tracking-wider block mb-1.5">
          Test
        </label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => { setSelectedType("agent"); setSelectedOrchId(null); setSelectedSessionId(null); setMessages([]); }}
            className={cn(
              "flex-1 text-xs py-1.5 rounded-md border transition-colors",
              selectedType === "agent"
                ? "bg-brand-200 border-brand-400 text-brand-600"
                : "bg-surface-200 border-default text-foreground-muted hover:text-foreground"
            )}
          >
            Agent
          </button>
          <button
            type="button"
            onClick={() => { setSelectedType("orchestration"); setSelectedAgentId(null); setSelectedSessionId(null); setMessages([]); }}
            className={cn(
              "flex-1 text-xs py-1.5 rounded-md border transition-colors",
              selectedType === "orchestration"
                ? "bg-brand-200 border-brand-400 text-brand-600"
                : "bg-surface-200 border-default text-foreground-muted hover:text-foreground"
            )}
          >
            Orchestration
          </button>
        </div>
        {selectedType === "agent" ? (
          agents.length === 0 ? (
            <Link
              href={`/project/${ref}/agents`}
              className="text-brand-600 hover:text-brand-600 text-sm"
            >
              Create an agent
            </Link>
          ) : (
            <select
              value={selectedAgentId ?? ""}
              onChange={(e) => {
                setSelectedAgentId(e.target.value || null);
                setSelectedSessionId(null);
                setMessages([]);
                setSessions([]);
                setSelectedRunId(null);
                setSearchQuery("");
                setDebouncedSearch("");
                setFilterDateAfter("");
                setFilterDateBefore("");
                setFilterMinRuns("");
                setFilterMaxRuns("");
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md
                bg-surface-200 hover:bg-surface-300
                text-foreground text-[15px] font-medium
                border border-default transition-colors"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )
        ) : (
          orchestrations.length === 0 ? (
            <Link
              href={`/project/${ref}/orchestrations`}
              className="text-brand-600 hover:text-brand-600 text-sm"
            >
              Create an orchestration
            </Link>
          ) : (
            <select
              value={selectedOrchId ?? ""}
              onChange={(e) => {
                setSelectedOrchId(e.target.value || null);
                setSelectedSessionId(null);
                setMessages([]);
                setSessions([]);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md
                bg-surface-200 hover:bg-surface-300
                text-foreground text-[15px] font-medium
                border border-default transition-colors"
            >
              <option value="">Select orchestration...</option>
              {orchestrations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )
        )}
      </div>

      {/* Agent metadata - no border above to avoid dividing line from dropdown */}
      {selectedAgent && (
        <div className="px-3 pb-3 border-b border-muted space-y-2 text-xs text-foreground-light">
          <div>
            <span className="text-foreground-muted">Model:</span>{" "}
            <span className="text-foreground">{selectedAgent.model || "—"}</span>
          </div>
          {selectedAgent.system_prompt != null && selectedAgent.system_prompt !== "" && (
            <div>
              <span className="text-foreground-muted block mb-1">System prompt:</span>
              <div className="text-foreground max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {selectedAgent.system_prompt}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Session button */}
      <div className="p-3">
        <button
          onClick={handleNewConversation}
          disabled={!(selectedType === "agent" ? selectedAgentId : selectedOrchId)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium
            bg-transparent hover:bg-brand-200
            text-brand-600 hover:text-brand-600
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            border border-brand-400 hover:border-brand-500 transition-colors"
        >
          <Plus size={14} />
          New Session
        </button>
      </div>

      {/* Search & filter controls */}
      {(selectedType === "agent" ? selectedAgentId : selectedOrchId) && (
        <div className="px-3 pb-2 space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-8 pr-8 py-1.5 rounded-md text-sm
                bg-surface-200 border border-default
                text-foreground placeholder-foreground-muted
                focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-foreground-muted hover:text-foreground transition"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {/* Filter row */}
          <div className="flex items-center gap-2">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition",
                    activeFilterCount > 0
                      ? "border-brand-400 text-brand-600 bg-brand-200"
                      : "border-default text-foreground-muted hover:text-foreground hover:bg-surface-200"
                  )}
                >
                  <SlidersHorizontal size={12} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-400 text-white leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3 space-y-3">
                <div>
                  <label className="text-xs text-foreground-muted block mb-1">Created after</label>
                  <input
                    type="date"
                    value={filterDateAfter}
                    onChange={(e) => setFilterDateAfter(e.target.value)}
                    className="w-full px-2 py-1 rounded-md text-sm bg-surface-200 border border-default text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-foreground-muted block mb-1">Created before</label>
                  <input
                    type="date"
                    value={filterDateBefore}
                    onChange={(e) => setFilterDateBefore(e.target.value)}
                    className="w-full px-2 py-1 rounded-md text-sm bg-surface-200 border border-default text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-foreground-muted block mb-1">Min runs</label>
                    <input
                      type="number"
                      min="0"
                      value={filterMinRuns}
                      onChange={(e) => setFilterMinRuns(e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1 rounded-md text-sm bg-surface-200 border border-default text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-foreground-muted block mb-1">Max runs</label>
                    <input
                      type="number"
                      min="0"
                      value={filterMaxRuns}
                      onChange={(e) => setFilterMaxRuns(e.target.value)}
                      placeholder="—"
                      className="w-full px-2 py-1 rounded-md text-sm bg-surface-200 border border-default text-foreground placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDateAfter("");
                      setFilterDateBefore("");
                      setFilterMinRuns("");
                      setFilterMaxRuns("");
                    }}
                    className="text-xs text-brand-600 hover:text-brand-600 transition"
                  >
                    Reset all filters
                  </button>
                )}
              </PopoverContent>
            </Popover>
            {hasFiltersOrSearch && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setFilterDateAfter("");
                  setFilterDateBefore("");
                  setFilterMinRuns("");
                  setFilterMaxRuns("");
                }}
                className="text-xs text-foreground-muted hover:text-foreground transition"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2">
        {!(selectedType === "agent" ? selectedAgentId : selectedOrchId) ? (
          <p className="text-foreground-muted text-sm p-2">
            <Link
              href={`/project/${ref}/agents`}
              className="text-brand-600 hover:text-brand-600"
            >
              Create an agent
            </Link>{" "}
            to get started.
          </p>
        ) : isLoadingSessions ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin h-5 w-5 border-2 border-brand-400 border-t-transparent rounded-full" />
          </div>
        ) : displaySessions.length === 0 ? (
          hasFiltersOrSearch ? (
            <div className="text-center p-4 space-y-2">
              <p className="text-foreground-muted text-sm">No sessions match your filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setFilterDateAfter("");
                  setFilterDateBefore("");
                  setFilterMinRuns("");
                  setFilterMaxRuns("");
                }}
                className="text-xs text-brand-600 hover:text-brand-600 transition"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <p className="text-foreground-muted text-sm p-2">No sessions yet. Enter a query to create one.</p>
          )
        ) : (
          <div className="space-y-0.5">
            {displaySessions.map((s) => {
              const isActive = selectedSessionId === s.session_id;
              const isPinned = isActive && hasFiltersOrSearch && !sessionIdsInResults.has(s.session_id);
              return (
                <div
                  key={s.session_id}
                  className={cn(
                    "group flex items-start gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-colors border-l-2",
                    isActive
                      ? "border-l-emerald-500 bg-brand-200 text-brand-600"
                      : "border-l-transparent text-foreground-light hover:bg-surface-200 hover:text-foreground",
                    isPinned && "opacity-60"
                  )}
                  onClick={() => setSelectedSessionId(s.session_id)}
                  title={s.session_id}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-snug">
                      {s.first_message || <span className="text-foreground-muted italic">Empty session</span>}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-foreground-muted">
                        {timeAgo(s.last_activity_at ?? s.created_at)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-300 text-foreground-muted">
                        {s.run_count} {s.run_count === 1 ? "run" : "runs"}
                      </span>
                      {isPinned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-300 text-foreground-muted italic">
                          pinned
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.session_id, e)}
                    className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 hover:bg-surface-300 rounded transition-all shrink-0"
                    title="Delete session"
                  >
                    <Trash2 size={12} className="text-destructive-600" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-default">
      {error && (
        <div className="mx-4 mt-2 p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <ResizableLayout
        leftPanel={runsSidebarPanel}
        leftPanelTitle="Runs"
        defaultSize={20}
        minSize={15}
        maxSize={30}
      >
        {(() => {
          const messagesPanel = (
            <>
              <div className="flex items-center justify-end px-4 pt-2 shrink-0">
                <MarkdownToggle />
              </div>
              {selectedSession && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-muted text-xs text-foreground-muted shrink-0">
                  <span className="font-mono truncate max-w-[240px]" title={selectedSession.session_id}>
                    Session {selectedSession.session_id.slice(0, 8)}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span>{timeAgo(selectedSession.created_at ?? selectedSession.last_activity_at)}</span>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-300">
                    {selectedSession.run_count} {selectedSession.run_count === 1 ? "run" : "runs"}
                  </span>
                </div>
              )}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {!(selectedType === "agent" ? selectedAgentId : selectedOrchId) ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <MessageSquare size={32} className="text-foreground-muted" />
                    <p className="text-foreground-muted text-sm">
                      {selectedType === "agent" ? "Select an agent to start." : "Select an orchestration to start."}
                    </p>
                  </div>
                ) : isLoadingMessages && selectedType === "agent" ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-brand-400 border-t-transparent rounded-full" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <MessageSquare size={32} className="text-foreground-muted" />
                    <p className="text-foreground-muted text-sm">
                      Enter a query to start.
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                      >
                        {/* Reasoning pill — above activity feed */}
                        {msg.role === "assistant" && (() => {
                          const isLast = idx === messages.length - 1;
                          const isStreamingThisMsg = isStreaming && isLast;
                          // Persisted-step source priority: msg.events (any in-message
                          // events) → eventsMap.get(run_id) (events captured at the
                          // complete-event from rawTraceEventsRef.current). Without the
                          // eventsMap fallback, just-completed live runs render
                          // "Thought for · 0 steps" because the BE refetch via
                          // sessionsApi.getMessages doesn't return events.
                          const persistedEvents = !isStreamingThisMsg
                            ? (msg.events && msg.events.length > 0
                                ? msg.events
                                : (msg.run_id ? eventsMap.get(msg.run_id) : undefined))
                            : undefined;
                          const liveSteps = isStreamingThisMsg
                            ? buildReasoningSteps(rawTraceEventsRef.current, true)
                            : [];
                          const persistedSteps = persistedEvents
                            ? buildReasoningSteps(persistedEvents, false)
                            : [];
                          const steps = isStreamingThisMsg ? liveSteps : persistedSteps;
                          const hasReasoningEvents = steps.some((s) => s.reasoningText.length > 0);
                          const hasContent = !!msg.content && msg.content.length > 0;
                          const pillState = derivePillState(msg, isStreamingThisMsg, hasReasoningEvents, hasContent);
                          if (pillState === null) return null;
                          return (
                            <ReasoningPill
                              state={pillState}
                              steps={steps}
                              durationMs={msg.reasoning_duration_ms ?? null}
                            />
                          );
                        })()}
                        {/* Activity feed — live during streaming, persisted on historical messages */}
                        {msg.role === "assistant" && (
                          (isStreaming && idx === messages.length - 1 && activityItems.length > 0)
                            ? <StreamingActivityFeed items={activityItems} />
                            : (msg.activityItems && msg.activityItems.length > 0)
                              ? <StreamingActivityFeed items={msg.activityItems} />
                              : null
                        )}
                        {/* Assistant bubble — typewriter-wrapped — or empty (pill carries the "thinking" indicator) */}
                        {msg.role === "assistant" && !msg.content && isStreaming && idx === messages.length - 1 ? (
                          null
                        ) : (
                          <div
                            className={`max-w-[90%] px-4 py-2.5 ${
                              msg.role === "user"
                                ? "rounded-2xl rounded-br-md bg-brand-400 text-white shadow-sm"
                                : "rounded-2xl rounded-bl-md bg-surface-200 text-foreground shadow-sm"
                            }`}
                          >
                            {msg.role === "assistant" ? (
                              <TypewriterStream
                                text={msg.content || ""}
                                options={{ fastForward: !(isStreaming && idx === messages.length - 1) }}
                              >
                                {(visible) => (
                                  <CitationText
                                    className="text-sm"
                                    citations={msg.citations || (idx === messages.length - 1 && isStreaming ? citationCandidates : undefined)}
                                    forceRaw={isStreaming && idx === messages.length - 1}
                                  >
                                    {visible}
                                  </CitationText>
                                )}
                              </TypewriterStream>
                            ) : (
                              <MarkdownText
                                className="text-sm"
                                forceRaw={false}
                              >
                                {msg.content || ""}
                              </MarkdownText>
                            )}
                          </div>
                        )}
                        {msg.role === "assistant" && msg.run_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRunId(msg.run_id ?? null);
                              fetchSessionRuns();
                              if (msg.run_id) fetchRunRetrievedContext(msg.run_id);
                              if (msg.run_id && selectedType === "orchestration") fetchOrchRunDetail(msg.run_id);
                            }}
                            className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-foreground-muted hover:text-brand-600 hover:bg-surface-200 transition"
                            title="View message details"
                            aria-label="View message details"
                          >
                            <FileSearch size={14} />
                            <span>Details</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {/* Approval card — shown inline when a run is paused for approval */}
                    {pendingApproval && !approvalResolved && (
                      <div className="flex flex-col items-start">
                        <div className="max-w-[90%]">
                          <ApprovalCard
                            runId={pendingApproval.runId}
                            toolName={pendingApproval.toolName}
                            toolInput={pendingApproval.toolInput}
                            message={pendingApproval.message}
                            onApprove={async (runId, approved, reason) => {
                              await runsApi.approve(token!, ref!, runId, { approved, reason });
                              setApprovalResolved(approved ? "approved" : "denied");
                              setPendingApproval(null);
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {approvalResolved && (
                      <div className="flex flex-col items-start">
                        <div className={`max-w-[90%] p-3 rounded-lg border text-sm ${
                          approvalResolved === "approved"
                            ? "bg-emerald-400/30 border-emerald-300/70 text-white"
                            : "bg-red-500/40 border-red-300/70 text-white"
                        }`}>
                          {approvalResolved === "approved" ? "✓ Approved" : "✗ Denied"}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <form onSubmit={handleSend} className="p-4 border-t border-default space-y-3">
                {selectedType === "agent" && <div>
                  <label className="text-xs text-foreground-muted block mb-1.5">
                    Pre-loaded context
                  </label>
                  {knowledgeBases.length === 0 ? (
                    <p className="text-xs text-foreground-muted italic">No knowledge bases available</p>
                  ) : (
                    <div className="max-h-24 overflow-y-auto space-y-1.5 rounded-lg border border-default bg-surface-200 px-3 py-2">
                      {knowledgeBases.map((kb) => {
                        const checked = selectedKbIds.includes(kb.id);
                        const filterCount = kbSourceFilters[kb.id]?.length || 0;
                        return (
                          <div key={kb.id} className="flex items-center gap-2">
                            <label
                              className="flex items-center gap-2 cursor-pointer text-sm text-foreground hover:text-foreground flex-1 min-w-0"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => {
                                  setSelectedKbIds((prev) =>
                                    checked ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                                  );
                                }}
                              />
                              <span className="truncate">{kb.name}</span>
                              {filterCount > 0 && (
                                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-400/15 text-brand-600">
                                  {filterCount} {filterCount === 1 ? "filter" : "filters"}
                                </span>
                              )}
                            </label>
                            <button
                              type="button"
                              title="Filter by source documents"
                              onClick={() => openSourceFilterModal(kb.id)}
                              className={cn(
                                "shrink-0 p-1 rounded transition",
                                filterCount > 0
                                  ? "text-brand-600 hover:bg-brand-400/10"
                                  : "text-foreground-muted hover:text-foreground hover:bg-surface-300"
                              )}
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>}
                {selectedType === "agent" && (
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                    <Checkbox
                      checked={citationsEnabled}
                      onCheckedChange={(checked) => setCitationsEnabled(!!checked)}
                    />
                    <span className="text-xs text-foreground-muted">Enable citations</span>
                  </label>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Enter a query..."
                    disabled={!(selectedType === "agent" ? selectedAgentId : selectedOrchId) || isStreaming}
                    className="flex-1 bg-surface-200 border border-default text-foreground rounded-xl px-4 py-3 text-sm placeholder-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!(selectedType === "agent" ? selectedAgentId : selectedOrchId) || !inputMessage.trim() || isStreaming}
                    className="px-5 py-3 bg-brand-400 hover:bg-brand-500 disabled:bg-surface-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {isStreaming ? "…" : "Send"}
                  </button>
                </div>
              </form>

              {/* Source filter modal */}
              <Dialog
                open={!!sourceFilterModalKbId}
                onOpenChange={(open) => { if (!open) setSourceFilterModalKbId(null); }}
              >
                <DialogContent className="sm:max-w-md p-4">
                  <DialogTitle className="text-sm font-medium text-foreground">
                    Filter sources{sourceFilterModalKbId ? ` — ${knowledgeBases.find((kb) => kb.id === sourceFilterModalKbId)?.name ?? ""}` : ""}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-foreground-muted mt-1">
                    Select which source documents to include during retrieval. Leave all unchecked to search all sources.
                  </DialogDescription>
                  <div className="mt-3 max-h-60 overflow-y-auto space-y-1.5 rounded-lg border border-default bg-surface-200 px-3 py-2">
                    {isLoadingModalSources ? (
                      <p className="text-xs text-foreground-muted italic py-2">Loading sources…</p>
                    ) : modalIndexedSources.length === 0 ? (
                      <p className="text-xs text-foreground-muted italic py-2">No indexed sources in this knowledge base</p>
                    ) : (
                      modalIndexedSources.map((src) => {
                        const currentFilters = sourceFilterModalKbId ? (kbSourceFilters[sourceFilterModalKbId] || []) : [];
                        const isSelected = currentFilters.includes(src.source_id);
                        return (
                          <label
                            key={src.id}
                            className="flex items-center gap-2 cursor-pointer text-sm text-foreground hover:text-foreground"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {
                                if (!sourceFilterModalKbId) return;
                                setKbSourceFilters((prev) => {
                                  const existing = prev[sourceFilterModalKbId] || [];
                                  const next = isSelected
                                    ? existing.filter((id) => id !== src.source_id)
                                    : [...existing, src.source_id];
                                  return { ...prev, [sourceFilterModalKbId]: next };
                                });
                              }}
                            />
                            <FileText className="w-3.5 h-3.5 shrink-0 text-foreground-muted" />
                            <span className="truncate">{src.source_name || src.source_id}</span>
                            {src.file_type && (
                              <span className="shrink-0 text-[10px] text-foreground-muted uppercase">{src.file_type}</span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  {sourceFilterModalKbId && (kbSourceFilters[sourceFilterModalKbId]?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!sourceFilterModalKbId) return;
                        setKbSourceFilters((prev) => ({ ...prev, [sourceFilterModalKbId]: [] }));
                      }}
                      className="mt-2 text-xs text-foreground-muted hover:text-foreground underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </DialogContent>
              </Dialog>
            </>
          );

          const debugPanel = (
            <div className="h-full flex flex-col bg-surface-100 min-h-0 overflow-hidden">
              <div className="p-3 border-b border-default flex items-center justify-between shrink-0">
                <h2 className="font-medium text-foreground text-sm">Message debug</h2>
                <button
                  type="button"
                  onClick={() => setSelectedRunId(null)}
                  className="p-1.5 rounded text-foreground-muted hover:text-foreground hover:bg-surface-200 transition"
                  title="Close"
                  aria-label="Close message debug"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {selectedRun ? (
                  <div className="space-y-5 text-sm" key={selectedRun.run_id}>
                    <ExpandableSection title="Input messages" maxHeight={400}>
                      <ColoredJson data={selectedRun.input_messages} />
                    </ExpandableSection>

                    {/* Query Enrichment or Tokenization (auto-detected from input_messages) */}
                    {(() => {
                      const enrichment = (selectedRun.input_messages as Array<Record<string, unknown>>)
                        ?.find((m) => m._type === "query_enrichment");
                      if (!enrichment) return null;

                      const isTokenization = enrichment.method === "tokenization";

                      return (
                        <section>
                          <h3 className="text-foreground font-medium text-sm mb-2">
                            {isTokenization ? "Query tokenization" : "Query enrichment"}
                          </h3>
                          <div className="bg-surface-200 rounded-md p-3 space-y-2 text-xs">
                            {enrichment.error ? (
                              <div className="px-2 py-1.5 rounded bg-amber-500/25 border border-amber-300/60 text-amber-50">
                                {String(enrichment.error)}
                              </div>
                            ) : null}
                            <div>
                              <span className="text-foreground-muted">Original:</span>{" "}
                              <span className="text-foreground">{enrichment.original_query as string}</span>
                            </div>

                            {isTokenization ? (
                              // Tokenization method - show extracted tokens
                              <div>
                                <span className="text-foreground-muted">
                                  Extracted tokens ({enrichment.token_count as number}):
                                </span>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {(enrichment.extracted_tokens as string[])?.map((token, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 rounded bg-brand-200 text-brand-600 font-mono text-[11px]"
                                    >
                                      {token}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              // LLM enrichment method - show enriched query and keywords
                              <>
                                <div>
                                  <span className="text-foreground-muted">Enriched:</span>{" "}
                                  <span className="text-foreground">{enrichment.enriched_query as string}</span>
                                </div>
                                <div>
                                  <span className="text-foreground-muted">Keywords:</span>{" "}
                                  <span className="text-foreground font-mono">{enrichment.keyword_query as string}</span>
                                </div>
                                <div>
                                  <span className="text-foreground-muted">Model:</span>{" "}
                                  <span className="text-foreground-light">{enrichment.model as string}</span>
                                </div>
                                {enrichment.metadata_filter_invoked != null && (
                                  <>
                                    <div>
                                      <span className="text-foreground-muted">Metadata filter:</span>{" "}
                                      <span className="text-foreground">
                                        {enrichment.metadata_filter_invoked ? "applied" : "not applied"}
                                      </span>
                                    </div>
                                    {enrichment.metadata_filters && (
                                      <div>
                                        <span className="text-foreground-muted">Filters:</span>{" "}
                                        <span className="text-foreground font-mono">
                                          {JSON.stringify(enrichment.metadata_filters)}
                                        </span>
                                      </div>
                                    )}
                                    {enrichment.metadata_filter_matched_count != null && (
                                      <div>
                                        <span className="text-foreground-muted">Matched items:</span>{" "}
                                        <span className="text-foreground">{enrichment.metadata_filter_matched_count as number}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </section>
                      );
                    })()}

                    <ExpandableSection title="Output messages" maxHeight={400}>
                      <ColoredJson data={selectedRun.output_messages} />
                    </ExpandableSection>

                    {selectedRun.usage && (() => {
                      // OpenAI's Chat Completions API includes reasoning_tokens
                      // INSIDE completion_tokens, so the visible (text) output
                      // is the difference. Split it out here so users don't
                      // see "Output tokens = 200" when only 50 are visible.
                      const completion = Number(selectedRun.usage.completion_tokens ?? 0);
                      const reasoning = Number(selectedRun.usage.reasoning_tokens ?? 0);
                      const visibleOutput = Math.max(0, completion - reasoning);
                      return (
                        <section>
                          <h3 className="text-foreground font-medium text-sm mb-2">Usage</h3>
                          <div className="bg-surface-200 rounded-md p-3 text-xs font-mono space-y-1">
                            <div className="flex justify-between">
                              <span className="text-foreground-muted">Input tokens</span>
                              <span className="text-foreground">
                                {(selectedRun.usage.prompt_tokens as number)?.toLocaleString() ?? "—"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-foreground-muted">Output tokens</span>
                              <span className="text-foreground">{visibleOutput.toLocaleString()}</span>
                            </div>
                            {reasoning > 0 && (
                              <div className="flex justify-between">
                                <span className="text-foreground-muted">&nbsp;&nbsp;└ Reasoning</span>
                                <span className="text-foreground">{reasoning.toLocaleString()}</span>
                              </div>
                            )}
                            {selectedRun.usage.cached_tokens != null && (
                              <div className="flex justify-between">
                                <span className="text-foreground-muted">&nbsp;&nbsp;└ Cached input</span>
                                <span className="text-foreground">
                                  {(selectedRun.usage.cached_tokens as number).toLocaleString()}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-default pt-1 mt-1">
                              <span className="text-foreground-muted">Total tokens</span>
                              <span className="text-foreground">
                                {(selectedRun.usage.total_tokens as number)?.toLocaleString() ?? "—"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-foreground-muted">
                            <span>How is this counted?</span>
                            <TokenTrackingInfoTooltip />
                          </div>
                          <ReasoningModelZeroAlert
                            model={selectedRun.model}
                            reasoningTokens={reasoning}
                            compact
                          />
                        </section>
                      );
                    })()}

                    {(selectedRunRetrievedContext?.length ?? 0) > 0 && (() => {
                      const allEntries = selectedRunRetrievedContext as Array<Record<string, unknown>>;
                      const diagnostics = allEntries.find((e) => e._type === "retrieval_diagnostics") as
                        | { total_items?: number; items_included?: number; items_dropped?: number; token_limit?: number | null; estimated_tokens_used?: number }
                        | undefined;
                      const itemEntries = allEntries.filter((e) => e._type !== "retrieval_diagnostics") as Array<{
                        _type?: string;
                        id?: string;
                        item_id?: string;
                        knowledge_base_id?: string;
                        kb_name?: string;
                        indexing_strategy?: string;
                        chunk_size?: number;
                        overlap?: number;
                        retrieval_method?: string;
                        score?: number;
                        retrieval_score?: number;
                        reranker_score?: number | null;
                        source_id?: string;
                        source_name?: string;
                        text?: string;
                        meta?: Record<string, unknown>;
                        images?: Array<{ page: number; content?: string; url?: string; format: string }>;
                        enrichment_metadata?: Record<string, unknown>;
                        included_in_context?: boolean;
                      }>;

                      // Group items by parent document (mirrors backend _group_items_by_document)
                      const docGroups: { sourceId: string; docName: string; docDescription: string; items: typeof itemEntries }[] = [];
                      const groupMap = new Map<string, typeof docGroups[number]>();

                      itemEntries.forEach((item) => {
                        const key = item.source_id || (item.source_name ? `_name:${item.source_name}` : "_unknown");
                        let group = groupMap.get(key);
                        if (!group) {
                          const meta = item.meta ?? {};
                          group = {
                            sourceId: key,
                            docName: item.source_name || (meta.doc_name as string) || "",
                            docDescription: (meta.doc_description as string) || (meta.doc_summary as string) || "",
                            items: [],
                          };
                          groupMap.set(key, group);
                          docGroups.push(group);
                        }
                        group.items.push(item);
                      });

                      return (
                        <section>
                          <h3 className="text-foreground font-medium text-sm mb-2">
                            Retrieved context ({itemEntries.length})
                          </h3>

                          {diagnostics && (diagnostics.items_dropped ?? 0) > 0 && (
                            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/25 border border-amber-300/60 text-amber-50 text-xs">
                              Context limit reached: {diagnostics.items_included} of {diagnostics.total_items} items included
                              {diagnostics.token_limit != null && ` (${(diagnostics.estimated_tokens_used ?? 0).toLocaleString()} / ${diagnostics.token_limit.toLocaleString()} est. tokens)`}.
                              {" "}{diagnostics.items_dropped} item(s) dropped.
                            </div>
                          )}

                          <div className="space-y-4">
                            {docGroups.map((group) => (
                              <DocumentGroup key={group.sourceId} group={group} />
                            ))}
                          </div>
                        </section>
                      );
                    })()}
                    {isLoadingSelectedRunRetrievedContext && (
                      <p className="text-sm text-foreground-muted">
                        Loading retrieved context...
                      </p>
                    )}

                    {selectedRun?.run_id && traceMap.has(selectedRun.run_id) && (
                      <section>
                        <h3 className="text-foreground font-medium text-sm mb-2">Execution Trace</h3>
                        <ExecutionTrace
                          steps={traceMap.get(selectedRun.run_id)!}
                          events={eventsMap.get(selectedRun.run_id)}
                        />
                      </section>
                    )}

                    {/* Orchestration aggregate usage — sum the orch_run's
                        own LLM tokens (supervisor only for supervisor
                        strategy; pre-summed children for sequential/parallel)
                        with each child's tokens. Sequential/parallel
                        already roll children into orch_run.usage server-side
                        so we'd double-count if we summed both — for those
                        strategies we just show orch_run.usage as-is. */}
                    {(() => {
                      if (selectedType !== "orchestration" || !selectedRun?.run_id) return null;
                      const orchRun = orchRunDetailMap.get(selectedRun.run_id);
                      if (!orchRun) return null;
                      const orchUsage = orchRun.usage || {};
                      const children = orchRun.child_runs ?? [];
                      const childSum = (key: string): number =>
                        children.reduce(
                          (acc, c) => acc + Number((c.usage ?? {})[key] ?? 0),
                          0,
                        );
                      // Heuristic: if orch_usage's total ≈ sum(children
                      // totals), the engine pre-summed (sequential/parallel).
                      // Otherwise the orch is supervisor-only and we add
                      // children. Tolerate ±1 token of rounding noise.
                      const orchTotal = Number(orchUsage.total_tokens ?? 0);
                      const childrenTotal = childSum("total_tokens");
                      const preSummed =
                        children.length > 0 &&
                        childrenTotal > 0 &&
                        Math.abs(orchTotal - childrenTotal) <= 1;
                      const sum = (key: string): number =>
                        preSummed
                          ? Number(orchUsage[key] ?? 0)
                          : Number(orchUsage[key] ?? 0) + childSum(key);
                      const prompt = sum("prompt_tokens");
                      const completion = sum("completion_tokens");
                      const reasoning = sum("reasoning_tokens");
                      const cached = sum("cached_tokens");
                      // OpenAI defines total = prompt + completion (with
                      // reasoning bundled inside completion). Fall back to
                      // that when total_tokens isn't reported, NOT to
                      // prompt + completion + reasoning (which double-counts).
                      const total = sum("total_tokens") || prompt + completion;
                      const visibleOutput = Math.max(0, completion - reasoning);
                      if (total === 0) return null;
                      return (
                        <section>
                          <h3 className="text-foreground font-medium text-sm mb-2">Usage (this run)</h3>
                          <div className="bg-surface-200 rounded-md p-3 text-xs font-mono space-y-1">
                            <div className="flex justify-between">
                              <span className="text-foreground-muted">Input tokens</span>
                              <span className="text-foreground">{prompt.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-foreground-muted">Output tokens</span>
                              <span className="text-foreground">
                                {visibleOutput.toLocaleString()}
                              </span>
                            </div>
                            {reasoning > 0 && (
                              <div className="flex justify-between">
                                <span className="text-foreground-muted">&nbsp;&nbsp;└ Reasoning</span>
                                <span className="text-foreground">
                                  {reasoning.toLocaleString()}
                                </span>
                              </div>
                            )}
                            {cached > 0 && (
                              <div className="flex justify-between">
                                <span className="text-foreground-muted">&nbsp;&nbsp;└ Cached input</span>
                                <span className="text-foreground">
                                  {cached.toLocaleString()}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-default pt-1 mt-1">
                              <span className="text-foreground-muted">Total tokens</span>
                              <span className="text-foreground">{total.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-foreground-muted">
                            <span>How is this counted?</span>
                            <TokenTrackingInfoTooltip />
                          </div>
                          {/* Reasoning-model warning: fire if the supervisor
                              OR any child is a reasoning model but reasoning
                              tokens are 0 across the whole run. */}
                          {reasoning === 0 && (() => {
                            const candidateModel =
                              orchRun.model ||
                              children.find((c) => c.model)?.model ||
                              null
                            return (
                              <ReasoningModelZeroAlert
                                model={candidateModel}
                                reasoningTokens={0}
                                compact
                              />
                            )
                          })()}
                        </section>
                      );
                    })()}

                    {/* Delegated child agent runs — only for orchestration mode */}
                    {(() => {
                      if (selectedType !== "orchestration" || !selectedRun?.run_id) return null;
                      const orchRun = orchRunDetailMap.get(selectedRun.run_id);
                      if (!orchRun) return null;
                      const children = orchRun.child_runs;
                      if (!children?.length) return null;
                      return (
                        <section>
                          <h3 className="text-foreground font-medium text-sm mb-2">
                            Delegated agents ({children.length})
                          </h3>
                          <div className="space-y-2">
                            {children.map((child) => {
                              // Pass child.tool_calls so MultimodalOutput can
                              // render image blocks instead of "[multimodal content]".
                              const mappedChildEvents = child.events?.length
                                ? (child.events.map((e) => ({
                                    ...e,
                                    event: (e.type as string) || (e.event as string) || "",
                                  })) as Array<{ event: string; [key: string]: unknown }>)
                                : [];
                              const childSteps: TraceStep[] = mappedChildEvents.length
                                ? buildTraceTree(
                                    mappedChildEvents,
                                    (child as { tool_calls?: ToolCallRecord[] }).tool_calls,
                                  )
                                : [];
                              const childUsage = child.usage || {};
                              const childPrompt = Number(childUsage.prompt_tokens ?? 0);
                              const childCompletion = Number(childUsage.completion_tokens ?? 0);
                              const childReasoning = Number(childUsage.reasoning_tokens ?? 0);
                              // total = prompt + completion (reasoning is
                              // already inside completion per OpenAI's
                              // accounting); fall back to that, not to
                              // prompt + completion + reasoning.
                              const childTotal = Number(childUsage.total_tokens ?? 0) ||
                                childPrompt + childCompletion;
                              const childVisibleOutput = Math.max(
                                0, childCompletion - childReasoning,
                              );
                              return (
                                <details
                                  key={child.run_id}
                                  className="border border-default rounded-md p-2"
                                >
                                  <summary className="cursor-pointer text-sm text-foreground select-none">
                                    <span className="font-mono font-medium">{truncateRunId(child.run_id)}</span>
                                    <span className="ml-2 text-foreground-muted">
                                      {child.status} · {child.steps ?? childSteps.length} steps
                                    </span>
                                    {childTotal > 0 && (
                                      <span className="ml-2 text-foreground-muted">
                                        · {childTotal.toLocaleString()} tokens
                                      </span>
                                    )}
                                  </summary>
                                  {childTotal > 0 && (
                                    <div className="mt-2 bg-surface-200 rounded-md p-2 text-[11px] font-mono grid grid-cols-2 gap-x-3 gap-y-0.5">
                                      <span className="text-foreground-muted">Input</span>
                                      <span className="text-foreground text-right">
                                        {childPrompt.toLocaleString()}
                                      </span>
                                      <span className="text-foreground-muted">Output (visible)</span>
                                      <span className="text-foreground text-right">
                                        {childVisibleOutput.toLocaleString()}
                                      </span>
                                      {childReasoning > 0 && (
                                        <>
                                          <span className="text-foreground-muted">&nbsp;&nbsp;└ Reasoning</span>
                                          <span className="text-foreground text-right">
                                            {childReasoning.toLocaleString()}
                                          </span>
                                        </>
                                      )}
                                      <span className="text-foreground-muted border-t border-default pt-0.5">Total</span>
                                      <span className="text-foreground text-right border-t border-default pt-0.5">
                                        {childTotal.toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  {childTotal > 0 && (
                                    <ReasoningModelZeroAlert
                                      model={child.model}
                                      reasoningTokens={childReasoning}
                                      compact
                                    />
                                  )}
                                  {childSteps.length > 0 ? (
                                    <div className="mt-2">
                                      <ExecutionTrace steps={childSteps} events={mappedChildEvents} />
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-foreground-muted italic">No trace events available.</p>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })()}

                    <section>
                      <h3 className="text-foreground font-medium text-sm mb-2">Run ID</h3>
                      <p className="font-mono text-sm text-foreground-light break-all select-all">{selectedRun.run_id}</p>
                    </section>
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">Loading run details&hellip;</p>
                )}
              </div>
            </div>
          );

          if (selectedRunId) {
            return (
              <ResizablePanelGroup
                orientation="horizontal"
                className="relative h-full min-h-0"
                autoSaveId="runs-messages-debug-layout"
              >
                <ResizablePanel defaultSize="65" minSize="30">
                  <div className="h-full flex flex-col min-h-0">{messagesPanel}</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="35" minSize="20" maxSize="60">
                  {debugPanel}
                </ResizablePanel>
              </ResizablePanelGroup>
            );
          }

          return (
            <div className="h-full flex flex-col min-h-0">{messagesPanel}</div>
          );
        })()}
      </ResizableLayout>
    </div>
  );
}

RunsPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Runs">{page}</AILayout>
  </DefaultLayout>
)

export default RunsPage
