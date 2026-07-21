import { useParams } from "common";
import { useState } from "react";
import { useProjectSupabaseClient } from "@/hooks/ai/useProjectSupabaseClient";
import { hasAiAuth, knowledgeBasesApi } from "@/lib/ai-api";
import { useKBDefaults } from "@/hooks/useKBDefaults";
import {
  KBConfigFields,
  isValidInt,
} from "@/components/interfaces/AI/KnowledgeBases/KBConfigFields";
import {
  type JsonSchemaField,
  schemaFieldsToBackendFormat,
} from "@/components/interfaces/AI/KnowledgeBases/JsonSchemaEditor";

export interface CreateKBModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateKBModal({ open, onOpenChange, onSuccess }: CreateKBModalProps) {
  const { ref } = useParams();
  const { token, isReady } = useProjectSupabaseClient();
  const { defaults } = useKBDefaults();

  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIndexingStrategy, setCreateIndexingStrategy] = useState("chunk_embed");
  const [createChunkSize, setCreateChunkSize] = useState(
    String(defaults.strategies.chunk_embed.default_indexing_config.chunk_size ?? 2000)
  );
  const [createOverlap, setCreateOverlap] = useState(
    String(defaults.strategies.chunk_embed.default_indexing_config.overlap ?? 50)
  );
  const [createPageIndexModel, setCreatePageIndexModel] = useState(
    String(defaults.strategies.page_index.default_indexing_config.model ?? "gpt-5-mini")
  );
  const [createRetrievalMethod, setCreateRetrievalMethod] = useState("hybrid");
  const [createTopK, setCreateTopK] = useState("5");
  const [createRetrievalModel, setCreateRetrievalModel] = useState(
    String(defaults.strategies.page_index.default_retrieval_config.retrieval_model ?? "gpt-5-mini")
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createRerankerEnabled, setCreateRerankerEnabled] = useState(false);
  const [createRerankerModel, setCreateRerankerModel] = useState(defaults.reranker.default_model);
  const [createRerankerCandidateCount, setCreateRerankerCandidateCount] = useState(
    String(defaults.reranker.candidate_count)
  );
  const [createMinPerSource, setCreateMinPerSource] = useState("0");
  const [createMaxPerSource, setCreateMaxPerSource] = useState("0");
  const [createContextMode, setCreateContextMode] = useState("text");
  const [createVectorWeight, setCreateVectorWeight] = useState(defaults.hybrid_vector_weight);
  const [createQueryEnrichmentModel, setCreateQueryEnrichmentModel] = useState(
    defaults.query_enrichment.model
  );
  const [createQueryEnrichmentEnabled, setCreateQueryEnrichmentEnabled] = useState(false);
  const [createTsLanguage, setCreateTsLanguage] = useState("english");
  const [createFullDocSummaryModel, setCreateFullDocSummaryModel] = useState(
    String(defaults.strategies.full_document.default_indexing_config.summary_model ?? "gpt-5-mini")
  );
  const [createGraphIndexModel, setCreateGraphIndexModel] = useState(
    String(defaults.strategies.graph_index.default_indexing_config.model ?? "gpt-5-mini")
  );
  const [createGraphIndexEnrichmentModel, setCreateGraphIndexEnrichmentModel] = useState(
    String(defaults.strategies.graph_index.default_indexing_config.enrichment_model ?? "gpt-5-mini")
  );
  const [createGraphIndexReasoningEffort, setCreateGraphIndexReasoningEffort] = useState<string>("");
  const [createGraphIndexEnrichmentReasoningEffort, setCreateGraphIndexEnrichmentReasoningEffort] =
    useState<string>("");
  const [createPageIndexReasoningEffort, setCreatePageIndexReasoningEffort] = useState<string>("");
  const [createFullDocSummaryReasoningEffort, setCreateFullDocSummaryReasoningEffort] =
    useState<string>("");
  const [createDoc2jsonExtractionReasoningEffort, setCreateDoc2jsonExtractionReasoningEffort] =
    useState<string>("");
  const [createRetrievalReasoningEffort, setCreateRetrievalReasoningEffort] = useState<string>("");
  const [createQueryEnrichmentReasoningEffort, setCreateQueryEnrichmentReasoningEffort] =
    useState<string>("");
  const [createEmbeddingModel, setCreateEmbeddingModel] = useState(
    String(
      defaults.strategies.chunk_embed.default_indexing_config.embedding_model ??
        "text-embedding-3-small"
    )
  );
  // Doc2JSON strategy state
  const [createDoc2jsonExtractionModel, setCreateDoc2jsonExtractionModel] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.extraction_model ?? "gpt-5-mini")
  );
  const [createDoc2jsonWindowSize, setCreateDoc2jsonWindowSize] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.window_size ?? 4000)
  );
  const [createDoc2jsonWindowOverlap, setCreateDoc2jsonWindowOverlap] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.window_overlap ?? 200)
  );
  const [createDoc2jsonUseImages, setCreateDoc2jsonUseImages] = useState(
    Boolean(defaults.strategies.doc2json?.default_indexing_config?.use_images ?? false)
  );
  const [createDoc2jsonPagesPerWindow, setCreateDoc2jsonPagesPerWindow] = useState(
    String(defaults.strategies.doc2json?.default_indexing_config?.pages_per_window ?? 3)
  );
  const [createDoc2jsonSchema, setCreateDoc2jsonSchema] = useState<JsonSchemaField[]>([]);

  const resetForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateIndexingStrategy("chunk_embed");
    setCreateChunkSize(
      String(defaults.strategies.chunk_embed.default_indexing_config.chunk_size ?? 2000)
    );
    setCreateOverlap(
      String(defaults.strategies.chunk_embed.default_indexing_config.overlap ?? 50)
    );
    setCreatePageIndexModel(
      String(defaults.strategies.page_index.default_indexing_config.model ?? "gpt-5-mini")
    );
    setCreateRetrievalMethod("hybrid");
    setCreateTopK("5");
    setCreateRetrievalModel(
      String(
        defaults.strategies.page_index.default_retrieval_config.retrieval_model ?? "gpt-5-mini"
      )
    );
    setCreateRerankerEnabled(false);
    setCreateRerankerModel(defaults.reranker.default_model);
    setCreateRerankerCandidateCount(String(defaults.reranker.candidate_count));
    setCreateMinPerSource("0");
    setCreateMaxPerSource("0");
    setCreateContextMode("text");
    setCreateVectorWeight(defaults.hybrid_vector_weight);
    setCreateQueryEnrichmentModel(defaults.query_enrichment.model);
    setCreateQueryEnrichmentEnabled(false);
    setCreateFullDocSummaryModel(
      String(
        defaults.strategies.full_document.default_indexing_config.summary_model ?? "gpt-5-mini"
      )
    );
    setCreateGraphIndexModel(
      String(defaults.strategies.graph_index.default_indexing_config.model ?? "gpt-5-mini")
    );
    setCreateGraphIndexEnrichmentModel(
      String(
        defaults.strategies.graph_index.default_indexing_config.enrichment_model ?? "gpt-5-mini"
      )
    );
    setCreateGraphIndexReasoningEffort("");
    setCreateGraphIndexEnrichmentReasoningEffort("");
    setCreatePageIndexReasoningEffort("");
    setCreateFullDocSummaryReasoningEffort("");
    setCreateDoc2jsonExtractionReasoningEffort("");
    setCreateRetrievalReasoningEffort("");
    setCreateQueryEnrichmentReasoningEffort("");
    setCreateEmbeddingModel(
      String(
        defaults.strategies.chunk_embed.default_indexing_config.embedding_model ??
          "text-embedding-3-small"
      )
    );
    setCreateDoc2jsonExtractionModel(
      String(
        defaults.strategies.doc2json?.default_indexing_config?.extraction_model ?? "gpt-5-mini"
      )
    );
    setCreateDoc2jsonWindowSize(
      String(defaults.strategies.doc2json?.default_indexing_config?.window_size ?? 4000)
    );
    setCreateDoc2jsonWindowOverlap(
      String(defaults.strategies.doc2json?.default_indexing_config?.window_overlap ?? 200)
    );
    setCreateDoc2jsonUseImages(
      Boolean(defaults.strategies.doc2json?.default_indexing_config?.use_images ?? false)
    );
    setCreateDoc2jsonPagesPerWindow(
      String(defaults.strategies.doc2json?.default_indexing_config?.pages_per_window ?? 3)
    );
    setCreateDoc2jsonSchema([]);
    setError(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const handleStrategyChange = (strategy: string) => {
    setCreateIndexingStrategy(strategy);
    const def = defaults.strategies[strategy];
    if (def) {
      setCreateRetrievalMethod(def.default_retrieval_method);
      // Reset embedding model from the new strategy's defaults
      const embModel = def.default_indexing_config.embedding_model;
      if (typeof embModel === "string") {
        setCreateEmbeddingModel(embModel);
      }
    }
    setCreateTopK(strategy === "full_document" ? "3" : "5");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || !hasAiAuth(token) || !createName.trim()) return;

    // Validate numeric fields (using same Number()-based logic as inline warnings)
    if (
      (createIndexingStrategy === "chunk_embed" && !isValidInt(createChunkSize, 1)) ||
      (createIndexingStrategy === "chunk_embed" && !isValidInt(createOverlap, 0)) ||
      (createIndexingStrategy === "doc2json" &&
        !createDoc2jsonUseImages &&
        !isValidInt(createDoc2jsonWindowSize, 500)) ||
      (createIndexingStrategy === "doc2json" &&
        !createDoc2jsonUseImages &&
        !isValidInt(createDoc2jsonWindowOverlap, 0)) ||
      (createIndexingStrategy === "doc2json" &&
        createDoc2jsonUseImages &&
        (!isValidInt(createDoc2jsonPagesPerWindow, 1) ||
          Number(createDoc2jsonPagesPerWindow) > 10)) ||
      !isValidInt(createTopK, 1) ||
      (createRerankerEnabled && !isValidInt(createRerankerCandidateCount, 1)) ||
      !isValidInt(createMinPerSource, 0) ||
      !isValidInt(createMaxPerSource, 0) ||
      (Number(createMaxPerSource) > 0 &&
        Number(createMinPerSource) > Number(createMaxPerSource))
    ) {
      setError("Please correct invalid fields before saving");
      return;
    }
    // Doc2JSON requires at least one schema field
    if (createIndexingStrategy === "doc2json" && createDoc2jsonSchema.length === 0) {
      setError("Doc2JSON strategy requires at least one schema field");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const indexing_config =
        createIndexingStrategy === "page_index"
          ? {
              strategy: "page_index",
              model: createPageIndexModel,
              if_add_node_summary: "yes",
              if_add_node_text: "yes",
              ...(createPageIndexReasoningEffort
                ? { reasoning_effort: createPageIndexReasoningEffort }
                : {}),
            }
          : createIndexingStrategy === "full_document"
            ? {
                strategy: "full_document",
                summary_model: createFullDocSummaryModel,
                embedding_model: createEmbeddingModel,
                ...(createFullDocSummaryReasoningEffort
                  ? { reasoning_effort: createFullDocSummaryReasoningEffort }
                  : {}),
              }
            : createIndexingStrategy === "graph_index"
              ? {
                  strategy: "graph_index",
                  model: createGraphIndexModel,
                  enrichment_model: createGraphIndexEnrichmentModel,
                  embedding_model: createEmbeddingModel,
                  if_add_node_summary: "yes",
                  if_add_node_text: "yes",
                  ...(createGraphIndexReasoningEffort
                    ? { reasoning_effort: createGraphIndexReasoningEffort }
                    : {}),
                  ...(createGraphIndexEnrichmentReasoningEffort
                    ? { enrichment_reasoning_effort: createGraphIndexEnrichmentReasoningEffort }
                    : {}),
                }
              : createIndexingStrategy === "doc2json"
                ? {
                    strategy: "doc2json",
                    extraction_model: createDoc2jsonExtractionModel,
                    embedding_model: createEmbeddingModel,
                    use_images: createDoc2jsonUseImages,
                    ...(createDoc2jsonExtractionReasoningEffort
                      ? { reasoning_effort: createDoc2jsonExtractionReasoningEffort }
                      : {}),
                    ...(createDoc2jsonUseImages
                      ? { pages_per_window: Number(createDoc2jsonPagesPerWindow) }
                      : {
                          window_size: Number(createDoc2jsonWindowSize),
                          window_overlap: Number(createDoc2jsonWindowOverlap),
                        }),
                    json_schema: schemaFieldsToBackendFormat(createDoc2jsonSchema),
                  }
                : {
                    strategy: "chunk_embed",
                    chunk_size: Number(createChunkSize),
                    overlap: Number(createOverlap),
                    embedding_model: createEmbeddingModel,
                  };

      const perSourceLimits = {
        ...(Number(createMinPerSource) > 0 && {
          min_per_source: Number(createMinPerSource),
        }),
        ...(Number(createMaxPerSource) > 0 && {
          max_per_source: Number(createMaxPerSource),
        }),
      };

      const retrieval_config =
        createRetrievalMethod === "tree_search"
          ? {
              method: "tree_search",
              top_k: Number(createTopK),
              retrieval_model: createRetrievalModel,
              context_mode: createContextMode,
              ...(createRetrievalReasoningEffort
                ? { retrieval_reasoning_effort: createRetrievalReasoningEffort }
                : {}),
              ...perSourceLimits,
            }
          : {
              method: createRetrievalMethod,
              top_k: Number(createTopK),
              context_mode: createContextMode,
              ...perSourceLimits,
              ...(createRetrievalMethod === "hybrid" && { vector_weight: createVectorWeight }),
              ...(createRerankerEnabled && {
                reranker: {
                  model: createRerankerModel,
                  candidate_count: Number(createRerankerCandidateCount),
                },
              }),
              ...((createRetrievalMethod === "hybrid" || createRetrievalMethod === "full_text") && {
                ts_language: createTsLanguage,
              }),
              query_enrichment: createQueryEnrichmentEnabled
                ? {
                    enabled: true,
                    model: createQueryEnrichmentModel,
                    ...(createQueryEnrichmentReasoningEffort
                      ? { reasoning_effort: createQueryEnrichmentReasoningEffort }
                      : {}),
                  }
                : { enabled: false },
            };

      await knowledgeBasesApi.create(token, ref as string, {
        name: createName.trim(),
        description: createDescription.trim() || null,
        indexing_config,
        retrieval_config,
      });
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create knowledge base");
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-100 border border-default rounded-xl p-8 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto always-show-scrollbar">
        <h3 className="text-xl font-semibold text-foreground mb-4">Create knowledge base</h3>
        {error && (
          <div className="mb-4 p-3 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        )}
        <form onSubmit={handleCreate}>
          <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <label
                htmlFor="create-kb-name"
                className="block text-sm text-foreground-light mb-1.5"
              >
                Name
              </label>
              <input
                id="create-kb-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Product docs"
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-foreground-light mb-1.5">
                Description (optional)
              </label>
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Short description of this knowledge base"
                rows={2}
                className="w-full px-4 py-2.5 bg-surface-200 border border-default rounded-lg text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <KBConfigFields
              strategies={defaults.strategies}
              rerankerOptions={defaults.reranker.options}
              indexingStrategy={createIndexingStrategy}
              onIndexingStrategyChange={handleStrategyChange}
              chunkSize={createChunkSize}
              onChunkSizeChange={setCreateChunkSize}
              overlap={createOverlap}
              onOverlapChange={setCreateOverlap}
              pageIndexModel={createPageIndexModel}
              onPageIndexModelChange={setCreatePageIndexModel}
              pageIndexReasoningEffort={createPageIndexReasoningEffort}
              onPageIndexReasoningEffortChange={setCreatePageIndexReasoningEffort}
              retrievalMethod={createRetrievalMethod}
              onRetrievalMethodChange={setCreateRetrievalMethod}
              topK={createTopK}
              onTopKChange={setCreateTopK}
              retrievalModel={createRetrievalModel}
              onRetrievalModelChange={setCreateRetrievalModel}
              retrievalReasoningEffort={createRetrievalReasoningEffort}
              onRetrievalReasoningEffortChange={setCreateRetrievalReasoningEffort}
              vectorWeight={createVectorWeight}
              onVectorWeightChange={setCreateVectorWeight}
              rerankerEnabled={createRerankerEnabled}
              onRerankerEnabledChange={setCreateRerankerEnabled}
              rerankerModel={createRerankerModel}
              onRerankerModelChange={setCreateRerankerModel}
              rerankerCandidateCount={createRerankerCandidateCount}
              onRerankerCandidateCountChange={setCreateRerankerCandidateCount}
              minPerSource={createMinPerSource}
              onMinPerSourceChange={setCreateMinPerSource}
              maxPerSource={createMaxPerSource}
              onMaxPerSourceChange={setCreateMaxPerSource}
              queryEnrichmentModel={createQueryEnrichmentModel}
              onQueryEnrichmentModelChange={setCreateQueryEnrichmentModel}
              queryEnrichmentReasoningEffort={createQueryEnrichmentReasoningEffort}
              onQueryEnrichmentReasoningEffortChange={setCreateQueryEnrichmentReasoningEffort}
              queryEnrichmentEnabled={createQueryEnrichmentEnabled}
              onQueryEnrichmentEnabledChange={setCreateQueryEnrichmentEnabled}
              contextMode={createContextMode}
              onContextModeChange={setCreateContextMode}
              tsLanguage={createTsLanguage}
              onTsLanguageChange={setCreateTsLanguage}
              fullDocSummaryModel={createFullDocSummaryModel}
              onFullDocSummaryModelChange={setCreateFullDocSummaryModel}
              fullDocSummaryReasoningEffort={createFullDocSummaryReasoningEffort}
              onFullDocSummaryReasoningEffortChange={setCreateFullDocSummaryReasoningEffort}
              graphIndexModel={createGraphIndexModel}
              onGraphIndexModelChange={setCreateGraphIndexModel}
              graphIndexEnrichmentModel={createGraphIndexEnrichmentModel}
              onGraphIndexEnrichmentModelChange={setCreateGraphIndexEnrichmentModel}
              graphIndexReasoningEffort={createGraphIndexReasoningEffort}
              onGraphIndexReasoningEffortChange={setCreateGraphIndexReasoningEffort}
              graphIndexEnrichmentReasoningEffort={createGraphIndexEnrichmentReasoningEffort}
              onGraphIndexEnrichmentReasoningEffortChange={
                setCreateGraphIndexEnrichmentReasoningEffort
              }
              embeddingModel={createEmbeddingModel}
              onEmbeddingModelChange={setCreateEmbeddingModel}
              doc2jsonExtractionModel={createDoc2jsonExtractionModel}
              onDoc2jsonExtractionModelChange={setCreateDoc2jsonExtractionModel}
              doc2jsonExtractionReasoningEffort={createDoc2jsonExtractionReasoningEffort}
              onDoc2jsonExtractionReasoningEffortChange={setCreateDoc2jsonExtractionReasoningEffort}
              doc2jsonWindowSize={createDoc2jsonWindowSize}
              onDoc2jsonWindowSizeChange={setCreateDoc2jsonWindowSize}
              doc2jsonWindowOverlap={createDoc2jsonWindowOverlap}
              onDoc2jsonWindowOverlapChange={setCreateDoc2jsonWindowOverlap}
              doc2jsonUseImages={createDoc2jsonUseImages}
              onDoc2jsonUseImagesChange={setCreateDoc2jsonUseImages}
              doc2jsonPagesPerWindow={createDoc2jsonPagesPerWindow}
              onDoc2jsonPagesPerWindowChange={setCreateDoc2jsonPagesPerWindow}
              doc2jsonSchema={createDoc2jsonSchema}
              onDoc2jsonSchemaChange={setCreateDoc2jsonSchema}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-foreground-light hover:text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !createName.trim()}
              className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
