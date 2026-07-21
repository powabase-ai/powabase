import { TS_LANGUAGE_OPTIONS } from "@/lib/constants";
import type { KBDefaults } from "@/lib/ai-api";
import {
  JsonSchemaEditor,
  type JsonSchemaField,
} from "@/components/interfaces/AI/KnowledgeBases/JsonSchemaEditor";
import { KBModelSelect } from "@/components/interfaces/AI/KnowledgeBases/KBModelSelect";

export function isValidInt(s: string, min: number): boolean {
  const n = Number(s);
  return s.trim() !== "" && Number.isInteger(n) && n >= min;
}

export interface KBConfigFieldsProps {
  strategies: KBDefaults["strategies"];
  rerankerOptions: { value: string; label: string; provider: string }[];
  indexingStrategy: string;
  onIndexingStrategyChange: (strategy: string) => void;
  chunkSize: string;
  onChunkSizeChange: (v: string) => void;
  overlap: string;
  onOverlapChange: (v: string) => void;
  pageIndexModel: string;
  onPageIndexModelChange: (v: string) => void;
  pageIndexReasoningEffort?: string;
  onPageIndexReasoningEffortChange?: (v: string) => void;
  retrievalMethod: string;
  onRetrievalMethodChange: (v: string) => void;
  topK: string;
  onTopKChange: (v: string) => void;
  retrievalModel: string;
  onRetrievalModelChange: (v: string) => void;
  retrievalReasoningEffort?: string;
  onRetrievalReasoningEffortChange?: (v: string) => void;
  vectorWeight: number;
  onVectorWeightChange: (v: number) => void;
  rerankerEnabled: boolean;
  onRerankerEnabledChange: (v: boolean) => void;
  rerankerModel: string;
  onRerankerModelChange: (v: string) => void;
  rerankerCandidateCount: string;
  onRerankerCandidateCountChange: (v: string) => void;
  minPerSource?: string;
  onMinPerSourceChange?: (v: string) => void;
  maxPerSource?: string;
  onMaxPerSourceChange?: (v: string) => void;
  queryEnrichmentModel: string;
  onQueryEnrichmentModelChange: (v: string) => void;
  queryEnrichmentReasoningEffort?: string;
  onQueryEnrichmentReasoningEffortChange?: (v: string) => void;
  queryEnrichmentEnabled?: boolean;
  onQueryEnrichmentEnabledChange?: (v: boolean) => void;
  contextMode: string;
  onContextModeChange: (v: string) => void;
  tsLanguage?: string;
  onTsLanguageChange?: (v: string) => void;
  fullDocSummaryModel?: string;
  onFullDocSummaryModelChange?: (v: string) => void;
  fullDocSummaryReasoningEffort?: string;
  onFullDocSummaryReasoningEffortChange?: (v: string) => void;
  graphIndexModel?: string;
  onGraphIndexModelChange?: (v: string) => void;
  graphIndexReasoningEffort?: string;
  onGraphIndexReasoningEffortChange?: (v: string) => void;
  graphIndexEnrichmentModel?: string;
  onGraphIndexEnrichmentModelChange?: (v: string) => void;
  graphIndexEnrichmentReasoningEffort?: string;
  onGraphIndexEnrichmentReasoningEffortChange?: (v: string) => void;
  embeddingModel: string;
  onEmbeddingModelChange: (v: string) => void;
  embeddingModelWarning?: string | null;
  // Doc2JSON strategy props
  doc2jsonExtractionModel?: string;
  onDoc2jsonExtractionModelChange?: (v: string) => void;
  doc2jsonExtractionReasoningEffort?: string;
  onDoc2jsonExtractionReasoningEffortChange?: (v: string) => void;
  doc2jsonWindowSize?: string;
  onDoc2jsonWindowSizeChange?: (v: string) => void;
  doc2jsonWindowOverlap?: string;
  onDoc2jsonWindowOverlapChange?: (v: string) => void;
  doc2jsonUseImages?: boolean;
  onDoc2jsonUseImagesChange?: (v: boolean) => void;
  doc2jsonPagesPerWindow?: string;
  onDoc2jsonPagesPerWindowChange?: (v: string) => void;
  doc2jsonSchema?: JsonSchemaField[];
  onDoc2jsonSchemaChange?: (v: JsonSchemaField[]) => void;
}

