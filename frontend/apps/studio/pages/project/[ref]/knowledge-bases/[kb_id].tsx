import { useParams } from 'common'
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import DefaultLayout from '@/components/layouts/DefaultLayout'
import AILayout from '@/components/layouts/AILayout/AILayout'
import type { NextPageWithLayout } from '@/types'
import { knowledgeBasesApi, kbInspectorApi, sourcesApi, hasAiAuth, ChunksListResponse, PageIndexNodeItem, PageIndexTocItem, TocStructureNode, FullDocumentItem, Doc2JSONDocument, SearchResultItem, EnrichmentConfig, EnrichmentField } from "@/lib/ai-api";
import { cn } from "@/lib/utils";
import { useProjectSupabaseClient, KnowledgeBase, Source, IndexedSource } from "@/hooks/ai/useProjectSupabaseClient";
import { useKBDefaults } from "@/hooks/useKBDefaults";
import { KBConfigFields, isValidInt } from "@/components/interfaces/AI/KnowledgeBases/KBConfigFields";
import { BM25IndexCard } from "@/components/interfaces/AI/KnowledgeBases/BM25IndexCard";
import {
  type JsonSchemaField,
  schemaFieldsToBackendFormat,
  backendFormatToSchemaFields,
} from "@/components/interfaces/AI/KnowledgeBases/JsonSchemaEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button_Shadcn_ as Button,
} from "ui";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, LayersIcon, Sparkles, Trash2Icon, XCircleIcon } from "lucide-react";
import { MarkdownText } from "@/components/interfaces/AI/Shared/MarkdownText";
import { MarkdownToggle } from "@/components/interfaces/AI/Shared/MarkdownToggle";
import { JsonSyntaxHighlight } from "@/components/interfaces/AI/Shared/JsonSyntaxHighlight";
import { StatusPill } from "@/components/interfaces/AI/Shared/StatusPill";
import { ResizablePanelGroup as PanelGroup, ResizablePanel as Panel, ResizableHandle as PanelResizeHandle } from "ui";
import { useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'

function shortFileType(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/octet-stream": "bin",
  };
  return map[mime.toLowerCase()] ?? mime.split("/").pop() ?? mime;
}

