import { useEffect, useRef, useState } from "react";
import { getAccessToken, useParams } from "common";
import { kbDefaultsApi, KBDefaults } from "@/lib/ai-api";

/**
 * Fallback defaults used while the API hasn't responded yet.
 * Mirrors the Python backend's model_config.py values so the UI works
 * even if the config endpoint is slow.
 */
const FALLBACK_DEFAULTS: KBDefaults = {
  strategies: {
    chunk_embed: {
      label: "Chunk + Embed",
      compatible_retrievers: ["vector_search", "full_text", "hybrid"],
      retriever_labels: {
        vector_search: "Vector search",
        full_text: "Full-text search",
        hybrid: "Hybrid (vector + full-text)",
      },
      default_retrieval_method: "hybrid",
      supports_reranker: true,
      default_indexing_config: {
        strategy: "chunk_embed",
        chunk_size: 2000,
        overlap: 50,
        embedding_model: "text-embedding-3-small",
      },
      default_retrieval_config: {
        method: "hybrid",
        top_k: 5,
        context_mode: "text",
        ts_language: "english",
      },
    },
    page_index: {
      label: "PageIndex (tree-based)",
      compatible_retrievers: ["tree_search"],
      retriever_labels: {
        tree_search: "Tree search (LLM reasoning)",
      },
      default_retrieval_method: "tree_search",
      supports_reranker: false,
      default_indexing_config: {
        strategy: "page_index",
        model: "gpt-5-mini",
        if_add_node_summary: "yes",
      },
      default_retrieval_config: {
        method: "tree_search",
        top_k: 5,
        retrieval_model: "gpt-5-mini",
        context_mode: "text",
      },
    },
    full_document: {
      label: "Full Document (document-level)",
      compatible_retrievers: ["vector_search", "full_text", "hybrid"],
      retriever_labels: {
        vector_search: "Vector search",
        full_text: "Full-text search",
        hybrid: "Hybrid (vector + full-text)",
      },
      default_retrieval_method: "hybrid",
      supports_reranker: true,
      default_indexing_config: {
        strategy: "full_document",
        summary_model: "gpt-5-mini",
        embedding_model: "text-embedding-3-small",
      },
      default_retrieval_config: {
        method: "hybrid",
        top_k: 5,
        context_mode: "text",
        ts_language: "english",
      },
    },
    graph_index: {
      label: "GraphIndex (graph-based)",
      compatible_retrievers: ["vector_search", "full_text", "hybrid"],
      retriever_labels: {
        vector_search: "Vector search",
        full_text: "Full-text search",
        hybrid: "Hybrid (vector + full-text)",
      },
      default_retrieval_method: "hybrid",
      supports_reranker: true,
      default_indexing_config: {
        strategy: "graph_index",
        model: "gpt-5-mini",
        enrichment_model: "gpt-5-mini",
        embedding_model: "text-embedding-3-small",
        if_add_node_summary: "yes",
      },
      default_retrieval_config: {
        method: "hybrid",
        top_k: 5,
        context_mode: "text",
        ts_language: "english",
      },
    },
    doc2json: {
      label: "Doc2JSON (structured extraction)",
      compatible_retrievers: ["vector_search", "full_text", "hybrid"],
      retriever_labels: {
        vector_search: "Vector search",
        full_text: "Full-text search",
        hybrid: "Hybrid (vector + full-text)",
      },
      default_retrieval_method: "hybrid",
      supports_reranker: true,
      default_indexing_config: {
        strategy: "doc2json",
        extraction_model: "gpt-5-mini",
        embedding_model: "text-embedding-3-small",
        window_size: 4000,
        window_overlap: 200,
        use_images: false,
        pages_per_window: 3,
        json_schema: {},
      },
      default_retrieval_config: {
        method: "hybrid",
        top_k: 5,
        context_mode: "text",
        ts_language: "english",
      },
    },
  },
  reranker: {
    default_model: "cohere/rerank-english-v3.0",
    candidate_count: 20,
    options: [
      { value: "cohere/rerank-english-v3.0", label: "Cohere Rerank English v3", provider: "Cohere" },
      { value: "cohere/rerank-multilingual-v3.0", label: "Cohere Rerank Multilingual v3", provider: "Cohere" },
      { value: "jina_ai/jina-reranker-v2-base-multilingual", label: "Jina Reranker v2", provider: "Jina AI" },
      { value: "voyage/rerank-2.5", label: "Voyage Rerank 2.5", provider: "Voyage" },
      { value: "voyage/rerank-2.5-lite", label: "Voyage Rerank 2.5 Lite", provider: "Voyage" },
      { value: "zerank-2", label: "ZeroEntropy zerank-2", provider: "ZeroEntropy" },
    ],
  },
  query_enrichment: { model: "gpt-5-mini" },
  enrichment: { model: "gpt-5-mini", max_tokens: 2000 },
  hybrid_vector_weight: 0.5,
  extraction: {
    default_method: "auto",
    fallback_chain: ["lighton", "fitz", "pdfplumber"],
    options: [
      { value: "auto", label: "Auto (recommended)", description: "Uses fallback chain: tries each method in order until one succeeds." },
      { value: "mistral", label: "Mistral OCR", description: "Best for scanned PDFs. Requires MISTRAL_API_KEY." },
      { value: "paddleocr", label: "PaddleOCR", description: "PaddleOCR-VL API. Requires PADDLEOCR_API_KEY." },
      { value: "lighton", label: "LightOn OCR", description: "LightOn OCR API. Requires LIGHTON_API_KEY." },
      { value: "llamaparse", label: "LlamaParse (Advanced OCR)", description: "Advanced OCR for complex PDFs. Requires LLAMAPARSE_API_KEY. Billed per page at the advanced-OCR rate." },
      { value: "opendataloader", label: "OpenDataLoader", description: "High-accuracy structural extraction." },
      { value: "fitz", label: "PyMuPDF (fitz)", description: "Fast, good for text-based PDFs." },
      { value: "pdfplumber", label: "pdfplumber", description: "Reliable fallback for edge cases." },
    ],
  },
};

/** Module-level cache keyed by ref. */
const cache: Record<string, KBDefaults> = {};

export function useKBDefaults() {
  const { ref } = useParams();
  const cacheKey = (ref as string) ?? "";
  const fetchedRef = useRef<string | null>(null);

  const [defaults, setDefaults] = useState<KBDefaults>(
    cache[cacheKey] ?? FALLBACK_DEFAULTS
  );
  const [isLoading, setIsLoading] = useState(!cache[cacheKey]);

  useEffect(() => {
    if (!ref) return;
    if (fetchedRef.current === cacheKey) return;

    let cancelled = false;
    (async () => {
      try {
        const accessToken = await getAccessToken() || "";
        const data = await kbDefaultsApi.get(accessToken, ref as string);
        if (cancelled) return;
        fetchedRef.current = cacheKey;
        cache[cacheKey] = data;
        setDefaults(data);
      } catch {
        // Keep using fallback -- ref NOT set, so next render will retry
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [ref, cacheKey]);

  return { defaults, isLoading };
}