export function KBConfigFields({
  strategies,
  rerankerOptions,
  indexingStrategy,
  onIndexingStrategyChange,
  chunkSize,
  onChunkSizeChange,
  overlap,
  onOverlapChange,
  pageIndexModel,
  onPageIndexModelChange,
  pageIndexReasoningEffort,
  onPageIndexReasoningEffortChange,
  retrievalMethod,
  onRetrievalMethodChange,
  topK,
  onTopKChange,
  retrievalModel,
  onRetrievalModelChange,
  retrievalReasoningEffort,
  onRetrievalReasoningEffortChange,
  vectorWeight,
  onVectorWeightChange,
  rerankerEnabled,
  onRerankerEnabledChange,
  rerankerModel,
  onRerankerModelChange,
  rerankerCandidateCount,
  onRerankerCandidateCountChange,
  minPerSource = "0",
  onMinPerSourceChange,
  maxPerSource = "0",
  onMaxPerSourceChange,
  queryEnrichmentModel,
  onQueryEnrichmentModelChange,
  queryEnrichmentReasoningEffort,
  onQueryEnrichmentReasoningEffortChange,
  queryEnrichmentEnabled,
  onQueryEnrichmentEnabledChange,
  contextMode,
  onContextModeChange,
  tsLanguage = "english",
  onTsLanguageChange,
  fullDocSummaryModel,
  onFullDocSummaryModelChange,
  fullDocSummaryReasoningEffort,
  onFullDocSummaryReasoningEffortChange,
  graphIndexModel,
  onGraphIndexModelChange,
  graphIndexReasoningEffort,
  onGraphIndexReasoningEffortChange,
  graphIndexEnrichmentModel,
  onGraphIndexEnrichmentModelChange,
  graphIndexEnrichmentReasoningEffort,
  onGraphIndexEnrichmentReasoningEffortChange,
  embeddingModel,
  onEmbeddingModelChange,
  embeddingModelWarning,
  doc2jsonExtractionModel,
  onDoc2jsonExtractionModelChange,
  doc2jsonExtractionReasoningEffort,
  onDoc2jsonExtractionReasoningEffortChange,
  doc2jsonWindowSize,
  onDoc2jsonWindowSizeChange,
  doc2jsonWindowOverlap,
  onDoc2jsonWindowOverlapChange,
  doc2jsonUseImages,
  onDoc2jsonUseImagesChange,
  doc2jsonPagesPerWindow,
  onDoc2jsonPagesPerWindowChange,
  doc2jsonSchema,
  onDoc2jsonSchemaChange,
}: KBConfigFieldsProps) {
  const strategyEntry = strategies[indexingStrategy];
  const retrievers = strategyEntry
    ? strategyEntry.compatible_retrievers.map((r) => ({
        value: r,
        label: strategyEntry.retriever_labels[r] ?? r,
      }))
    : [];

  return (
    <>
      <div>
        <label className="block text-sm text-foreground-light mb-1.5">Indexing strategy</label>
        <select
          value={indexingStrategy}
          onChange={(e) => onIndexingStrategyChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {Object.entries(strategies).map(([key, opt]) => (
            <option key={key} value={key}>{opt.label}</option>
          ))}
        </select>
        {indexingStrategy === "chunk_embed" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Chunk size (tokens)</label>
              <input
                type="number"
                min={1}
                value={chunkSize}
                onChange={(e) => onChunkSizeChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {!isValidInt(chunkSize, 1) && <p className="text-xs text-red-400 mt-1">Must be a positive integer</p>}
            </div>
            <div>
              <label className="block text-xs text-foreground-lighter mb-1">Overlap (tokens)</label>
              <input
                type="number"
                min={0}
                value={overlap}
                onChange={(e) => onOverlapChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {!isValidInt(overlap, 0) && <p className="text-xs text-red-400 mt-1">Must be a non-negative integer</p>}
            </div>
          </div>
        )}
        {indexingStrategy === "page_index" && (
          <div className="mt-3">
            <KBModelSelect
              label="LLM model for tree building"
              description="Builds a hierarchical tree from document structure using LLM reasoning"
              value={pageIndexModel}
              onChange={onPageIndexModelChange}
              reasoningEffort={pageIndexReasoningEffort}
              onReasoningEffortChange={onPageIndexReasoningEffortChange}
            />
          </div>
        )}
        {indexingStrategy === "full_document" && (
          <div className="mt-3">
            <KBModelSelect
              label="Summarization model"
              description="Generates a summary of each document for search. Entire document returned when matched."
              value={fullDocSummaryModel ?? ""}
              onChange={(v) => onFullDocSummaryModelChange?.(v)}
              reasoningEffort={fullDocSummaryReasoningEffort}
              onReasoningEffortChange={onFullDocSummaryReasoningEffortChange}
            />
          </div>
        )}
        {indexingStrategy === "graph_index" && (
          <div className="mt-3 space-y-3">
            <KBModelSelect
              label="Tree-building model"
              description="LLM for hierarchical tree structure extraction"
              value={graphIndexModel ?? ""}
              onChange={(v) => onGraphIndexModelChange?.(v)}
              reasoningEffort={graphIndexReasoningEffort}
              onReasoningEffortChange={onGraphIndexReasoningEffortChange}
            />
            <KBModelSelect
              label="Enrichment model"
              description="LLM for cross-reference detection between sections"
              value={graphIndexEnrichmentModel ?? ""}
              onChange={(v) => onGraphIndexEnrichmentModelChange?.(v)}
              reasoningEffort={graphIndexEnrichmentReasoningEffort}
              onReasoningEffortChange={onGraphIndexEnrichmentReasoningEffortChange}
            />
          </div>
        )}
        {indexingStrategy === "doc2json" && (
          <div className="mt-3 space-y-4">
            <KBModelSelect
              label="Extraction model"
              description="LLM for extracting structured JSON from document content"
              value={doc2jsonExtractionModel ?? ""}
              onChange={(v) => onDoc2jsonExtractionModelChange?.(v)}
              reasoningEffort={doc2jsonExtractionReasoningEffort}
              onReasoningEffortChange={onDoc2jsonExtractionReasoningEffortChange}
            />
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doc2jsonUseImages ?? false}
                  onChange={(e) => onDoc2jsonUseImagesChange?.(e.target.checked)}
                  className="w-4 h-4 rounded border-default text-brand-600 focus:ring-brand-400 bg-surface-200"
                />
                <span className="text-sm text-foreground-light">Use page images (multimodal)</span>
              </label>
              <p className="text-xs text-foreground-muted mt-1">
                Extract from original page images instead of extracted text for greater accuracy
              </p>
              {doc2jsonUseImages && (
                <div className="mt-2 px-3 py-2 bg-amber-500/25 border border-amber-300/60 rounded-lg">
                  <p className="text-xs text-amber-50">
                    Requires a multimodal/vision LLM (e.g., gpt-4o, claude-3-5-sonnet, gemini-1.5-pro). Ensure the extraction model above supports image inputs.
                  </p>
                </div>
              )}
            </div>
            {doc2jsonUseImages ? (
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Pages per window</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={doc2jsonPagesPerWindow ?? "3"}
                  onChange={(e) => onDoc2jsonPagesPerWindowChange?.(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {doc2jsonPagesPerWindow && (!isValidInt(doc2jsonPagesPerWindow, 1) || Number(doc2jsonPagesPerWindow) > 10) && (
                  <p className="text-xs text-red-400 mt-1">Must be between 1 and 10</p>
                )}
                <p className="text-xs text-foreground-muted mt-1">
                  Number of page images to process in each LLM call
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-foreground-lighter mb-1">Window size (tokens)</label>
                  <input
                    type="number"
                    min={500}
                    value={doc2jsonWindowSize ?? ""}
                    onChange={(e) => onDoc2jsonWindowSizeChange?.(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  {doc2jsonWindowSize && !isValidInt(doc2jsonWindowSize, 500) && (
                    <p className="text-xs text-red-400 mt-1">Must be at least 500</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-foreground-lighter mb-1">Window overlap (tokens)</label>
                  <input
                    type="number"
                    min={0}
                    value={doc2jsonWindowOverlap ?? ""}
                    onChange={(e) => onDoc2jsonWindowOverlapChange?.(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  {doc2jsonWindowOverlap && !isValidInt(doc2jsonWindowOverlap, 0) && (
                    <p className="text-xs text-red-400 mt-1">Must be non-negative</p>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-foreground-muted">
              Sliding window scans the document, extracting and merging JSON at each step
            </p>
            {onDoc2jsonSchemaChange && (
              <div className="pt-3 border-t border-default">
                <JsonSchemaEditor
                  schema={doc2jsonSchema ?? []}
                  onChange={onDoc2jsonSchemaChange}
                  maxDepth={3}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {indexingStrategy !== "page_index" && (
        <div>
          <label className="block text-sm text-foreground-light mb-1.5">Embedding model</label>
          <input
            type="text"
            value={embeddingModel}
            onChange={(e) => onEmbeddingModelChange(e.target.value)}
            className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <p className="text-xs text-foreground-muted mt-1">
            Any LiteLLM-compatible model (e.g. text-embedding-3-small, text-embedding-3-large, cohere/embed-english-v3.0)
          </p>
          {embeddingModelWarning && (
            <p className="text-xs text-amber-50 mt-1 px-2 py-1 bg-amber-500/25 border border-amber-300/60 rounded">
              {embeddingModelWarning}
            </p>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm text-foreground-light mb-1.5">Retrieval method</label>
        <select
          value={retrievalMethod}
          onChange={(e) => onRetrievalMethodChange(e.target.value)}
          className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {retrievers.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Top K</label>
            <input
              type="number"
              min={1}
              value={topK}
              onChange={(e) => onTopKChange(e.target.value)}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {!isValidInt(topK, 1) && <p className="text-xs text-red-400 mt-1">Must be a positive integer</p>}
          </div>
          {retrievalMethod === "tree_search" && (
            <KBModelSelect
              label="Retrieval model"
              description="LLM that walks the tree to select relevant nodes at search time"
              value={retrievalModel}
              onChange={onRetrievalModelChange}
              reasoningEffort={retrievalReasoningEffort}
              onReasoningEffortChange={onRetrievalReasoningEffortChange}
            />
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Min per source</label>
            <input
              type="number"
              min={0}
              value={minPerSource}
              onChange={(e) => onMinPerSourceChange?.(e.target.value)}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {!isValidInt(minPerSource, 0) && (
              <p className="text-xs text-red-400 mt-1">Must be a non-negative integer</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-foreground-lighter mb-1">Max per source</label>
            <input
              type="number"
              min={0}
              value={maxPerSource}
              onChange={(e) => onMaxPerSourceChange?.(e.target.value)}
              className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {!isValidInt(maxPerSource, 0) && (
              <p className="text-xs text-red-400 mt-1">Must be a non-negative integer</p>
            )}
          </div>
        </div>
        {isValidInt(minPerSource, 0) &&
          isValidInt(maxPerSource, 0) &&
          Number(maxPerSource) > 0 &&
          Number(minPerSource) > Number(maxPerSource) && (
            <p className="text-xs text-red-400 mt-1">
              Min per source can&apos;t exceed max per source
            </p>
          )}
        <p className="text-xs text-foreground-muted mt-1">
          Limit how many results come from a single source. 0 = no limit. Max caps any
          one source from dominating. Min pulls in up to that many of each{" "}
          <em>query-relevant</em> source&apos;s best chunks &mdash; a source qualifies only
          if its best chunk clears the similarity threshold (not every source
          unconditionally), capped at the 50 most relevant sources per search.
        </p>
        {retrievalMethod === "hybrid" && (
          <div className="mt-3">
            <label className="block text-xs text-foreground-lighter mb-1">
              Vector weight: {vectorWeight.toFixed(1)} / Keyword weight: {(1 - vectorWeight).toFixed(1)}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={vectorWeight}
              onChange={(e) => onVectorWeightChange(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}
      </div>
      {strategyEntry?.supports_reranker && (
        <div className="pt-4 border-t border-default">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rerankerEnabled}
              onChange={(e) => onRerankerEnabledChange(e.target.checked)}
              className="w-4 h-4 rounded border-default text-brand-600 focus:ring-brand-400 bg-surface-200"
            />
            <span className="text-sm text-foreground-light">Enable reranker</span>
          </label>
          <p className="text-xs text-foreground-muted mt-1">
            Re-scores retrieved chunks using a cross-encoder model for improved precision
          </p>
          {rerankerEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Reranker model</label>
                <select
                  value={rerankerModel}
                  onChange={(e) => onRerankerModelChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {rerankerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.provider})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-foreground-lighter mb-1">Candidate count</label>
                <input
                  type="number"
                  min={1}
                  value={rerankerCandidateCount}
                  onChange={(e) => onRerankerCandidateCountChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {!isValidInt(rerankerCandidateCount, 1) && <p className="text-xs text-red-400 mt-1">Must be a positive integer</p>}
                <p className="text-xs text-foreground-muted mt-1">
                  Number of chunks retrieved before reranking (Top K controls final output count)
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {(retrievalMethod === "hybrid" || retrievalMethod === "full_text" || retrievalMethod === "vector_search") && (
        <div className="pt-4 border-t border-default">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!queryEnrichmentEnabled}
              onChange={(e) => onQueryEnrichmentEnabledChange?.(e.target.checked)}
              className="w-4 h-4 rounded border-default text-brand-600 focus:ring-brand-400 bg-surface-200"
            />
            <span className="text-sm text-foreground-light">Enable query enrichment</span>
          </label>
          <p className="text-xs text-foreground-muted mt-1">
            Optional LLM-powered query expansion for better search results.
          </p>
          {queryEnrichmentEnabled && (
            <div className="mt-3">
              <KBModelSelect
                label="Query enrichment model"
                description="LLM that expands the search query before retrieval"
                value={queryEnrichmentModel}
                onChange={onQueryEnrichmentModelChange}
                reasoningEffort={queryEnrichmentReasoningEffort}
                onReasoningEffortChange={onQueryEnrichmentReasoningEffortChange}
              />
            </div>
          )}
          {(retrievalMethod === "hybrid" || retrievalMethod === "full_text") && onTsLanguageChange && (
            <div className="mt-3">
              <label className="block text-xs text-foreground-lighter mb-1">Text search language</label>
              <select
                value={tsLanguage}
                onChange={(e) => onTsLanguageChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-200 border border-default rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {TS_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-foreground-muted mt-1">
                PostgreSQL text search configuration for stemming and stop words.
              </p>
            </div>
          )}
        </div>
      )}
      {indexingStrategy !== "doc2json" && (
        <div className="pt-4 border-t border-default">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={contextMode === "image"}
              onChange={(e) => onContextModeChange(e.target.checked ? "image" : "text")}
              className="w-4 h-4 rounded border-default text-brand-600 focus:ring-brand-400 bg-surface-200"
            />
            <span className="text-sm text-foreground-light">Use multimodal retrieval</span>
          </label>
          <p className="text-xs text-foreground-muted mt-1">
            Return original page images to the LLM instead of extracted text for visual understanding
          </p>
        </div>
      )}
    </>
  );
}