function EnrichmentMetadataBox({
  itemId,
  results,
  fields,
  itemErrors,
}: {
  itemId: string;
  results: Record<string, Record<string, unknown>>;
  fields: EnrichmentField[];
  itemErrors?: Record<string, string>;
}) {
  const errorMsg = itemErrors?.[itemId];
  if (errorMsg) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-red-500/25 border border-red-300/60">
        <p className="text-red-50 text-xs mb-1 font-medium">Enrichment Failed</p>
        <p className="text-red-50 text-xs truncate" title={errorMsg}>{errorMsg}</p>
      </div>
    );
  }
  const data = results[itemId];
  if (!data) return null;
  return (
    <div className="mt-2 p-3 rounded-lg bg-emerald-500/25 border border-emerald-300/60">
      <p className="text-emerald-50 text-xs mb-2 font-medium">Enriched Metadata</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {fields.map((f) => (
          <span key={f.name}>
            <span className="text-foreground-muted">{f.name}:</span>{" "}
            <span className="text-foreground-light">
              {data[f.name] != null ? String(data[f.name]) : "\u2014"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TocTree({
  nodes,
  selectedNodeId,
  onSelect,
  depth,
}: {
  nodes: TocStructureNode[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.node_id}>
          <button
            type="button"
            onClick={() => onSelect(node.node_id)}
            title={node.title}
            className={cn(
              "w-full text-left text-sm py-1.5 pr-2 truncate transition-colors",
              selectedNodeId === node.node_id
                ? "bg-emerald-500/35 text-white border border-emerald-300/50"
                : "text-foreground-light hover:bg-surface-300/50 hover:text-foreground"
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {node.title}
          </button>
          {node.nodes && node.nodes.length > 0 && (
            <TocTree
              nodes={node.nodes}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

type EnrichmentFieldForm = EnrichmentField & { _enumRaw?: string };
const RESERVED_FIELD_NAMES = new Set(["id", "item_id", "item_type", "enriched_at", "_enrichment_error"]);
const FIELD_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const KnowledgeBaseDetailPage: NextPageWithLayout = () => {
  const { ref, kb_id: kbIdParam } = useParams()
  const { token, isReady } = useProjectSupabaseClient();
  const params = useParams();
  const kbId = kbIdParam as string;
  const { defaults } = useKBDefaults();

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [sourceCounts, setSourceCounts] = useState<{
    indexed: number; failed: number; pending: number; indexing: number; cancelled: number; total: number;
  }>({ indexed: 0, failed: 0, pending: 0, indexing: 0, cancelled: 0, total: 0 });
  const [drift, setDrift] = useState<'none' | 'enrichment_only' | 'full'>('none');
  const [bm25Status, setBm25Status] = useState<'absent' | 'stale' | 'ready' | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'indexed' | 'failed' | 'pending' | 'indexing' | 'cancelled'>('');
  const [sortMode, setSortMode] = useState<{ sort?: 'name' | 'created_at'; order?: 'asc' | 'desc' }>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddSource, setShowAddSource] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [sourceSearchText, setSourceSearchText] = useState("");
  const [debouncedAddSourceSearch, setDebouncedAddSourceSearch] = useState("");
  const [addSourcePage, setAddSourcePage] = useState(1);
  const [addSourceTotalCount, setAddSourceTotalCount] = useState(0);
  const [isLoadingAvailableSources, setIsLoadingAvailableSources] = useState(false);
  const [addingProgress, setAddingProgress] = useState<{ current: number; total: number } | null>(null);
  const ADD_SOURCES_PER_PAGE = 20;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [inspectSource, setInspectSource] = useState<(IndexedSource & { source_name?: string }) | null>(null);
  const [chunksData, setChunksData] = useState<ChunksListResponse | null>(null);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksPage, setChunksPage] = useState(1);
  const CHUNKS_PER_PAGE = 10;

  // Indexing-failure UX state.
  // - inspectFailureFor: the indexed_source whose failure modal is open.
  // - retryingIndexedSourceIds: per-row "Retrying…" spinner.
  // - isRetryingAllFailed: bulk-action spinner for "Retry all failed".
  const [inspectFailureFor, setInspectFailureFor] = useState<
    (IndexedSource & { source_name?: string }) | null
  >(null);
  const [retryingIndexedSourceIds, setRetryingIndexedSourceIds] = useState<Set<string>>(
    new Set(),
  );
  const [isRetryingAllFailed, setIsRetryingAllFailed] = useState(false);

  const [allNodes, setAllNodes] = useState<PageIndexNodeItem[] | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesMap, setNodesMap] = useState<Map<string, PageIndexNodeItem>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [tocData, setTocData] = useState<PageIndexTocItem | null>(null);
  const [tocLoading, setTocLoading] = useState(false);

  const [fullDocData, setFullDocData] = useState<FullDocumentItem | null>(null);
  const [fullDocLoading, setFullDocLoading] = useState(false);

  // Doc2JSON inspection state
  const [doc2jsonData, setDoc2jsonData] = useState<Doc2JSONDocument | null>(null);
  const [doc2jsonLoading, setDoc2jsonLoading] = useState(false);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [pageImagesLoading, setPageImagesLoading] = useState(false);
  const [sourceTextContent, setSourceTextContent] = useState<string | null>(null);
  const doc2jsonFetchId = useRef(0);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateName, setUpdateName] = useState("");
  const [updateDescription, setUpdateDescription] = useState("");
  const [updateIndexingStrategy, setUpdateIndexingStrategy] = useState("chunk_embed");
  const [updateChunkSize, setUpdateChunkSize] = useState("2000");
  const [updateOverlap, setUpdateOverlap] = useState("50");
  const [updatePageIndexModel, setUpdatePageIndexModel] = useState(
    String(defaults.strategies.page_index.default_indexing_config.model ?? "gpt-5-mini")
  );
  const [updateRetrievalMethod, setUpdateRetrievalMethod] = useState("hybrid");
  const [updateTopK, setUpdateTopK] = useState("5");
  const [updateRetrievalModel, setUpdateRetrievalModel] = useState(
    String(defaults.strategies.page_index.default_retrieval_config.retrieval_model ?? "gpt-5-mini")
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateRerankerEnabled, setUpdateRerankerEnabled] = useState(false);
  const [updateRerankerModel, setUpdateRerankerModel] = useState(defaults.reranker.default_model);
  const [updateRerankerCandidateCount, setUpdateRerankerCandidateCount] = useState(
    String(defaults.reranker.candidate_count)
  );
  const [updateMinPerSource, setUpdateMinPerSource] = useState("0");
  const [updateMaxPerSource, setUpdateMaxPerSource] = useState("0");
  const [updateContextMode, setUpdateContextMode] = useState("text");
  const [updateVectorWeight, setUpdateVectorWeight] = useState(defaults.hybrid_vector_weight);
  const [updateQueryEnrichmentModel, setUpdateQueryEnrichmentModel] = useState(defaults.query_enrichment.model);
  const [updateQueryEnrichmentEnabled, setUpdateQueryEnrichmentEnabled] = useState(false);
  const [updateTsLanguage, setUpdateTsLanguage] = useState("english");
  const [updateFullDocSummaryModel, setUpdateFullDocSummaryModel] = useState(
    String(defaults.strategies.full_document.default_indexing_config.summary_model ?? "gpt-5-mini")
  );
  const [updateGraphIndexModel, setUpdateGraphIndexModel] = useState(
    String(defaults.strategies.graph_index.default_indexing_config.model ?? "gpt-5-mini")
  );
  const [updateGraphIndexEnrichmentModel, setUpdateGraphIndexEnrichmentModel] = useState(
    String(defaults.strategies.graph_index.default_indexing_config.enrichment_model ?? "gpt-5-mini")
  );
  const [updateGraphIndexReasoningEffort, setUpdateGraphIndexReasoningEffort] = useState<string>("");
  const [updateGraphIndexEnrichmentReasoningEffort, setUpdateGraphIndexEnrichmentReasoningEffort] = useState<string>("");
  const [updatePageIndexReasoningEffort, setUpdatePageIndexReasoningEffort] = useState<string>("");
  const [updateFullDocSummaryReasoningEffort, setUpdateFullDocSummaryReasoningEffort] = useState<string>("");
  const [updateDoc2jsonExtractionReasoningEffort, setUpdateDoc2jsonExtractionReasoningEffort] = useState<string>("");
  const [updateRetrievalReasoningEffort, setUpdateRetrievalReasoningEffort] = useState<string>("");
  const [updateQueryEnrichmentReasoningEffort, setUpdateQueryEnrichmentReasoningEffort] = useState<string>("");
  const [updateEmbeddingModel, setUpdateEmbeddingModel] = useState(
    String(defaults.strategies.chunk_embed.default_indexing_config.embedding_model ?? "text-embedding-3-small")
  );
  const originalEmbeddingModel = useRef<string>("");
  // Doc2JSON strategy state
  const [updateDoc2jsonExtractionModel, setUpdateDoc2jsonExtractionModel] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.extraction_model ?? "gpt-5-mini")
  );
  const [updateDoc2jsonWindowSize, setUpdateDoc2jsonWindowSize] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.window_size ?? 4000)
  );
  const [updateDoc2jsonWindowOverlap, setUpdateDoc2jsonWindowOverlap] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.window_overlap ?? 200)
  );
  const [updateDoc2jsonUseImages, setUpdateDoc2jsonUseImages] = useState(
    Boolean(defaults.strategies.doc2json?.default_indexing_config?.use_images ?? false)
  );
  const [updateDoc2jsonPagesPerWindow, setUpdateDoc2jsonPagesPerWindow] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.pages_per_window ?? 3)
  );
  const [updateDoc2jsonSchema, setUpdateDoc2jsonSchema] = useState<JsonSchemaField[]>([]);

  // Enrichment state
  const [enrichmentConfig, setEnrichmentConfig] = useState<EnrichmentConfig | null>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [enrichmentFields, setEnrichmentFields] = useState<EnrichmentFieldForm[]>([]);
  const [enrichmentModel, setEnrichmentModel] = useState(defaults.enrichment.model);
  const [enrichmentMaxTokens, setEnrichmentMaxTokens] = useState(String(defaults.enrichment.max_tokens));
  const [enrichmentUseMultimodal, setEnrichmentUseMultimodal] = useState(false);
  const [isSavingEnrichment, setIsSavingEnrichment] = useState(false);
  const [isRunningEnrichment, setIsRunningEnrichment] = useState(false);
  const [isDeletingEnrichment, setIsDeletingEnrichment] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);

  // Enrichment results for inspection modal
  const [enrichmentResults, setEnrichmentResults] = useState<Record<string, Record<string, unknown>>>({});
  const [enrichmentFieldDefs, setEnrichmentFieldDefs] = useState<EnrichmentField[]>([]);
  const [enrichmentItemErrors, setEnrichmentItemErrors] = useState<Record<string, string>>({});
  const enrichmentFetchId = useRef(0);

  const handleUpdateStrategyChange = (strategy: string) => {
    setUpdateIndexingStrategy(strategy);
    const def = defaults.strategies[strategy];
    if (def) {
      setUpdateRetrievalMethod(def.default_retrieval_method);
      const embModel = def.default_indexing_config.embedding_model;
      if (typeof embModel === "string") {
        setUpdateEmbeddingModel(embModel);
      }
    }
    setUpdateTopK(strategy === "full_document" ? "3" : "5");
  };

  const currentStrategy = (kb?.indexing_config as { strategy?: string })?.strategy ?? "chunk_embed";
  const useImages = (kb?.indexing_config as { use_images?: boolean })?.use_images ?? false;

  const [isReindexing, setIsReindexing] = useState(false);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const [graphErrorCounts, setGraphErrorCounts] = useState<Record<string, { total: number; failed: number }>>({});
  const [graphErrorCountsLoading, setGraphErrorCountsLoading] = useState(false);
  const [reenrichingSource, setReenrichingSource] = useState<{ id: string; action: "retry" | "reenrich" } | null>(null);
  const [isReenrichingAll, setIsReenrichingAll] = useState(false);
  const [cancellingIndexId, setCancellingIndexId] = useState<string | null>(null);

  const fetchKb = async () => {
    if (!isReady || !hasAiAuth(token)) return;
    try {
      const kbData = await knowledgeBasesApi.get(token, ref as string, kbId);
      setKb(kbData);
      // Guard against pre-source_counts backends (e.g. project-service
      // container built before commit 08286779, when the KB GET response
      // didn't include source_counts). Without this fallback, undefined
      // overwrites the safe-zero default and every `sourceCounts.X` read
      // below throws "Cannot read properties of undefined".
      setSourceCounts(
        kbData.source_counts ?? { indexed: 0, failed: 0, pending: 0, indexing: 0, cancelled: 0, total: 0 }
      );
      setDrift(kbData.drift);
      setBm25Status(kbData.bm25_status ?? null);
      setUpdateName(kbData.name);
      setUpdateDescription(kbData.description || "");
      const idxConfig = kbData.indexing_config as { strategy?: string; chunk_size?: number; overlap?: number; model?: string; summary_model?: string; embedding_model?: string; enrichment_model?: string; reasoning_effort?: string; enrichment_reasoning_effort?: string };
      const retConfig = kbData.retrieval_config as { method?: string; top_k?: number; retrieval_model?: string; retrieval_reasoning_effort?: string; context_mode?: string; vector_weight?: number; reranker?: { model?: string; candidate_count?: number }; query_enrichment?: { enabled?: boolean; model?: string; reasoning_effort?: string }; min_per_source?: number; max_per_source?: number };
      const strategy = idxConfig?.strategy ?? "chunk_embed";
      const stratDef = defaults.strategies[strategy];
      setUpdateIndexingStrategy(strategy);
      setUpdateChunkSize(String(typeof idxConfig?.chunk_size === "number" ? idxConfig.chunk_size : 2000));
      setUpdateOverlap(String(typeof idxConfig?.overlap === "number" ? idxConfig.overlap : 50));
      setUpdatePageIndexModel(typeof idxConfig?.model === "string" ? idxConfig.model : String(defaults.strategies.page_index.default_indexing_config.model ?? "gpt-5-mini"));
      setUpdateFullDocSummaryModel(typeof idxConfig?.summary_model === "string" ? idxConfig.summary_model : String(defaults.strategies.full_document.default_indexing_config.summary_model ?? "gpt-5-mini"));
      setUpdateGraphIndexModel(typeof idxConfig?.model === "string" && strategy === "graph_index" ? idxConfig.model : String(defaults.strategies.graph_index.default_indexing_config.model ?? "gpt-5-mini"));
      setUpdateGraphIndexEnrichmentModel(typeof idxConfig?.enrichment_model === "string" && strategy === "graph_index" ? idxConfig.enrichment_model : String(defaults.strategies.graph_index.default_indexing_config.enrichment_model ?? "gpt-5-mini"));
      setUpdateGraphIndexReasoningEffort(
        typeof idxConfig?.reasoning_effort === "string" && strategy === "graph_index"
          ? idxConfig.reasoning_effort
          : ""
      );
      setUpdateGraphIndexEnrichmentReasoningEffort(
        typeof idxConfig?.enrichment_reasoning_effort === "string" && strategy === "graph_index"
          ? idxConfig.enrichment_reasoning_effort
          : ""
      );
      // reasoning_effort is shared across single-model indexing strategies;
      // load it into the active strategy's field only.
      setUpdatePageIndexReasoningEffort(
        typeof idxConfig?.reasoning_effort === "string" && strategy === "page_index"
          ? idxConfig.reasoning_effort
          : ""
      );
      setUpdateFullDocSummaryReasoningEffort(
        typeof idxConfig?.reasoning_effort === "string" && strategy === "full_document"
          ? idxConfig.reasoning_effort
          : ""
      );
      setUpdateDoc2jsonExtractionReasoningEffort(
        typeof idxConfig?.reasoning_effort === "string" && strategy === "doc2json"
          ? idxConfig.reasoning_effort
          : ""
      );
      // Parse embedding_model for ALL strategies (not just graph_index)
      const embModel = typeof idxConfig?.embedding_model === "string"
        ? idxConfig.embedding_model
        : String(stratDef?.default_indexing_config.embedding_model ?? "text-embedding-3-small");
      setUpdateEmbeddingModel(embModel);
      originalEmbeddingModel.current = embModel;
      setUpdateRetrievalMethod(retConfig?.method ?? (strategy === "page_index" ? "tree_search" : "hybrid"));
      setUpdateTopK(String(typeof retConfig?.top_k === "number" ? retConfig.top_k : 5));
      setUpdateRetrievalModel(typeof retConfig?.retrieval_model === "string" ? retConfig.retrieval_model : String(defaults.strategies.page_index.default_retrieval_config.retrieval_model ?? "gpt-5-mini"));
      setUpdateRetrievalReasoningEffort(typeof retConfig?.retrieval_reasoning_effort === "string" ? retConfig.retrieval_reasoning_effort : "");
      setUpdateRerankerEnabled(!!retConfig?.reranker?.model);
      setUpdateRerankerModel(retConfig?.reranker?.model ?? defaults.reranker.default_model);
      setUpdateRerankerCandidateCount(String(retConfig?.reranker?.candidate_count ?? defaults.reranker.candidate_count));
      setUpdateMinPerSource(String(typeof retConfig?.min_per_source === "number" ? retConfig.min_per_source : 0));
      setUpdateMaxPerSource(String(typeof retConfig?.max_per_source === "number" ? retConfig.max_per_source : 0));
      setUpdateContextMode(retConfig?.context_mode ?? "text");
      setUpdateVectorWeight(retConfig?.vector_weight ?? defaults.hybrid_vector_weight);
      setUpdateQueryEnrichmentModel(retConfig?.query_enrichment?.model ?? defaults.query_enrichment.model);
      setUpdateQueryEnrichmentReasoningEffort(typeof retConfig?.query_enrichment?.reasoning_effort === "string" ? retConfig.query_enrichment.reasoning_effort : "");
      setUpdateQueryEnrichmentEnabled(!!retConfig?.query_enrichment?.enabled);
      setUpdateTsLanguage((retConfig as { ts_language?: string })?.ts_language ?? "english");
      // Doc2JSON config
      if (strategy === "doc2json") {
        const d2jConfig = idxConfig as { extraction_model?: string; window_size?: number; window_overlap?: number; use_images?: boolean; pages_per_window?: number; json_schema?: Record<string, unknown> };
        setUpdateDoc2jsonExtractionModel(d2jConfig.extraction_model ?? String(defaults.strategies.doc2json?.default_indexing_config?.extraction_model ?? "gpt-5-mini"));
        setUpdateDoc2jsonWindowSize(String(d2jConfig.window_size ?? defaults.strategies.doc2json?.default_indexing_config?.window_size ?? 4000));
        setUpdateDoc2jsonWindowOverlap(String(d2jConfig.window_overlap ?? defaults.strategies.doc2json?.default_indexing_config?.window_overlap ?? 200));
        setUpdateDoc2jsonUseImages(d2jConfig.use_images ?? Boolean(defaults.strategies.doc2json?.default_indexing_config?.use_images ?? false));
        setUpdateDoc2jsonPagesPerWindow(String(d2jConfig.pages_per_window ?? defaults.strategies.doc2json?.default_indexing_config?.pages_per_window ?? 3));
        if (d2jConfig.json_schema && typeof d2jConfig.json_schema === "object") {
          setUpdateDoc2jsonSchema(backendFormatToSchemaFields(d2jConfig.json_schema));
        }
      }

      // Fetch per-source enrichment error counts for graph_index KBs.
      // Fire-and-forget — this query scans the whole graph_index_nodes table
      // for the KB and can take tens of seconds on large KBs. Don't block
      // initial render; badges populate when the response arrives.
      if (strategy === "graph_index" && hasAiAuth(token)) {
        setGraphErrorCountsLoading(true);
        knowledgeBasesApi
          .getGraphEnrichmentErrors(token, ref!, kbId)
          .then((counts) => setGraphErrorCounts(counts))
          .catch(() => { /* supplementary — ignore errors */ })
          .finally(() => setGraphErrorCountsLoading(false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge base");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetches the page of sources NOT yet in this KB via the project-service
  // route wrapping ai.list_sources_excluding_kb server-side. Pushes the
  // dedup filter into Postgres so we don't ship the full ai.sources table
  // to the browser — critical for projects with tens of thousands of sources.
  const fetchSources = async (page: number, search: string) => {
    if (!isReady || !hasAiAuth(token) || !kbId) return;
    setIsLoadingAvailableSources(true);
    try {
      const res = await kbInspectorApi.listAvailableSources(token, ref as string, kbId, {
        q: search || undefined,
        limit: ADD_SOURCES_PER_PAGE,
        offset: (page - 1) * ADD_SOURCES_PER_PAGE,
      });
      setSources(res.sources as unknown as Source[]);
      setAddSourceTotalCount(res.total);
    } catch {
      setSources([]);
      setAddSourceTotalCount(0);
    } finally {
      setIsLoadingAvailableSources(false);
    }
  };

  useEffect(() => {
    fetchKb();
  }, [isReady, token, kbId]);

  // Debounce the modal's search input — keeps typing snappy and only
  // hits the RPC after a 300ms pause. Mirrors the search debounce used
  // elsewhere on this page.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAddSourceSearch(sourceSearchText.trim()), 300);
    return () => clearTimeout(t);
  }, [sourceSearchText]);

  // Reset page to 1 whenever the search text changes (so the user always
  // lands on the first page of new results).
  useEffect(() => {
    if (showAddSource) setAddSourcePage(1);
  }, [debouncedAddSourceSearch, showAddSource]);

  // Fetch the current page of available sources whenever the modal is
  // open and any of (kbId, page, debounced search) changes.
  useEffect(() => {
    if (showAddSource) fetchSources(addSourcePage, debouncedAddSourceSearch);
  }, [showAddSource, isReady, token, kbId, addSourcePage, debouncedAddSourceSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryClient = useQueryClient();

  const sourcesQuery = useInfiniteQuery({
    queryKey: ['kb-sources', ref, kbId, debouncedSearch, statusFilter, sortMode.sort ?? 'default', sortMode.order ?? 'desc'],
    queryFn: async ({ pageParam }) => {
      if (!hasAiAuth(token)) throw new Error('not ready');
      return knowledgeBasesApi.listIndexedSources(token, ref as string, kbId, {
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
        sort: sortMode.sort,
        order: sortMode.order,
        limit: 50,
        offset: pageParam as number,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
    enabled: Boolean(isReady && hasAiAuth(token) && kbId),
    placeholderData: keepPreviousData,
  });

  const visibleSources = useMemo(
    () => sourcesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [sourcesQuery.data]
  );
  const totalFiltered = sourcesQuery.data?.pages[0]?.total ?? 0;

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleSources.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 80,
    overscan: 8,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  const fetchChunks = useCallback(
    async (indexedSourceId: string, page: number) => {
      if (!isReady || !hasAiAuth(token)) return;
      setChunksLoading(true);
      try {
        const from = (page - 1) * CHUNKS_PER_PAGE;
        const res = await kbInspectorApi.listChunks(token, ref as string, kbId, indexedSourceId, {
          limit: CHUNKS_PER_PAGE,
          offset: from,
        });
        setChunksData({ ...res, page });
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch chunks:", err);
        setChunksData(null);
      } finally {
        setChunksLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchAllNodes = useCallback(
    async (indexedSourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      setNodesLoading(true);
      setSelectedNodeId(null);
      try {
        const res = await kbInspectorApi.listPageIndexNodes(token, ref as string, kbId, indexedSourceId);
        setAllNodes(res.nodes);
        const map = new Map<string, PageIndexNodeItem>();
        for (const n of res.nodes) map.set(n.node_id, n);
        setNodesMap(map);
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch nodes:", err);
        setAllNodes(null);
        setNodesMap(new Map());
      } finally {
        setNodesLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchToc = useCallback(
    async (indexedSourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      setTocLoading(true);
      try {
        const res = await kbInspectorApi.getPageIndexToc(token, ref as string, kbId, indexedSourceId);
        setTocData(res.toc);
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch ToC:", err);
        setTocData(null);
      } finally {
        setTocLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchGraphAllNodes = useCallback(
    async (indexedSourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      setNodesLoading(true);
      setSelectedNodeId(null);
      try {
        const res = await kbInspectorApi.listGraphIndexNodes(token, ref as string, kbId, indexedSourceId);
        setAllNodes(res.nodes);
        const map = new Map<string, PageIndexNodeItem>();
        for (const n of res.nodes) map.set(n.node_id, n);
        setNodesMap(map);
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch graph nodes:", err);
        setAllNodes(null);
        setNodesMap(new Map());
      } finally {
        setNodesLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchGraphToc = useCallback(
    async (indexedSourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      setTocLoading(true);
      try {
        const res = await kbInspectorApi.getGraphIndexToc(token, ref as string, kbId, indexedSourceId);
        setTocData(res.toc);
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch graph ToC:", err);
        setTocData(null);
      } finally {
        setTocLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchFullDocument = useCallback(
    async (indexedSourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      setFullDocLoading(true);
      try {
        const res = await kbInspectorApi.getFullDocument(token, ref as string, kbId, indexedSourceId);
        setFullDocData(res.document);
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch full document:", err);
        setFullDocData(null);
      } finally {
        setFullDocLoading(false);
      }
    },
    [isReady, token, ref, kbId]
  );

  const fetchDoc2JSONDocument = useCallback(
    async (indexedSourceId: string, sourceId: string) => {
      if (!isReady || !hasAiAuth(token)) return;
      const myFetchId = ++doc2jsonFetchId.current;

      setDoc2jsonLoading(true);
      setPageImages({});
      setSourceTextContent(null);
      setPageImagesLoading(false);
      try {
        const res = await kbInspectorApi.getDoc2jsonDocument(token, ref as string, kbId, indexedSourceId);
        if (myFetchId !== doc2jsonFetchId.current) return; // stale - abort
        const data = res.document;
        setDoc2jsonData(data);

        // Fetch page images from source derivatives (returned alongside the
        // doc2json document in the same round trip — no second lookup needed)
        if (data) {
          const derivatives = res.source_derivatives && typeof res.source_derivatives === "object"
            ? res.source_derivatives
            : null;

          // Determine content mode from KB config (NOT from derivative existence)
          const useImages = (kb?.indexing_config as { use_images?: boolean })?.use_images ?? false;

          if (useImages) {
            // IMAGE MODE: fetch and display page images
            const imageDerivs = derivatives?.image;
            if (Array.isArray(imageDerivs) && imageDerivs.length > 0) {
              setPageImagesLoading(true);
              const images: Record<number, string> = {};
              for (let i = 0; i < imageDerivs.length; i++) {
                if (myFetchId !== doc2jsonFetchId.current) {
                  Object.values(images).forEach((url) => URL.revokeObjectURL(url));
                  return;
                }
                const url = await sourcesApi.getSourcePageImage(token, ref!, sourceId, i);
                if (url) images[i] = url;
              }
              if (myFetchId !== doc2jsonFetchId.current) {
                Object.values(images).forEach((url) => URL.revokeObjectURL(url));
                return;
              }
              setPageImages(images);
              setPageImagesLoading(false);
            }
          } else {
            // TEXT MODE: fetch original document text
            const textContent = await sourcesApi.getSourceTextContent(token, ref!, sourceId);
            if (myFetchId !== doc2jsonFetchId.current) return;
            setSourceTextContent(textContent);
          }
        }
      } catch (err) {
        console.warn("[KB Inspector] Failed to fetch doc2json document:", err);
        if (myFetchId === doc2jsonFetchId.current) {
          setDoc2jsonData(null);
        }
      } finally {
        if (myFetchId === doc2jsonFetchId.current) {
          setDoc2jsonLoading(false);
        }
      }
    },
    [isReady, token, ref!, kbId, kb]
  );

  const fetchEnrichmentResults = useCallback(
    async (itemIds: string[]) => {
      if (!isReady || !hasAiAuth(token) || !enrichmentConfig?.status || itemIds.length === 0) return;
      if (!["completed", "completed_with_errors"].includes(enrichmentConfig.status)) return;
      const myFetchId = ++enrichmentFetchId.current;
      try {
        const res = await knowledgeBasesApi.getEnrichmentResults(token, ref!, kbId, itemIds);
        if (myFetchId !== enrichmentFetchId.current) return; // stale — discard
        setEnrichmentResults(res.results as any);
        if (res.fields) setEnrichmentFieldDefs(res.fields as any);
        setEnrichmentItemErrors((res.item_errors ?? {}) as any);
      } catch {
        // ignore — enrichment results are supplementary
      }
    },
    [isReady, token, ref!, kbId, enrichmentConfig?.status]
  );

  // Cleanup when dialog closes
  useEffect(() => {
    if (!inspectSource) {
      setChunksData(null);
      setAllNodes(null);
      setNodesMap(new Map());
      setSelectedNodeId(null);
      setTocData(null);
      setTocLoading(false);
      setFullDocData(null);
      setDoc2jsonData(null);
      // Revoke blob URLs to prevent memory leaks
      Object.values(pageImages).forEach((url) => URL.revokeObjectURL(url));
      setPageImages({});
      setPageImagesLoading(false);
      setSourceTextContent(null);
      setChunksPage(1);
      setEnrichmentResults({});
      setEnrichmentFieldDefs([]);
      setEnrichmentItemErrors({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectSource]);

  // Fetch ToC + all nodes (both per-source one-time fetches)
  useEffect(() => {
    if (inspectSource && currentStrategy === "page_index") {
      fetchToc(inspectSource.id);
      fetchAllNodes(inspectSource.id);
    }
  }, [inspectSource, currentStrategy, fetchToc, fetchAllNodes]);

  // Fetch graph_index ToC + nodes
  useEffect(() => {
    if (inspectSource && currentStrategy === "graph_index") {
      fetchGraphToc(inspectSource.id);
      fetchGraphAllNodes(inspectSource.id);
    }
  }, [inspectSource, currentStrategy, fetchGraphToc, fetchGraphAllNodes]);

  // Auto-select first node from the ToC structure tree
  useEffect(() => {
    if (allNodes && tocData?.structure?.length && !selectedNodeId) {
      const firstNodeId = tocData.structure[0]?.node_id;
      if (firstNodeId) setSelectedNodeId(firstNodeId);
    }
  }, [allNodes, tocData, selectedNodeId]);

  // Fetch full document (not paginated)
  useEffect(() => {
    if (inspectSource && currentStrategy === "full_document") {
      fetchFullDocument(inspectSource.id);
    }
  }, [inspectSource, currentStrategy, fetchFullDocument]);

  // Fetch doc2json document (not paginated)
  useEffect(() => {
    if (inspectSource && currentStrategy === "doc2json") {
      fetchDoc2JSONDocument(inspectSource.id, inspectSource.source_id);
    }
  }, [inspectSource, currentStrategy, fetchDoc2JSONDocument]);

  // Paginated fetches — re-fire when page changes (only chunk_embed is paginated now)
  useEffect(() => {
    if (!inspectSource) return;
    if (currentStrategy === "chunk_embed") {
      fetchChunks(inspectSource.id, chunksPage);
    }
  }, [inspectSource, currentStrategy, chunksPage, fetchChunks]);

  // Fetch enrichment results when chunk/node/doc data loads
  useEffect(() => {
    if (chunksData?.chunks?.length) {
      fetchEnrichmentResults(chunksData.chunks.map((c) => c.id));
    }
  }, [chunksData, fetchEnrichmentResults]);

  useEffect(() => {
    if (allNodes?.length) {
      fetchEnrichmentResults(allNodes.map((n) => n.id).filter((id): id is string => !!id));
    }
  }, [allNodes, fetchEnrichmentResults]);

  useEffect(() => {
    if (fullDocData) {
      fetchEnrichmentResults([fullDocData.id]);
    }
  }, [fullDocData, fetchEnrichmentResults]);

  // Server-side dedup + search + pagination via the
  // ai.list_sources_excluding_kb RPC (migration 0023). `sources` is
  // already the current page of sources NOT in this KB, matching the
  // active search. No further client-side filtering is needed.
  const pagedSources = sources;
  const totalAddPages = Math.max(1, Math.ceil(addSourceTotalCount / ADD_SOURCES_PER_PAGE));
  const hasAnyEligibleSource = addSourceTotalCount > 0 || debouncedAddSourceSearch !== "";

  const toggleSource = (id: string) => {
    setSelectedSourceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    const pageIds = pagedSources.map(s => s.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedSourceIds.has(id));
    setSelectedSourceIds(prev => {
      const next = new Set(prev);
      pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const handleAddSources = async () => {
    const ids = Array.from(selectedSourceIds);
    if (!ids.length || !isReady || !hasAiAuth(token)) return;
    setIsAddingSource(true);
    setError(null);
    try {
      setAddingProgress({ current: 0, total: ids.length });
      let completed = 0;
      const results = await Promise.allSettled(
        ids.map((id) =>
          knowledgeBasesApi.addSource(token, ref!, kbId, id)
            .finally(() => {
              completed += 1;
              setAddingProgress({ current: completed, total: ids.length });
            })
        )
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        setError(`Failed to add ${failures.length} of ${ids.length} source(s)`);
      }
      setSelectedSourceIds(new Set());
      setSourceSearchText("");
      setAddSourcePage(1);
      setShowAddSource(false);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add sources");
    } finally {
      setIsAddingSource(false);
      setAddingProgress(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || !hasAiAuth(token) || !searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults(null);
    try {
      const res = await knowledgeBasesApi.search(token, ref!, kbId, { query: searchQuery.trim() });
      setSearchResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || !hasAiAuth(token) || !kb) return;

    // Validate numeric fields (using same Number()-based logic as inline warnings)
    if (
      (updateIndexingStrategy === "chunk_embed" && !isValidInt(updateChunkSize, 1)) ||
      (updateIndexingStrategy === "chunk_embed" && !isValidInt(updateOverlap, 0)) ||
      (updateIndexingStrategy === "doc2json" && !updateDoc2jsonUseImages && !isValidInt(updateDoc2jsonWindowSize, 500)) ||
      (updateIndexingStrategy === "doc2json" && !updateDoc2jsonUseImages && !isValidInt(updateDoc2jsonWindowOverlap, 0)) ||
      (updateIndexingStrategy === "doc2json" && updateDoc2jsonUseImages && (!isValidInt(updateDoc2jsonPagesPerWindow, 1) || Number(updateDoc2jsonPagesPerWindow) > 10)) ||
      !isValidInt(updateTopK, 1) ||
      (updateRerankerEnabled && !isValidInt(updateRerankerCandidateCount, 1)) ||
      !isValidInt(updateMinPerSource, 0) ||
      !isValidInt(updateMaxPerSource, 0) ||
      (Number(updateMaxPerSource) > 0 &&
        Number(updateMinPerSource) > Number(updateMaxPerSource))
    ) {
      setError("Please correct invalid fields before saving");
      return;
    }
    if (updateIndexingStrategy === "doc2json" && updateDoc2jsonSchema.length === 0) {
      setError("Doc2JSON strategy requires at least one schema field");
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      const indexing_config =
        updateIndexingStrategy === "page_index"
          ? {
              strategy: "page_index",
              model: updatePageIndexModel,
              if_add_node_summary: "yes",
              if_add_node_text: "yes",
              ...(updatePageIndexReasoningEffort
                ? { reasoning_effort: updatePageIndexReasoningEffort }
                : {}),
            }
          : updateIndexingStrategy === "full_document"
            ? {
                strategy: "full_document",
                summary_model: updateFullDocSummaryModel,
                embedding_model: updateEmbeddingModel,
                ...(updateFullDocSummaryReasoningEffort
                  ? { reasoning_effort: updateFullDocSummaryReasoningEffort }
                  : {}),
              }
            : updateIndexingStrategy === "graph_index"
              ? (() => {
                  const cfg: Record<string, unknown> = {
                    strategy: "graph_index",
                    model: updateGraphIndexModel,
                    enrichment_model: updateGraphIndexEnrichmentModel,
                    embedding_model: updateEmbeddingModel,
                    if_add_node_summary: "yes",
                    if_add_node_text: "yes",
                  };
                  if (updateGraphIndexReasoningEffort) {
                    cfg.reasoning_effort = updateGraphIndexReasoningEffort;
                  }
                  if (updateGraphIndexEnrichmentReasoningEffort) {
                    cfg.enrichment_reasoning_effort = updateGraphIndexEnrichmentReasoningEffort;
                  }
                  return cfg;
                })()
              : updateIndexingStrategy === "doc2json"
                ? {
                    strategy: "doc2json",
                    extraction_model: updateDoc2jsonExtractionModel,
                    embedding_model: updateEmbeddingModel,
                    use_images: updateDoc2jsonUseImages,
                    ...(updateDoc2jsonExtractionReasoningEffort
                      ? { reasoning_effort: updateDoc2jsonExtractionReasoningEffort }
                      : {}),
                    ...(updateDoc2jsonUseImages
                      ? { pages_per_window: Number(updateDoc2jsonPagesPerWindow) }
                      : { window_size: Number(updateDoc2jsonWindowSize), window_overlap: Number(updateDoc2jsonWindowOverlap) }),
                    json_schema: schemaFieldsToBackendFormat(updateDoc2jsonSchema),
                  }
                : { strategy: "chunk_embed", chunk_size: Number(updateChunkSize), overlap: Number(updateOverlap), embedding_model: updateEmbeddingModel };

      const perSourceLimits = {
        ...(Number(updateMinPerSource) > 0 && { min_per_source: Number(updateMinPerSource) }),
        ...(Number(updateMaxPerSource) > 0 && { max_per_source: Number(updateMaxPerSource) }),
      };

      const retrieval_config =
        updateRetrievalMethod === "tree_search"
          ? {
              method: "tree_search",
              top_k: Number(updateTopK),
              retrieval_model: updateRetrievalModel,
              context_mode: updateContextMode,
              ...(updateRetrievalReasoningEffort
                ? { retrieval_reasoning_effort: updateRetrievalReasoningEffort }
                : {}),
              ...perSourceLimits,
            }
          : {
              method: updateRetrievalMethod,
              top_k: Number(updateTopK),
              context_mode: updateContextMode,
              ...perSourceLimits,
              ...(updateRetrievalMethod === "hybrid" && { vector_weight: updateVectorWeight }),
              ...(updateRerankerEnabled && {
                reranker: {
                  model: updateRerankerModel,
                  candidate_count: Number(updateRerankerCandidateCount),
                },
              }),
              ...((updateRetrievalMethod === "hybrid" || updateRetrievalMethod === "full_text") && {
                ts_language: updateTsLanguage,
              }),
              query_enrichment: updateQueryEnrichmentEnabled
                ? {
                    enabled: true,
                    model: updateQueryEnrichmentModel,
                    ...(updateQueryEnrichmentReasoningEffort
                      ? { reasoning_effort: updateQueryEnrichmentReasoningEffort }
                      : {}),
                  }
                : { enabled: false },
            };

      await knowledgeBasesApi.update(token, ref!, kbId, {
        name: updateName.trim(),
        description: updateDescription.trim() || undefined,
        indexing_config,
        retrieval_config,
      });
      setShowUpdateModal(false);
      await fetchKb();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReindex = async () => {
    if (!isReady || !hasAiAuth(token) || !confirm("Re-index all sources in this knowledge base? This may take a while.")) return;
    setIsReindexing(true);
    setError(null);
    try {
      await knowledgeBasesApi.reindex(token, ref!, kbId);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setIsReindexing(false);
    }
  };

  const handleBuildBm25 = async () => {
    if (!hasAiAuth(token) || !ref) return;
    try {
      await knowledgeBasesApi.buildBm25(token, ref as string, kbId);
      // Re-fetch KB to reflect updated bm25_status from the backend
      await fetchKb();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build BM25 index");
    }
  };

  /** Retry a single failed indexed_source. Used by the per-row Retry button
   *  and the modal's Retry button. */
  const handleRetryIndexedSource = async (
    indexedSource: IndexedSource & { source_name?: string },
  ) => {
    if (!isReady || !hasAiAuth(token)) return;
    setRetryingIndexedSourceIds((prev) => {
      const next = new Set(prev);
      next.add(indexedSource.id);
      return next;
    });
    setError(null);
    try {
      await knowledgeBasesApi.reindex(token, ref!, kbId, {
        indexedSourceIds: [indexedSource.id],
      });
      // Optimistic close — the modal showed the prior failure; once we've
      // queued the retry, the row will move back to "pending" on refetch.
      setInspectFailureFor(null);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingIndexedSourceIds((prev) => {
        const next = new Set(prev);
        next.delete(indexedSource.id);
        return next;
      });
    }
  };

  /** Retry every indexed_source currently in 'failed' status for this KB. */
  const handleRetryAllFailed = async () => {
    if (!isReady || !hasAiAuth(token)) return;
    const failedCount = sourceCounts.failed;
    if (failedCount === 0) return;
    if (
      !confirm(
        `Retry indexing for ${failedCount} failed source${failedCount !== 1 ? "s" : ""}?`,
      )
    )
      return;
    setIsRetryingAllFailed(true);
    setError(null);
    try {
      await knowledgeBasesApi.reindex(token, ref!, kbId, { failedOnly: true });
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry-all failed");
    } finally {
      setIsRetryingAllFailed(false);
    }
  };

  const handleReenrichSource = async (indexedSourceId: string, retryFailed: boolean) => {
    if (!isReady || !hasAiAuth(token)) return;
    setReenrichingSource({ id: indexedSourceId, action: retryFailed ? "retry" : "reenrich" });
    try {
      await knowledgeBasesApi.reenrichGraphReferences(token, ref!, kbId, retryFailed, indexedSourceId);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-enrichment failed");
    } finally {
      setReenrichingSource(null);
    }
  };

  const handleReenrichAll = async () => {
    if (!isReady || !hasAiAuth(token) || !confirm("Re-enrich all references in this knowledge base? This may take a while.")) return;
    setIsReenrichingAll(true);
    setError(null);
    try {
      await knowledgeBasesApi.reenrichGraphReferences(token, ref!, kbId, false);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-enrichment failed");
    } finally {
      setIsReenrichingAll(false);
    }
  };

  const handleCancelIndexing = async (indexedSource: IndexedSource & { source_name?: string }) => {
    if (!isReady || !hasAiAuth(token)) return;
    setCancellingIndexId(indexedSource.id);
    setError(null);
    try {
      await knowledgeBasesApi.cancelIndexing(token, ref!, kbId, indexedSource.id);
    } catch (err) {
      console.error("Cancel indexing failed:", err);
      setError(err instanceof Error ? err.message : "Cancel indexing failed");
    } finally {
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
      setCancellingIndexId(null);
    }
  };

  const handleRemoveSource = async (indexedSource: IndexedSource & { source_name?: string }) => {
    if (
      !isReady ||
      !hasAiAuth(token) ||
      !confirm(
        `Remove "${indexedSource.source_name || indexedSource.source_id}" from this knowledge base? All indexed chunks will be deleted.`
      )
    )
      return;
    setRemovingSourceId(indexedSource.id);
    setError(null);
    try {
      await knowledgeBasesApi.removeSource(token, ref!, kbId, indexedSource.id);
      await fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove source");
    } finally {
      setRemovingSourceId(null);
    }
  };

  // === Enrichment config fetch & polling ===
  const fetchEnrichmentConfig = useCallback(async () => {
    if (!isReady || !hasAiAuth(token)) return;
    try {
      const res = await knowledgeBasesApi.getEnrichmentConfig(token, ref!, kbId);
      setEnrichmentConfig(res.config);
    } catch {
      // Silently ignore — preserves last-known config during transient failures
      // so polling doesn't break. Initial state is null, which is correct for "no config".
    }
  }, [isReady, token, ref!, kbId]);

  useEffect(() => {
    if (isReady && hasAiAuth(token)) fetchEnrichmentConfig();
  }, [isReady, token, fetchEnrichmentConfig]);

  // Poll while enriching
  useEffect(() => {
    if (enrichmentConfig?.status !== "enriching") return;
    const interval = setInterval(fetchEnrichmentConfig, 3000);
    return () => clearInterval(interval);
  }, [enrichmentConfig?.status, fetchEnrichmentConfig]);

  const openEnrichmentModal = () => {
    if (enrichmentConfig) {
      setEnrichmentFields(enrichmentConfig.fields.map(f => ({ ...f })));
      setEnrichmentModel(enrichmentConfig.llm_model);
      setEnrichmentMaxTokens(String(enrichmentConfig.max_tokens ?? defaults.enrichment.max_tokens));
      setEnrichmentUseMultimodal(enrichmentConfig.use_multimodal ?? false);
    } else {
      setEnrichmentFields([]);
      setEnrichmentModel(defaults.enrichment.model);
      setEnrichmentMaxTokens(String(defaults.enrichment.max_tokens));
      setEnrichmentUseMultimodal(false);
    }
    setEnrichmentError(null);
    setShowEnrichmentModal(true);
  };

  const validateEnrichmentFields = (): string | null => {
    if (enrichmentFields.length === 0) return "At least one field is required.";
    if (!enrichmentModel.trim()) return "LLM model is required.";
    const names = new Set<string>();
    for (let i = 0; i < enrichmentFields.length; i++) {
      const f = enrichmentFields[i];
      if (!f.name.trim()) return `Field ${i + 1}: name is required.`;
      if (!FIELD_NAME_REGEX.test(f.name)) return `Field "${f.name}": name must start with a letter and contain only letters, digits, underscores.`;
      if (RESERVED_FIELD_NAMES.has(f.name.toLowerCase())) return `Field "${f.name}": name is reserved.`;
      if (names.has(f.name.toLowerCase())) return `Duplicate field name "${f.name}".`;
      names.add(f.name.toLowerCase());
      if (!["text", "boolean", "number", "enum"].includes(f.type)) return `Field "${f.name}": invalid type.`;
      if (!f.description.trim()) return `Field "${f.name}": description is required.`;
      if (f.type === "enum") {
        const vals = (f.enum_values ?? []).filter(v => v.trim());
        if (vals.length < 2) return `Field "${f.name}": enum type requires at least 2 values.`;
      }
    }
    return null;
  };

  const handleSaveEnrichment = async () => {
    const validationError = validateEnrichmentFields();
    if (validationError) {
      setEnrichmentError(validationError);
      return;
    }
    // Validate enrichment max tokens (use Number() to match inline validation)
    const parsedMaxTokens = Number(enrichmentMaxTokens);
    if (!Number.isInteger(parsedMaxTokens) || parsedMaxTokens < 100 || parsedMaxTokens > 16000) {
      setEnrichmentError("Max output tokens must be an integer between 100 and 16000");
      return;
    }
    // Only warn if something that triggers re-enrichment actually changed
    const fieldsChanged = enrichmentConfig && (JSON.stringify(
      enrichmentFields.map(({ _enumRaw, ...f }) => ({
        ...f,
        enum_values: f.type === "enum" ? (f.enum_values ?? []).filter(v => v.trim()) : undefined,
      }))
    ) !== JSON.stringify(enrichmentConfig.fields));
    const modelChanged = enrichmentConfig && (enrichmentModel.trim() !== (enrichmentConfig.llm_model || ""));
    const multimodalChanged = enrichmentConfig && (enrichmentUseMultimodal !== (enrichmentConfig.use_multimodal ?? false));

    if (enrichmentConfig && (fieldsChanged || modelChanged || multimodalChanged) && !confirm(
      "Saving changes will re-run metadata enrichment for the entire knowledge base. This may take a while. Continue?"
    )) return;
    setIsSavingEnrichment(true);
    setEnrichmentError(null);
    try {
      const fields = enrichmentFields.map(({ _enumRaw, ...f }) => ({
        ...f,
        enum_values: f.type === "enum" ? (f.enum_values ?? []).filter(v => v.trim()) : undefined,
      }));
      const result = await knowledgeBasesApi.saveEnrichmentConfig(token!, ref!, kbId, {
        fields,
        llm_model: enrichmentModel.trim(),
        max_tokens: parsedMaxTokens,
        use_multimodal: enrichmentUseMultimodal,
      });
      // Use response config directly; if enrichment was triggered,
      // optimistically set status to 'enriching' so polling kicks in
      if (result.re_enrichment_triggered) {
        setEnrichmentConfig({ ...result.config, status: "enriching" });
      } else {
        setEnrichmentConfig(result.config);
      }
      setShowEnrichmentModal(false);
    } catch (err) {
      setEnrichmentError(err instanceof Error ? err.message : "Failed to save enrichment config");
    } finally {
      setIsSavingEnrichment(false);
    }
  };

  const handleRunEnrichment = async () => {
    setIsRunningEnrichment(true);
    setEnrichmentError(null);
    try {
      await knowledgeBasesApi.runEnrichment(token!, ref!, kbId, false);
      await fetchEnrichmentConfig();
    } catch (err) {
      setEnrichmentError(err instanceof Error ? err.message : "Failed to run enrichment");
    } finally {
      setIsRunningEnrichment(false);
    }
  };

  const handleRetryFailedEnrichment = async () => {
    setIsRunningEnrichment(true);
    setEnrichmentError(null);
    try {
      await knowledgeBasesApi.runEnrichment(token!, ref!, kbId, false, true);
      await fetchEnrichmentConfig();
    } catch (err) {
      setEnrichmentError(err instanceof Error ? err.message : "Failed to retry failed items");
    } finally {
      setIsRunningEnrichment(false);
    }
  };

  const handleDeleteEnrichment = async () => {
    if (!confirm("Delete enrichment configuration? All enriched metadata will be removed.")) return;
    setIsDeletingEnrichment(true);
    setEnrichmentError(null);
    try {
      await knowledgeBasesApi.deleteEnrichmentConfig(token!, ref!, kbId);
      setEnrichmentConfig(null);
      setShowEnrichmentModal(false);
    } catch (err) {
      setEnrichmentError(err instanceof Error ? err.message : "Failed to delete enrichment config");
    } finally {
      setIsDeletingEnrichment(false);
    }
  };

  const needsReindex = drift === 'full';
  const needsReenrich = drift === 'enrichment_only';

  const isAnyIndexing = sourceCounts.pending + sourceCounts.indexing > 0;

  // Poll while any source is pending/indexing
  useEffect(() => {
    if (!isAnyIndexing) return;
    const interval = setInterval(() => {
      fetchKb();
      queryClient.invalidateQueries({ queryKey: ['kb-sources', ref, kbId] });
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyIndexing, ref, kbId, queryClient]);

  const indexingStatusLabel = (() => {
    if (isReindexing) return "Reindexing\u2026";
    if (sourceCounts.total === 0) return "No sources indexed";
    const parts: string[] = [];
    if (sourceCounts.indexed) parts.push(`${sourceCounts.indexed} indexed`);
    if (sourceCounts.indexing) parts.push(`${sourceCounts.indexing} indexing`);
    if (sourceCounts.pending) parts.push(`${sourceCounts.pending} pending`);
    if (sourceCounts.failed) parts.push(`${sourceCounts.failed} failed`);
    const summary = parts.join(", ");
    if (needsReindex) return `${summary} (config changed \u2014 reindex needed)`;
    if (needsReenrich) return `${summary} (enrichment model changed \u2014 re-enrichment needed)`;
    return summary;
  })();

  const enrichmentStatusLabel = (() => {
    if (!enrichmentConfig) return "Not configured";
    const count = enrichmentConfig.total_count > 0
      ? ` \u2014 ${enrichmentConfig.enriched_count}/${enrichmentConfig.total_count} items`
      : "";
    switch (enrichmentConfig.status) {
      case "enriching": return `In progress${count}`;
      case "completed": return `Completed${count}`;
      case "completed_with_errors": {
        const failedCount = enrichmentConfig.total_count - enrichmentConfig.enriched_count;
        return `Completed with errors (${failedCount} failed)${enrichmentConfig.error_message ? ` \u2014 ${enrichmentConfig.error_message}` : ""}`;
      }
      case "failed": return `Failed${enrichmentConfig.error_message ? ` \u2014 ${enrichmentConfig.error_message}` : ""}`;
      default: return "Idle";
    }
  })();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !kb) {
    return (
      <div className="p-8">
        <div className="text-red-300">{error}</div>
        <Link href={`/project/${ref}/knowledge-bases`} className="mt-4 inline-block text-emerald-300">
          ← Back to knowledge bases
        </Link>
      </div>
    );
  }

  if (!kb) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="p-8">
        <div className="max-w-5xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/project/${ref}/knowledge-bases`} className="text-foreground-muted hover:text-foreground">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">{kb.name}</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/25 border border-red-300/60 rounded-lg text-red-50">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        <div className="bg-default border border-default rounded-xl p-6 mb-6">
          <h2 className="font-medium text-foreground mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-foreground-muted">ID</dt>
              <dd className="text-sm text-foreground-light font-mono truncate">{kb.id}</dd>
            </div>
            <div>
              <dt className="text-sm text-foreground-muted">Description</dt>
              <dd className="text-sm text-foreground-light">{kb.description || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-foreground-muted">Indexing Strategy</dt>
              <dd className="text-sm text-foreground-light">
                {defaults.strategies[currentStrategy]?.label ?? currentStrategy}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-foreground-muted">Retrieval Method</dt>
              <dd className="text-sm text-foreground-light">{(kb.retrieval_config as { method?: string })?.method ?? "\u2014"}</dd>
            </div>
            {currentStrategy === "page_index" && (
              <div>
                <dt className="text-sm text-foreground-muted">Tree-building Model</dt>
                <dd className="text-sm text-foreground-light">{(kb.indexing_config as { model?: string })?.model ?? "\u2014"}</dd>
              </div>
            )}
            {currentStrategy === "graph_index" && (
              <>
                <div>
                  <dt className="text-sm text-foreground-muted">Tree-building Model</dt>
                  <dd className="text-sm text-foreground-light">{(kb.indexing_config as { model?: string })?.model ?? "\u2014"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-foreground-muted">Enrichment Model</dt>
                  <dd className="text-sm text-foreground-light">{(kb.indexing_config as { enrichment_model?: string })?.enrichment_model ?? "\u2014"}</dd>
                </div>
              </>
            )}
            {currentStrategy !== "page_index" && (
              <div>
                <dt className="text-sm text-foreground-muted">Embedding Model</dt>
                <dd className="text-sm text-foreground-light">{(kb.indexing_config as { embedding_model?: string })?.embedding_model ?? "\u2014"}</dd>
              </div>
            )}
            {currentStrategy === "chunk_embed" && (
              <>
                <div>
                  <dt className="text-sm text-foreground-muted">Chunk Size / Overlap (tokens)</dt>
                  <dd className="text-sm text-foreground-light">
                    {(kb.indexing_config as { chunk_size?: number })?.chunk_size ?? 2000} / {(kb.indexing_config as { overlap?: number })?.overlap ?? 50}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-sm text-foreground-muted">Context Mode</dt>
              <dd className="text-sm text-foreground-light">
                {(kb.retrieval_config as { context_mode?: string })?.context_mode === "image"
                  ? "Image (retrieve original pages)"
                  : "Text"}
              </dd>
            </div>
            {(kb.retrieval_config as { query_enrichment?: { enabled?: boolean } })?.query_enrichment?.enabled && (
              <div>
                <dt className="text-sm text-foreground-muted">Query Enrichment Model</dt>
                <dd className="text-sm text-foreground-light">
                  {(kb.retrieval_config as { query_enrichment?: { model?: string } })?.query_enrichment?.model ?? defaults.query_enrichment.model}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-default border border-default rounded-xl p-6 mb-6">
          <h2 className="font-medium text-foreground mb-4">Status</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-foreground-muted">Indexing</dt>
              <dd className="text-sm text-foreground-light">{indexingStatusLabel}</dd>
            </div>
            <div>
              <dt className="text-sm text-foreground-muted">Metadata Enrichment</dt>
              <dd className="text-sm text-foreground-light">{enrichmentStatusLabel}</dd>
            </div>
          </dl>
        </div>

        {needsReindex && (
          <div className="mb-6 p-4 bg-amber-500/25 border border-amber-300/60 rounded-lg text-amber-50 text-sm">
            Some sources were indexed with a different config. Re-index to apply the current indexing config.
          </div>
        )}
        {needsReenrich && (
          <div className="mb-6 p-4 bg-amber-500/25 border border-amber-300/60 rounded-lg text-amber-50 text-sm">
            Enrichment model was updated. Re-enrich references to apply the new model (no full reindex needed).
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            type="button"
            onClick={() => setShowAddSource(true)}
            className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
          >
            Add source
          </button>
          <button
            onClick={() => setShowUpdateModal(true)}
            className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-foreground text-sm font-medium rounded-lg transition border border-default"
          >
            Update knowledge base
          </button>
          <button
            onClick={openEnrichmentModal}
            className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-foreground text-sm font-medium rounded-lg transition border border-default"
          >
            Metadata enrichment
            {enrichmentConfig?.status === "enriching" && " \u27F3"}
            {enrichmentConfig?.status === "completed" && " \u2713"}
            {enrichmentConfig?.status === "completed_with_errors" && " \u26A0"}
            {enrichmentConfig?.status === "failed" && " \u2717"}
          </button>
          {(needsReindex || isReindexing) && (
            <button
              onClick={handleReindex}
              disabled={isReindexing || isAnyIndexing || sourceCounts.total === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg transition border disabled:opacity-50 bg-amber-600 hover:bg-amber-500 text-foreground border-amber-500/30"
            >
              {isReindexing ? "Reindexing..." : "Re-index all"}
            </button>
          )}
          {(needsReenrich || isReenrichingAll) && (
            <button
              onClick={handleReenrichAll}
              disabled={isReenrichingAll || isAnyIndexing || sourceCounts.total === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg transition border disabled:opacity-50 bg-amber-600 hover:bg-amber-500 text-foreground border-amber-500/30"
            >
              {isReenrichingAll ? "Re-enriching..." : "Re-enrich all"}
            </button>
          )}
        </div>

        {bm25Status && (
          <BM25IndexCard status={bm25Status} onBuild={handleBuildBm25} />
        )}

        {/* Indexed Sources */}
        <div className="bg-default border border-default rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-foreground flex items-center gap-2">
              <span>Indexed Sources ({sourceCounts.total})</span>
              {currentStrategy === "graph_index" && graphErrorCountsLoading && (
                <span className="text-xs font-normal text-foreground-muted italic">
                  loading enrichment errors…
                </span>
              )}
            </h2>
            {(() => {
              const failedCount = sourceCounts.failed;
              if (failedCount === 0) return null;
              return (
                <button
                  type="button"
                  onClick={handleRetryAllFailed}
                  disabled={isRetryingAllFailed || isAnyIndexing}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition border disabled:opacity-50 bg-red-500/30 hover:bg-red-500/45 text-foreground border-red-300/50"
                  title="Reset failed rows to pending and re-queue indexing"
                >
                  {isRetryingAllFailed
                    ? "Retrying…"
                    : `Retry all failed (${failedCount})`}
                </button>
              );
            })()}
          </div>
          {/* Controls row */}
          <p className="text-xs text-foreground-muted mb-2">
            Narrows the list of sources already added to this knowledge base.
          </p>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <input
              type="text"
              placeholder="Filter sources by name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="px-3 py-1.5 bg-surface-200 border border-default rounded text-sm text-foreground max-w-xs flex-1"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-1.5 bg-surface-200 border border-default rounded text-sm text-foreground"
            >
              <option value="">All statuses ({sourceCounts.total})</option>
              <option value="failed">Failed ({sourceCounts.failed})</option>
              <option value="indexed">Indexed ({sourceCounts.indexed})</option>
              <option value="pending">Pending ({sourceCounts.pending})</option>
              <option value="indexing">Indexing ({sourceCounts.indexing})</option>
              <option value="cancelled">Cancelled ({sourceCounts.cancelled})</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setSortMode((prev) =>
                  prev.sort === 'name'
                    ? { sort: 'name', order: prev.order === 'asc' ? 'desc' : 'asc' }
                    : { sort: 'name', order: 'asc' }
                )
              }
              className="px-3 py-1.5 text-xs uppercase font-medium text-foreground-muted hover:text-foreground"
            >
              Name {sortMode.sort === 'name' ? (sortMode.order === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              type="button"
              onClick={() =>
                setSortMode((prev) =>
                  prev.sort === 'created_at'
                    ? { sort: 'created_at', order: prev.order === 'asc' ? 'desc' : 'asc' }
                    : { sort: 'created_at', order: 'desc' }
                )
              }
              className="px-3 py-1.5 text-xs uppercase font-medium text-foreground-muted hover:text-foreground"
            >
              Created {sortMode.sort === 'created_at' ? (sortMode.order === 'asc' ? '↑' : '↓') : ''}
            </button>
            <span className="text-xs text-foreground-muted ml-auto">
              {totalFiltered} match{totalFiltered === 1 ? '' : 'es'}
            </span>
          </div>
          {sourceCounts.total === 0 ? (
            <p className="text-foreground-muted text-sm">No sources indexed yet</p>
          ) : visibleSources.length === 0 && !sourcesQuery.isFetching ? (
            <p className="text-foreground-muted text-sm">No matches.</p>
          ) : (
            <div
              ref={tableContainerRef}
              className="relative h-[600px] overflow-auto rounded border border-default"
              onScroll={() => {
                const el = tableContainerRef.current;
                if (!el) return;
                const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
                if (remaining < 200 && sourcesQuery.hasNextPage && !sourcesQuery.isFetchingNextPage) {
                  sourcesQuery.fetchNextPage();
                }
              }}
            >
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const is = visibleSources[vRow.index];
                  if (!is) return null;
                  return (
                <div
                  key={is.id}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="px-1 py-1"
                >
                <div className="flex items-center justify-between p-3 bg-surface-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground-light">{is.source_name || is.source_id}</p>
                    <p className="text-xs text-foreground-muted">{is.file_type ? shortFileType(is.file_type) : null}</p>
                    {currentStrategy === "graph_index" && is.index_status === "indexed" && (() => {
                      const counts = graphErrorCounts[is.id];
                      const failedCount = counts?.failed ?? 0;
                      return failedCount > 0 ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-amber-50">{failedCount} enrichment error{failedCount !== 1 ? "s" : ""}</span>
                          <button
                            onClick={() => handleReenrichSource(is.id, true)}
                            disabled={reenrichingSource?.id === is.id || isAnyIndexing}
                            className="text-xs px-2 py-0.5 bg-amber-500/35 hover:bg-amber-500/50 text-white border border-amber-300/60 rounded transition disabled:opacity-50"
                          >
                            {reenrichingSource?.id === is.id && reenrichingSource?.action === "retry" ? "Retrying\u2026" : "Retry failed"}
                          </button>
                          <button
                            onClick={() => handleReenrichSource(is.id, false)}
                            disabled={reenrichingSource?.id === is.id || isAnyIndexing}
                            className="text-xs px-2 py-0.5 bg-blue-500/35 hover:bg-blue-500/50 text-white border border-blue-300/60 rounded transition disabled:opacity-50"
                          >
                            {reenrichingSource?.id === is.id && reenrichingSource?.action === "reenrich" ? "Re-enriching\u2026" : "Re-enrich all"}
                          </button>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={is.index_status} onFailedClick={is.index_status === "failed" ? () => setInspectFailureFor(is) : undefined} />
                    {is.index_status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleRetryIndexedSource(is)}
                        disabled={retryingIndexedSourceIds.has(is.id) || isAnyIndexing}
                        className="text-xs px-2 py-0.5 bg-red-500/30 hover:bg-red-500/45 text-foreground border border-red-300/50 rounded transition disabled:opacity-50"
                        title="Re-queue this source for indexing"
                      >
                        {retryingIndexedSourceIds.has(is.id) ? "Retrying…" : "Retry"}
                      </button>
                    )}
                    {(is.index_status === "pending" || is.index_status === "indexing") && (
                      <button
                        onClick={() => handleCancelIndexing(is)}
                        disabled={cancellingIndexId === is.id}
                        className="text-foreground-muted hover:text-amber-400 transition disabled:opacity-50"
                        title="Cancel indexing"
                        aria-label="Cancel indexing"
                      >
                        <XCircleIcon className="w-4 h-4" />
                      </button>
                    )}
                    <Link
                      href={`/project/${ref}/sources/${is.source_id}`}
                      className="text-foreground-muted hover:text-emerald-400 transition"
                      title="Go to source"
                      aria-label="Go to source"
                    >
                      <ExternalLinkIcon className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => { setInspectSource(is); setChunksPage(1); }}
                      className="text-foreground-muted hover:text-emerald-400 transition"
                      title="View indexed data"
                      aria-label="View indexed data"
                    >
                      <LayersIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemoveSource(is)}
                      disabled={removingSourceId === is.id}
                      className="text-foreground-muted hover:text-red-400 transition disabled:opacity-50"
                      title="Remove from knowledge base"
                      aria-label="Remove from knowledge base"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                </div>
                  );
                })}
              </div>
              {sourcesQuery.isFetchingNextPage && (
                <div className="p-2 text-center text-xs text-foreground-muted">Loading more…</div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="bg-default border border-default rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-emerald-300" strokeWidth={1.5} />
            <h2 className="font-medium text-foreground">Test retrieval</h2>
            <MarkdownToggle />
          </div>
          <p className="text-xs text-foreground-muted mb-4">
            Runs your knowledge base&apos;s retrieval pipeline and shows matched chunks with scores. Doesn&apos;t modify the knowledge base.
          </p>
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Try a question — e.g. "how do I cancel my subscription?"'
              className="flex-1 px-4 py-2 bg-surface-200 border border-default rounded-lg text-foreground"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
            >
              {isSearching ? "Running..." : "Run query"}
            </button>
          </form>
          {searchResults && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-foreground-muted text-sm">No results found</p>
              ) : (
                searchResults.map((r, i) => (
                  <div key={i} className="p-3 bg-surface-200 rounded-lg">
                    <p className="text-foreground-lighter text-xs mb-1">
                      {r.source_id}
                    </p>
                    <MarkdownText rawClassName="" className="text-foreground-light text-sm" disableMath>{r.text}</MarkdownText>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-foreground-muted">Score: {r.score.toFixed(3)}</p>
                      {r.meta?.retrieval_method === "graph_expansion" && (
                        <span className="text-xs bg-[#a855f7]/30 text-white border border-[#d8b4fe]/60 px-1.5 py-0.5 rounded">
                          graph expansion
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Add Source Dialog */}
      {showAddSource && (
        <div className="fixed inset-0 bg-default/60 flex items-center justify-center z-50">
          <div className="bg-default border border-default rounded-xl p-6 w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar flex flex-col">
            <h3 className="text-xl font-semibold text-foreground mb-4">Add sources to knowledge base</h3>

            {/* Search bar — debounced; page reset is handled by the
                 useEffect on debouncedAddSourceSearch above. */}
            <input
              type="text"
              value={sourceSearchText}
              onChange={(e) => setSourceSearchText(e.target.value)}
              placeholder="Search sources..."
              disabled={isAddingSource}
              className="w-full px-4 py-2 bg-surface-200 border border-default rounded-lg text-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />

            {isLoadingAvailableSources && pagedSources.length === 0 ? (
              <p className="text-foreground-muted text-sm py-4">Loading…</p>
            ) : !hasAnyEligibleSource ? (
              <p className="text-foreground-muted text-sm py-4">No available sources to add.</p>
            ) : pagedSources.length === 0 ? (
              <p className="text-foreground-muted text-sm py-4">No sources match your search.</p>
            ) : (
              <>
                {/* Select all toggle */}
                <label className="flex items-center gap-3 px-3 py-2 border-b border-default cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pagedSources.length > 0 && pagedSources.every(s => selectedSourceIds.has(s.id))}
                    onChange={toggleAllOnPage}
                    disabled={isAddingSource}
                    className="w-4 h-4 rounded border-strong text-emerald-500 focus:ring-emerald-500 bg-surface-200"
                  />
                  <span className="text-sm text-foreground-lighter">Select all on this page</span>
                </label>

                {/* Scrollable checklist */}
                <div className="max-h-[340px] overflow-y-auto divide-y divide-border-default">
                  {pagedSources.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-200/60 cursor-pointer select-none transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSourceIds.has(s.id)}
                        onChange={() => toggleSource(s.id)}
                        disabled={isAddingSource}
                        className="w-4 h-4 rounded border-strong text-emerald-500 focus:ring-emerald-500 bg-surface-200"
                      />
                      <span className="flex-1 text-sm text-foreground-light truncate">{s.name}</span>
                      {s.file_type && (
                        <span className="shrink-0 max-w-[6rem] truncate text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-300 text-foreground-lighter"
                              title={s.file_type}>
                          {shortFileType(s.file_type)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                {/* Pagination */}
                {totalAddPages > 1 && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-default">
                    <button
                      type="button"
                      onClick={() => setAddSourcePage(p => Math.max(1, p - 1))}
                      disabled={addSourcePage <= 1 || isAddingSource}
                      className="text-foreground-lighter hover:text-foreground disabled:opacity-30 transition"
                    >
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-foreground-muted">
                      Page {addSourcePage} of {totalAddPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddSourcePage(p => Math.min(totalAddPages, p + 1))}
                      disabled={addSourcePage >= totalAddPages || isAddingSource}
                      className="text-foreground-lighter hover:text-foreground disabled:opacity-30 transition"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Progress indicator */}
            {addingProgress && (
              <div className="mt-3 text-sm text-foreground-lighter">
                Adding {addingProgress.current} of {addingProgress.total}...
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 justify-end mt-4 pt-3 border-t border-default">
              <button
                type="button"
                onClick={() => { setShowAddSource(false); setSelectedSourceIds(new Set()); setSourceSearchText(""); setAddSourcePage(1); }}
                disabled={isAddingSource}
                className="px-4 py-2 text-foreground-lighter hover:text-foreground transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSources}
                disabled={isAddingSource || selectedSourceIds.size === 0}
                className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
              >
                {isAddingSource
                  ? `Adding${addingProgress ? ` ${addingProgress.current}/${addingProgress.total}` : ""}...`
                  : `Add ${selectedSourceIds.size} source${selectedSourceIds.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indexing Failure Details Dialog */}
      <Dialog
        open={!!inspectFailureFor}
        onOpenChange={(open) => !open && setInspectFailureFor(null)}
      >
        <DialogContent
          className="w-full max-w-[min(95vw,720px)] sm:max-w-[min(95vw,720px)] p-0 bg-default border-default text-foreground flex flex-col overflow-hidden"
          hideClose={false}
        >
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-default">
            <DialogTitle className="text-foreground flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium bg-red-500/45 text-white border border-red-300/70">
                failed
              </span>
              Indexing failed
            </DialogTitle>
          </DialogHeader>
          {inspectFailureFor && (
            <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <p className="text-xs uppercase tracking-wider text-foreground-muted mb-1">
                  Source
                </p>
                <p className="text-sm text-foreground font-medium break-words">
                  {inspectFailureFor.source_name || inspectFailureFor.source_id}
                </p>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Indexed-source ID:{" "}
                  <span className="font-mono">{inspectFailureFor.id}</span>
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-foreground-muted mb-1">
                  Error reported by the worker
                </p>
                {inspectFailureFor.error_message ? (
                  <pre className="text-xs font-mono text-foreground bg-surface-200 rounded-md p-3 whitespace-pre-wrap break-words border border-default max-h-[40vh] overflow-y-auto"
                    style={{ color: "#fca5a5" }}
                  >
                    {inspectFailureFor.error_message}
                  </pre>
                ) : (
                  <p className="text-sm text-foreground-muted italic">
                    No error message recorded. The worker may have crashed before
                    it could write one — check the project worker logs (
                    <code className="font-mono">docker logs &lt;ref&gt;-worker</code>
                    ) for the traceback.
                  </p>
                )}
              </div>

              <div className="text-xs text-foreground-muted space-y-1 border-t border-default pt-3">
                <p>
                  <span className="text-foreground-light">Common causes: </span>
                  invalid / missing LLM provider API key, source still extracting
                  or extraction failed, transient embedding-provider rate limit,
                  or content that the active strategy can't process (e.g. an
                  unsupported file type for <code className="font-mono">page_index</code>).
                </p>
                <p>
                  Retry re-queues this row with status reset to{" "}
                  <code className="font-mono">pending</code>. If the underlying
                  cause persists, the row will fail again with the new error.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="default"
                  onClick={() => setInspectFailureFor(null)}
                  className="bg-surface-200 hover:bg-surface-300 text-foreground border border-default"
                >
                  Close
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleRetryIndexedSource(inspectFailureFor)}
                  disabled={retryingIndexedSourceIds.has(inspectFailureFor.id) || isAnyIndexing}
                  className="bg-red-500/40 hover:bg-red-500/55 text-foreground border border-red-300/60 disabled:opacity-50"
                >
                  {retryingIndexedSourceIds.has(inspectFailureFor.id)
                    ? "Retrying…"
                    : "Retry indexing"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Indexed Data Inspection Dialog */}
      <Dialog open={!!inspectSource} onOpenChange={(open) => !open && setInspectSource(null)}>
        <DialogContent
          // Studio's shadcn DialogContent does not default to `flex flex-col`,
          // so the inner body wrapper's `flex-1 min-h-0 h-0` collapses to
          // height 0 and hides chunk/node/toc/doc content (pagination stays
          // visible because it's outside the body wrapper). Force flex-col
          // so the body grows into the remaining space.
          className="w-full max-w-[min(95vw,1600px)] sm:max-w-[min(95vw,1600px)] h-[85vh] p-0 bg-default border-default text-foreground flex flex-col overflow-hidden"
          hideClose={false}
        >
          <DialogHeader className="px-6 pt-6 pb-2 border-b border-default">
            <div className="flex items-center gap-2">
              <DialogTitle>
                {currentStrategy === "chunk_embed" && "Chunks: "}
                {currentStrategy === "page_index" && "Nodes: "}
                {currentStrategy === "full_document" && "Document: "}
                {currentStrategy === "graph_index" && "Graph Nodes: "}
                {currentStrategy === "doc2json" && "Doc2JSON: "}
                {inspectSource?.source_name ?? inspectSource?.source_id ?? ""}
              </DialogTitle>
              <MarkdownToggle />
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 h-0 overflow-hidden flex flex-col">

            {/* ===== chunk_embed ===== */}
            {currentStrategy === "chunk_embed" && (
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                {chunksLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
                  </div>
                ) : chunksData ? (
                  chunksData.chunks.length === 0 ? (
                    <p className="text-foreground-muted text-sm">No chunks for this source.</p>
                  ) : (
                    <ul className="space-y-4">
                      {chunksData.chunks.map((chunk) => (
                        <li key={chunk.id} className="p-4 rounded-lg bg-surface-200 border border-default text-sm">
                          <div className="flex items-center gap-2 text-foreground-muted text-xs mb-2">
                            <span>Chunk {chunk.chunk_index ?? "—"}</span>
                            {(chunk.start_char != null || chunk.end_char != null) && (
                              <span>chars {chunk.start_char ?? "?"}–{chunk.end_char ?? "?"}</span>
                            )}
                            {chunk.tokens != null && <span>{chunk.tokens} tokens</span>}
                          </div>
                          <MarkdownText className="text-foreground-light" disableMath>{chunk.text}</MarkdownText>
                          {chunk.meta && Object.keys(chunk.meta).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-default/50">
                              <p className="text-foreground-muted text-xs mb-1">Metadata</p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-lighter">
                                {Object.entries(chunk.meta).map(([k, v]) => (
                                  <span key={k}><span className="text-foreground-muted">{k}:</span> {String(v)}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <EnrichmentMetadataBox itemId={chunk.id} results={enrichmentResults} fields={enrichmentFieldDefs} itemErrors={enrichmentItemErrors} />
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            )}

            {/* ===== page_index ===== */}
            {currentStrategy === "page_index" && (
              nodesLoading || tocLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0 px-6 py-4">
                  {tocData && (tocData.doc_name || tocData.doc_description) && (
                    <div className="mb-3 p-3 rounded-lg bg-surface-200 border border-default shrink-0">
                      {tocData.doc_name && <p className="text-foreground font-medium">{tocData.doc_name}</p>}
                      {tocData.doc_description && <p className="text-foreground-lighter text-sm mt-1">{tocData.doc_description}</p>}
                    </div>
                  )}
                  {!allNodes || allNodes.length === 0 || !tocData?.structure ? (
                    <p className="text-foreground-muted text-sm">
                      No indexed data for this source. It may still be indexing or have failed — please wait until indexing is complete or retry.
                    </p>
                  ) : allNodes && tocData?.structure ? (
                    <div className="flex min-h-0 flex-1 border border-default rounded-lg overflow-hidden">
                      {/* Left: ToC tree */}
                      <div className="w-[280px] shrink-0 overflow-y-auto border-r border-default bg-surface-200/30">
                        <TocTree
                          nodes={tocData.structure}
                          selectedNodeId={selectedNodeId}
                          onSelect={setSelectedNodeId}
                          depth={0}
                        />
                      </div>
                      {/* Right: Selected node content */}
                      <div className="flex-1 overflow-y-auto p-4">
                        {selectedNodeId && nodesMap.get(selectedNodeId) ? (() => {
                          const node = nodesMap.get(selectedNodeId)!;
                          return (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                {node.title && <h3 className="font-medium text-foreground text-lg">{node.title}</h3>}
                                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-300 text-foreground-lighter">{node.node_id}</span>
                                <span className="text-foreground-muted text-xs">depth {node.depth}</span>
                              </div>
                              <div className="p-4 rounded-lg bg-surface-200 border border-default text-sm">
                                <MarkdownText className="text-foreground-light" disableMath>{node.text ?? ''}</MarkdownText>
                              </div>
                              {node.meta && Object.keys(node.meta).length > 0 && (
                                <div className="mt-4 p-3 rounded-lg bg-surface-200 border border-default">
                                  <p className="text-foreground-muted text-xs mb-2 font-medium">Metadata</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-lighter">
                                    {node.meta.summary != null && (
                                      <span className="w-full text-foreground-lighter italic">{String(node.meta.summary)}</span>
                                    )}
                                    {node.meta.start_page != null && (
                                      <span><span className="text-foreground-muted">pages:</span> {String(node.meta.start_page)}–{String(node.meta.end_page ?? node.meta.start_page)}</span>
                                    )}
                                    {Object.entries(node.meta)
                                      .filter(([k]) => !["summary", "start_page", "end_page"].includes(k))
                                      .map(([k, v]) => (
                                        <span key={k}><span className="text-foreground-muted">{k}:</span> {String(v)}</span>
                                      ))}
                                  </div>
                                </div>
                              )}
                              <EnrichmentMetadataBox itemId={node.id ?? node.node_id} results={enrichmentResults} fields={enrichmentFieldDefs} itemErrors={enrichmentItemErrors} />
                            </div>
                          );
                        })() : (
                          <p className="text-foreground-muted text-sm">Select a section from the table of contents.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            )}

            {/* ===== graph_index ===== */}
            {currentStrategy === "graph_index" && (
              nodesLoading || tocLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0 px-6 py-4">
                  {tocData && (tocData.doc_name || tocData.doc_description) && (
                    <div className="mb-3 p-3 rounded-lg bg-surface-200 border border-default shrink-0">
                      {tocData.doc_name && <p className="text-foreground font-medium">{tocData.doc_name}</p>}
                      {tocData.doc_description && <p className="text-foreground-lighter text-sm mt-1">{tocData.doc_description}</p>}
                    </div>
                  )}
                  {!allNodes || allNodes.length === 0 || !tocData?.structure ? (
                    <p className="text-foreground-muted text-sm">
                      No indexed data for this source. It may still be indexing or have failed — please wait until indexing is complete or retry.
                    </p>
                  ) : allNodes && tocData?.structure ? (
                    <div className="flex min-h-0 flex-1 border border-default rounded-lg overflow-hidden">
                      {/* Left: ToC tree */}
                      <div className="w-[280px] shrink-0 overflow-y-auto border-r border-default bg-surface-200/30">
                        <TocTree
                          nodes={tocData.structure}
                          selectedNodeId={selectedNodeId}
                          onSelect={setSelectedNodeId}
                          depth={0}
                        />
                      </div>
                      {/* Right: Selected node content */}
                      <div className="flex-1 overflow-y-auto p-4">
                        {selectedNodeId && nodesMap.get(selectedNodeId) ? (() => {
                          const node = nodesMap.get(selectedNodeId)!;
                          const referencedNodes = (node.meta?.referenced_nodes ?? []) as string[];
                          return (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                {node.title && <h3 className="font-medium text-foreground text-lg">{node.title}</h3>}
                                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-300 text-foreground-lighter">{node.node_id}</span>
                                <span className="text-foreground-muted text-xs">depth {node.depth}</span>
                              </div>
                              <div className="p-4 rounded-lg bg-surface-200 border border-default text-sm">
                                <MarkdownText className="text-foreground-light" disableMath>{node.text ?? ''}</MarkdownText>
                              </div>
                              {referencedNodes.length > 0 && (
                                // Tailwind's `purple` color name is remapped to Radix Colors in this
                                // app's tailwind config (see frontend/packages/config/ui.config.js),
                                // so -300/-500 resolve to dark interactive tints rather than the
                                // saturated mid-tones. Arbitrary hex values use Tailwind defaults.
                                <div className="mt-4 p-3 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/30">
                                  <p className="text-[#d8b4fe] text-xs mb-2 font-medium">Referenced Sections</p>
                                  <div className="flex flex-wrap gap-2">
                                    {referencedNodes.map((refId) => {
                                      const refNode = nodesMap.get(refId);
                                      return (
                                        <button
                                          key={refId}
                                          type="button"
                                          onClick={() => setSelectedNodeId(refId)}
                                          className="text-xs px-2 py-1 rounded bg-[#a855f7]/25 text-white border border-[#d8b4fe]/50 hover:bg-[#a855f7]/40 transition font-mono"
                                          title={refNode?.title ?? refId}
                                        >
                                          {refNode?.title ?? refId}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {node.meta && Object.keys(node.meta).length > 0 && (
                                <div className="mt-4 p-3 rounded-lg bg-surface-200 border border-default">
                                  <p className="text-foreground-muted text-xs mb-2 font-medium">Metadata</p>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-lighter">
                                    {node.meta.summary != null && (
                                      <span className="w-full text-foreground-lighter italic">{String(node.meta.summary)}</span>
                                    )}
                                    {node.meta.start_page != null && (
                                      <span><span className="text-foreground-muted">pages:</span> {String(node.meta.start_page)}–{String(node.meta.end_page ?? node.meta.start_page)}</span>
                                    )}
                                    {Object.entries(node.meta)
                                      .filter(([k]) => !["summary", "start_page", "end_page", "referenced_nodes"].includes(k))
                                      .map(([k, v]) => (
                                        <span key={k}><span className="text-foreground-muted">{k}:</span> {String(v)}</span>
                                      ))}
                                  </div>
                                </div>
                              )}
                              <EnrichmentMetadataBox itemId={node.id ?? node.node_id} results={enrichmentResults} fields={enrichmentFieldDefs} itemErrors={enrichmentItemErrors} />
                            </div>
                          );
                        })() : (
                          <p className="text-foreground-muted text-sm">Select a section from the table of contents.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            )}

            {/* ===== full_document ===== */}
            {currentStrategy === "full_document" && (
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                {fullDocLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
                  </div>
                ) : fullDocData ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-foreground-lighter mb-2">Summary</h3>
                      <div className="p-4 rounded-lg bg-surface-200 border border-default">
                        <MarkdownText className="text-foreground-light" disableMath>{fullDocData.summary ?? ''}</MarkdownText>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-foreground-lighter mb-2">Details</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {fullDocData.summary_model && (
                          <div className="p-3 rounded-lg bg-surface-200 border border-default">
                            <p className="text-foreground-muted text-xs">Summary Model</p>
                            <p className="text-foreground-light">{fullDocData.summary_model}</p>
                          </div>
                        )}
                        {fullDocData.summary_tokens != null && (
                          <div className="p-3 rounded-lg bg-surface-200 border border-default">
                            <p className="text-foreground-muted text-xs">Summary Tokens</p>
                            <p className="text-foreground-light">{fullDocData.summary_tokens.toLocaleString()}</p>
                          </div>
                        )}
                        {fullDocData.full_text_tokens != null && (
                          <div className="p-3 rounded-lg bg-surface-200 border border-default">
                            <p className="text-foreground-muted text-xs">Full Text Tokens</p>
                            <p className="text-foreground-light">{fullDocData.full_text_tokens.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {fullDocData.meta && Object.keys(fullDocData.meta).length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-foreground-lighter mb-2">Metadata</h3>
                        <div className="p-3 rounded-lg bg-surface-200 border border-default">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-lighter">
                            {Object.entries(fullDocData.meta).map(([k, v]) => (
                              <span key={k}><span className="text-foreground-muted">{k}:</span> {String(v)}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <EnrichmentMetadataBox itemId={fullDocData.id} results={enrichmentResults} fields={enrichmentFieldDefs} itemErrors={enrichmentItemErrors} />
                  </div>
                ) : (
                  <p className="text-foreground-muted text-sm">No document data for this source.</p>
                )}
              </div>
            )}

            {/* ===== doc2json - Split view: images left, JSON right ===== */}
            {currentStrategy === "doc2json" && (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 py-4">
                {doc2jsonLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-400" />
                  </div>
                ) : doc2jsonData ? (
                  <div className="flex-1 min-h-0 h-0 grid border border-default rounded-lg overflow-hidden" style={{ gridTemplateColumns: 'minmax(300px, 40%) minmax(0, 1fr)' }}>
                    {/* Left Panel: Source Content (images or text based on KB config) */}
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain border-r border-default p-4 space-y-4">
                      <h3 className="text-sm font-medium text-foreground-lighter sticky top-0 bg-default py-2 z-10">
                        {useImages ? "Document Pages" : "Source Content"}
                      </h3>
                      {useImages ? (
                        // IMAGE MODE
                        pageImagesLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-400" />
                          </div>
                        ) : Object.keys(pageImages).length > 0 ? (
                          Object.entries(pageImages)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([pageIdx, url]) => (
                              <div key={pageIdx} className="space-y-1">
                                <p className="text-xs text-foreground-muted">
                                  Page {Number(pageIdx) + 1}
                                </p>
                                <img
                                  src={url}
                                  alt={`Page ${Number(pageIdx) + 1}`}
                                  className="w-full rounded-lg border border-default bg-surface-100"
                                />
                              </div>
                            ))
                        ) : (
                          <p className="text-sm text-foreground-muted py-4">
                            No page images available.
                          </p>
                        )
                      ) : (
                        // TEXT MODE
                        sourceTextContent ? (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <MarkdownText disableMath>{sourceTextContent}</MarkdownText>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground-muted py-4">
                            No text content available for this document.
                          </p>
                        )
                      )}
                    </div>

                    {/* Right Panel: Extracted JSON */}
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 space-y-4">
                      <h3 className="text-sm font-medium text-foreground-lighter sticky top-0 bg-default py-2 z-10">
                        Extracted JSON
                      </h3>

                      {/* Summary section */}
                      <div className="p-3 rounded-lg bg-surface-200 border border-default">
                        <p className="text-xs text-foreground-muted mb-1">Summary</p>
                        <MarkdownText className="text-foreground-light" disableMath>{doc2jsonData.summary ?? ''}</MarkdownText>
                      </div>

                      {/* Extracted JSON with syntax highlighting */}
                      <div className="p-4 rounded-lg bg-default border border-default overflow-x-auto">
                        <p className="text-xs text-foreground-muted mb-2">extracted_json</p>
                        <JsonSyntaxHighlight data={doc2jsonData.extracted_json} />
                      </div>

                      {/* Metadata */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {doc2jsonData.extraction_model && (
                          <div className="p-2 rounded bg-surface-200/30">
                            <p className="text-xs text-foreground-muted">Extraction Model</p>
                            <p className="text-foreground">{doc2jsonData.extraction_model}</p>
                          </div>
                        )}
                        {doc2jsonData.window_count != null && (
                          <div className="p-2 rounded bg-surface-200/30">
                            <p className="text-xs text-foreground-muted">Windows</p>
                            <p className="text-foreground">{doc2jsonData.window_count}</p>
                          </div>
                        )}
                        {doc2jsonData.input_tokens != null && (
                          <div className="p-2 rounded bg-surface-200/30">
                            <p className="text-xs text-foreground-muted">Input Tokens</p>
                            <p className="text-foreground">{doc2jsonData.input_tokens.toLocaleString()}</p>
                          </div>
                        )}
                        {doc2jsonData.summary_tokens != null && (
                          <div className="p-2 rounded bg-surface-200/30">
                            <p className="text-xs text-foreground-muted">Summary Tokens</p>
                            <p className="text-foreground">{doc2jsonData.summary_tokens.toLocaleString()}</p>
                          </div>
                        )}
                      </div>

                      {/* Enrichment metadata */}
                      <EnrichmentMetadataBox itemId={doc2jsonData.id} results={enrichmentResults} fields={enrichmentFieldDefs} itemErrors={enrichmentItemErrors} />
                    </div>
                  </div>
                ) : (
                  <p className="text-foreground-muted text-center py-8">
                    No doc2json data found for this source.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pagination — chunks */}
          {currentStrategy === "chunk_embed" && chunksData && chunksData.total > CHUNKS_PER_PAGE && (
            <div className="px-6 py-4 border-t border-default flex items-center justify-between gap-4">
              <p className="text-foreground-muted text-sm">
                Page {(chunksData.page ?? 1)} of {Math.ceil(chunksData.total / CHUNKS_PER_PAGE)}
              </p>
              <nav className="flex items-center gap-2" aria-label="Chunks pagination">
                <Button variant="ghost" size="default" className="text-foreground-lighter hover:text-foreground" disabled={(chunksData.page ?? 1) <= 1} onClick={() => setChunksPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeftIcon className="w-4 h-4" />
                  <span className="ml-1 hidden sm:inline">Previous</span>
                </Button>
                <span className="px-2 text-sm text-foreground-lighter">
                  {(chunksData.page ?? 1)} / {Math.ceil(chunksData.total / CHUNKS_PER_PAGE)}
                </span>
                <Button variant="ghost" size="default" className="text-foreground-lighter hover:text-foreground" disabled={(chunksData.page ?? 1) >= Math.ceil(chunksData.total / CHUNKS_PER_PAGE)} onClick={() => setChunksPage((p) => Math.min(Math.ceil(chunksData.total / CHUNKS_PER_PAGE), p + 1))}>
                  <span className="mr-1 hidden sm:inline">Next</span>
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </nav>
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* Update Knowledge Base Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-default/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-default border border-default rounded-xl p-8 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar">
            <h3 className="text-xl font-semibold text-foreground mb-4">Update knowledge base</h3>
            <form onSubmit={handleUpdate}>
              <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <label className="block text-sm text-foreground-lighter mb-1.5">Name</label>
                  <input
                    type="text"
                    value={updateName}
                    onChange={(e) => setUpdateName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-foreground-lighter mb-1.5">Description (optional)</label>
                  <textarea
                    value={updateDescription}
                    onChange={(e) => setUpdateDescription(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <KBConfigFields
                  strategies={defaults.strategies}
                  rerankerOptions={defaults.reranker.options}
                  indexingStrategy={updateIndexingStrategy}
                  onIndexingStrategyChange={handleUpdateStrategyChange}
                  chunkSize={updateChunkSize}
                  onChunkSizeChange={setUpdateChunkSize}
                  overlap={updateOverlap}
                  onOverlapChange={setUpdateOverlap}
                  pageIndexModel={updatePageIndexModel}
                  onPageIndexModelChange={setUpdatePageIndexModel}
                  pageIndexReasoningEffort={updatePageIndexReasoningEffort}
                  onPageIndexReasoningEffortChange={setUpdatePageIndexReasoningEffort}
                  retrievalMethod={updateRetrievalMethod}
                  onRetrievalMethodChange={setUpdateRetrievalMethod}
                  topK={updateTopK}
                  onTopKChange={setUpdateTopK}
                  retrievalModel={updateRetrievalModel}
                  onRetrievalModelChange={setUpdateRetrievalModel}
                  retrievalReasoningEffort={updateRetrievalReasoningEffort}
                  onRetrievalReasoningEffortChange={setUpdateRetrievalReasoningEffort}
                  vectorWeight={updateVectorWeight}
                  onVectorWeightChange={setUpdateVectorWeight}
                  rerankerEnabled={updateRerankerEnabled}
                  onRerankerEnabledChange={setUpdateRerankerEnabled}
                  rerankerModel={updateRerankerModel}
                  onRerankerModelChange={setUpdateRerankerModel}
                  rerankerCandidateCount={updateRerankerCandidateCount}
                  onRerankerCandidateCountChange={setUpdateRerankerCandidateCount}
                  minPerSource={updateMinPerSource}
                  onMinPerSourceChange={setUpdateMinPerSource}
                  maxPerSource={updateMaxPerSource}
                  onMaxPerSourceChange={setUpdateMaxPerSource}
                  queryEnrichmentModel={updateQueryEnrichmentModel}
                  onQueryEnrichmentModelChange={setUpdateQueryEnrichmentModel}
                  queryEnrichmentReasoningEffort={updateQueryEnrichmentReasoningEffort}
                  onQueryEnrichmentReasoningEffortChange={setUpdateQueryEnrichmentReasoningEffort}
                  queryEnrichmentEnabled={updateQueryEnrichmentEnabled}
                  onQueryEnrichmentEnabledChange={setUpdateQueryEnrichmentEnabled}
                  contextMode={updateContextMode}
                  onContextModeChange={setUpdateContextMode}
                  tsLanguage={updateTsLanguage}
                  onTsLanguageChange={setUpdateTsLanguage}
                  fullDocSummaryModel={updateFullDocSummaryModel}
                  onFullDocSummaryModelChange={setUpdateFullDocSummaryModel}
                  fullDocSummaryReasoningEffort={updateFullDocSummaryReasoningEffort}
                  onFullDocSummaryReasoningEffortChange={setUpdateFullDocSummaryReasoningEffort}
                  graphIndexModel={updateGraphIndexModel}
                  onGraphIndexModelChange={setUpdateGraphIndexModel}
                  graphIndexEnrichmentModel={updateGraphIndexEnrichmentModel}
                  onGraphIndexEnrichmentModelChange={setUpdateGraphIndexEnrichmentModel}
                  graphIndexReasoningEffort={updateGraphIndexReasoningEffort}
                  onGraphIndexReasoningEffortChange={setUpdateGraphIndexReasoningEffort}
                  graphIndexEnrichmentReasoningEffort={updateGraphIndexEnrichmentReasoningEffort}
                  onGraphIndexEnrichmentReasoningEffortChange={setUpdateGraphIndexEnrichmentReasoningEffort}
                  embeddingModel={updateEmbeddingModel}
                  onEmbeddingModelChange={setUpdateEmbeddingModel}
                  embeddingModelWarning={
                    updateEmbeddingModel !== originalEmbeddingModel.current && sourceCounts.total > 0
                      ? "Changing the embedding model will require re-indexing all sources."
                      : null
                  }
                  doc2jsonExtractionModel={updateDoc2jsonExtractionModel}
                  onDoc2jsonExtractionModelChange={setUpdateDoc2jsonExtractionModel}
                  doc2jsonExtractionReasoningEffort={updateDoc2jsonExtractionReasoningEffort}
                  onDoc2jsonExtractionReasoningEffortChange={setUpdateDoc2jsonExtractionReasoningEffort}
                  doc2jsonWindowSize={updateDoc2jsonWindowSize}
                  onDoc2jsonWindowSizeChange={setUpdateDoc2jsonWindowSize}
                  doc2jsonWindowOverlap={updateDoc2jsonWindowOverlap}
                  onDoc2jsonWindowOverlapChange={setUpdateDoc2jsonWindowOverlap}
                  doc2jsonUseImages={updateDoc2jsonUseImages}
                  onDoc2jsonUseImagesChange={setUpdateDoc2jsonUseImages}
                  doc2jsonPagesPerWindow={updateDoc2jsonPagesPerWindow}
                  onDoc2jsonPagesPerWindowChange={setUpdateDoc2jsonPagesPerWindow}
                  doc2jsonSchema={updateDoc2jsonSchema}
                  onDoc2jsonSchemaChange={setUpdateDoc2jsonSchema}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 text-foreground-lighter hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
                >
                  {isUpdating ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Metadata Enrichment Modal */}
      {showEnrichmentModal && (
        <div className="fixed inset-0 bg-default/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-default border border-default rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar">
            <h3 className="text-xl font-semibold text-foreground mb-4">Metadata Enrichment</h3>

            {/* Status section */}
            {enrichmentConfig && (
              <div className="mb-4 p-3 rounded-lg border border-default bg-surface-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-foreground-lighter">Status:</span>
                  <StatusPill status={enrichmentConfig.status} />
                  {enrichmentConfig.total_count > 0 && (
                    <span className="text-xs text-foreground-muted ml-auto">
                      {enrichmentConfig.enriched_count} / {enrichmentConfig.total_count}
                    </span>
                  )}
                </div>
                {(enrichmentConfig.status === "enriching" || enrichmentConfig.total_count > 0) && (
                  <div className="w-full h-2 bg-surface-300 rounded-full overflow-hidden">
                    {enrichmentConfig.status === "enriching" && enrichmentConfig.total_count === 0 ? (
                      <div className="h-full w-full rounded-full bg-blue-500 animate-pulse" />
                    ) : (
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          enrichmentConfig.status === "enriching" && "bg-blue-500",
                          enrichmentConfig.status === "completed" && "bg-emerald-500",
                          enrichmentConfig.status === "completed_with_errors" && "bg-amber-500",
                          enrichmentConfig.status === "failed" && "bg-red-500",
                          enrichmentConfig.status === "idle" && "bg-surface-300",
                        )}
                        style={{ width: `${Math.round((enrichmentConfig.enriched_count / enrichmentConfig.total_count) * 100)}%` }}
                      />
                    )}
                  </div>
                )}
                {enrichmentConfig.status === "failed" && enrichmentConfig.error_message && (
                  <p className="text-red-300 text-xs mt-2">{enrichmentConfig.error_message}</p>
                )}
                {enrichmentConfig.status === "completed_with_errors" && enrichmentConfig.error_message && (
                  <p className="text-amber-300 text-xs mt-2">{enrichmentConfig.error_message}</p>
                )}
              </div>
            )}

            {/* Error message */}
            {enrichmentError && (
              <div className="mb-4 p-3 bg-red-500/25 border border-red-300/60 rounded-lg text-red-50 text-sm">
                {enrichmentError}
                <button onClick={() => setEnrichmentError(null)} className="ml-2 underline">Dismiss</button>
              </div>
            )}

            {/* LLM Model */}
            <div className="mb-4">
              <label className="block text-sm text-foreground-lighter mb-1.5">LLM Model</label>
              <input
                type="text"
                value={enrichmentModel}
                onChange={(e) => setEnrichmentModel(e.target.value)}
                placeholder="e.g. gpt-4.1-mini"
                className="w-full px-4 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Max Output Tokens */}
            <div className="mb-4">
              <label className="block text-sm text-foreground-lighter mb-1.5">Max Output Tokens</label>
              <input
                type="number"
                min={100}
                max={16000}
                value={enrichmentMaxTokens}
                onChange={(e) => setEnrichmentMaxTokens(e.target.value)}
                className="w-full px-4 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {(() => { const n = Number(enrichmentMaxTokens); return (enrichmentMaxTokens.trim() === "" || !Number.isInteger(n) || n < 100 || n > 16000) ? <p className="text-xs text-red-300 mt-1">Must be an integer between 100 and 16000</p> : null; })()}
              <p className="text-xs text-foreground-muted mt-1">Maximum tokens for LLM output per chunk. Increase if enrichment fails on long content.</p>
            </div>

            {/* Multimodal toggle */}
            <div className="mb-4 pt-4 border-t border-default">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrichmentUseMultimodal}
                  onChange={(e) => setEnrichmentUseMultimodal(e.target.checked)}
                  className="w-4 h-4 rounded border-strong text-emerald-500 focus:ring-emerald-500 bg-surface-200"
                />
                <span className="text-sm text-foreground-light">Use multimodal enrichment</span>
              </label>
              <p className="text-xs text-foreground-muted mt-1 ml-6">
                Send original page images to the LLM for metadata extraction.
                Requires a vision-capable model. Only works with sources that have image derivatives (PDFs).
              </p>
            </div>

            {/* Fields header */}
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-foreground-lighter">Fields</label>
              <button
                type="button"
                onClick={() => setEnrichmentFields(prev => [...prev, { name: "", type: "text", description: "" }])}
                className="text-xs text-emerald-300 hover:text-emerald-200 transition"
              >
                + Add field
              </button>
            </div>

            {/* Field cards */}
            {enrichmentFields.length === 0 ? (
              <p className="text-foreground-muted text-sm mb-4">No fields yet. Add a field to get started.</p>
            ) : (
              <div className="space-y-3 mb-4">
                {enrichmentFields.map((field, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-default bg-surface-200 space-y-2">
                    {/* Row 1: name + type + remove */}
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => {
                            const updated = [...enrichmentFields];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setEnrichmentFields(updated);
                          }}
                          placeholder="Field name"
                          className="w-full px-3 py-1.5 bg-surface-300 border border-strong rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const updated = [...enrichmentFields];
                          const newType = e.target.value as EnrichmentField["type"];
                          updated[idx] = {
                            ...updated[idx],
                            type: newType,
                            enum_values: newType === "enum" ? (updated[idx].enum_values ?? []) : undefined,
                            _enumRaw: newType === "enum" ? updated[idx]._enumRaw : undefined,
                          };
                          setEnrichmentFields(updated);
                        }}
                        className="px-3 py-1.5 bg-surface-300 border border-strong rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="text">text</option>
                        <option value="boolean">boolean</option>
                        <option value="number">number</option>
                        <option value="enum">enum</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setEnrichmentFields(prev => prev.filter((_, i) => i !== idx))}
                        className="text-foreground-muted hover:text-red-400 transition p-1"
                        title="Remove field"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Row 2: description */}
                    <textarea
                      rows={3}
                      value={field.description}
                      onChange={(e) => {
                        const updated = [...enrichmentFields];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setEnrichmentFields(updated);
                      }}
                      placeholder={
                        field.type === "enum"
                          ? "Classify the document into one of the categories. Choose based on the primary subject matter."
                          : field.type === "boolean"
                            ? "Determine whether the document meets this criterion. Return true or false."
                            : field.type === "number"
                              ? "Extract or estimate this numeric value from the document."
                              : "Extract this information from the document as free-form text."
                      }
                      className="w-full px-3 py-1.5 bg-surface-300 border border-strong rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                    />
                    {/* Row 3: enum values (if type=enum) */}
                    {field.type === "enum" && (
                      <input
                        type="text"
                        value={field._enumRaw ?? (field.enum_values ?? []).join(", ")}
                        onChange={(e) => {
                          const updated = [...enrichmentFields];
                          updated[idx] = {
                            ...updated[idx],
                            _enumRaw: e.target.value,
                            enum_values: e.target.value.split(",").map(v => v.trim()),
                          };
                          setEnrichmentFields(updated);
                        }}
                        placeholder="Comma-separated values (e.g. finance, healthcare, tech)"
                        className="w-full px-3 py-1.5 bg-surface-300 border border-strong rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-default">
              {enrichmentConfig && (
                <button
                  type="button"
                  onClick={handleDeleteEnrichment}
                  disabled={isDeletingEnrichment}
                  className="text-red-300 hover:text-red-200 text-sm transition disabled:opacity-50"
                >
                  {isDeletingEnrichment ? "Deleting..." : "Delete"}
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setShowEnrichmentModal(false)}
                className="px-4 py-2 text-foreground-lighter hover:text-foreground transition text-sm"
              >
                Cancel
              </button>
              {enrichmentConfig && enrichmentConfig.status === "completed_with_errors" && (
                <button
                  type="button"
                  onClick={handleRetryFailedEnrichment}
                  disabled={isRunningEnrichment}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition border border-amber-500/30"
                >
                  {isRunningEnrichment ? "Retrying..." : "Retry failed"}
                </button>
              )}
              {enrichmentConfig && (
                <button
                  type="button"
                  onClick={handleRunEnrichment}
                  disabled={isRunningEnrichment || enrichmentConfig.status === "enriching"}
                  className="px-4 py-2 bg-surface-300 hover:bg-surface-300 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition border border-strong"
                >
                  {isRunningEnrichment ? "Starting..." : enrichmentConfig.status === "enriching" ? "Running..." : "Run"}
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveEnrichment}
                disabled={isSavingEnrichment}
                className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
              >
                {isSavingEnrichment ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

KnowledgeBaseDetailPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Knowledge Base Detail">{page}</AILayout>
  </DefaultLayout>
)

export default KnowledgeBaseDetailPage
