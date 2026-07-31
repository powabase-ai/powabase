import { useParams } from 'common'
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ChevronRight, Download, ImageOff, RefreshCw, Trash2 } from "lucide-react";
import { sourcesApi, projectApiUrl, hasAiAuth, aiAuthHeader, SessionExpiredError } from "@/lib/ai-api";
import DefaultLayout from '@/components/layouts/DefaultLayout'
import AILayout from '@/components/layouts/AILayout/AILayout'
import type { NextPageWithLayout } from '@/types'
import { useProjectSupabaseClient, Source } from "@/hooks/ai/useProjectSupabaseClient";
import { Button_Shadcn_ as Button } from "ui";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "ui";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/interfaces/AI/Shared/MarkdownText";
import { MarkdownToggle } from "@/components/interfaces/AI/Shared/MarkdownToggle";
import { StatusPill } from "@/components/interfaces/AI/Shared/StatusPill";

/** Return the number of page_text derivatives (0 if none). */
function getPageTextDerivativeCount(derivatives: Record<string, unknown>): number {
  const pt = derivatives?.page_text;
  return Array.isArray(pt) ? pt.length : 0;
}

function getImageDerivativeCount(derivatives: Record<string, unknown>): number {
  const img = derivatives?.image;
  return Array.isArray(img) ? img.length : 0;
}

const SourceDetailPage: NextPageWithLayout = () => {
  const { ref, source_id: sourceIdParam } = useParams()
  const { token, isReady } = useProjectSupabaseClient();
  const router = useRouter();
  const sourceId = sourceIdParam as string;

  const [source, setSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [textDerivativeContent, setTextDerivativeContent] = useState<string | null>(null);
  const [textDerivativeLoading, setTextDerivativeLoading] = useState(false);
  const [textDerivativeError, setTextDerivativeError] = useState<string | null>(null);
  // Per-page lazy loading caches
  const [pageCache, setPageCache] = useState<Record<number, string>>({});
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  // Per-page image cache (blob URLs)
  const [imageCache, setImageCache] = useState<Record<number, string | null>>({});
  const [imageLoading, setImageLoading] = useState(false);
  const imageCacheRef = useRef(imageCache);
  imageCacheRef.current = imageCache;

  useEffect(() => {
    if (!isReady || !hasAiAuth(token)) return;
    const fetchSource = async () => {
      try {
        const data = await sourcesApi.get(token, ref as string, sourceId);
        setSource(data as Source);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load source");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSource();
  }, [isReady, token, ref, sourceId]);

  // Clear caches on source change
  useEffect(() => {
    // Revoke old blob URLs before clearing
    Object.values(imageCache).forEach((url) => { if (url) URL.revokeObjectURL(url); });
    setPageCache({});
    setImageCache({});
    setPageError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(imageCacheRef.current).forEach((url) => { if (url) URL.revokeObjectURL(url); });
    };
  }, []);

  const derivatives = source?.derivatives && typeof source.derivatives === "object" ? source.derivatives as Record<string, unknown> : {};
  const extractionMethod =
    source?.auto_metadata && typeof source.auto_metadata === "object"
      ? (source.auto_metadata as { extraction_method?: string }).extraction_method
      : undefined;
  const storagePageCount = getPageTextDerivativeCount(derivatives);
  const imageDerivativeCount = getImageDerivativeCount(derivatives);
  const hasImages = imageDerivativeCount > 0;
  const hasTextDerivative =
    storagePageCount === 0 &&
    ((Array.isArray(derivatives.markdown) && derivatives.markdown.length > 0) ||
    (Array.isArray(derivatives.text) && derivatives.text.length > 0));
  const totalPages = hasTextDerivative
    ? (textDerivativeContent !== null ? 1 : 0)
    : storagePageCount;

  const currentPageText = hasTextDerivative
    ? textDerivativeContent
    : (pageCache[selectedPageIndex] ?? null);
  const currentPageImage = imageCache[selectedPageIndex] ?? null;

  useEffect(() => {
    if (!isReady || !hasAiAuth(token) || !source || !hasTextDerivative) {
      setTextDerivativeContent(null);
      setTextDerivativeError(null);
      return;
    }
    let cancelled = false;
    setTextDerivativeLoading(true);
    setTextDerivativeError(null);
    (async () => {
      try {
        const derivType = Array.isArray(derivatives.markdown) && derivatives.markdown.length > 0
          ? "markdown" : "text";
        const url = projectApiUrl(ref!,
          `/sources/${sourceId}/derivatives/${derivType}/download?index=0`);
        const response = await fetch(url, {
          headers: aiAuthHeader(token),
        });
        if (response.status === 401) throw new SessionExpiredError();
        if (cancelled) return;
        if (!response.ok) throw new Error("Failed to fetch derivative content");
        const text = await response.text();
        if (cancelled) return;
        setTextDerivativeContent(text);
      } catch (err) {
        if (!cancelled) {
          setTextDerivativeError(err instanceof Error ? err.message : "Failed to load extracted text");
        }
      } finally {
        if (!cancelled) setTextDerivativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, token, ref, sourceId, source, hasTextDerivative, derivatives.markdown]);

  // Per-page lazy fetch: load the currently selected page text from storage
  useEffect(() => {
    if (storagePageCount === 0 || !isReady || !hasAiAuth(token)) return;
    if (pageCache[selectedPageIndex] !== undefined) {
      setPageLoading(false);
      return;
    }

    let cancelled = false;
    setPageLoading(true);
    setPageError(null);
    (async () => {
      try {
        const res = await sourcesApi.getPageText(token, ref!, sourceId, selectedPageIndex + 1);
        if (!cancelled) {
          setPageCache(prev => ({ ...prev, [selectedPageIndex]: res.text }));
        }
      } catch (err) {
        if (!cancelled) {
          setPageError("Failed to load page");
          console.warn("Failed to load page text", err);
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageIndex, storagePageCount, isReady, token, ref, sourceId]);

  // Per-page lazy fetch: load the currently selected page image
  useEffect(() => {
    if (!hasImages || !isReady || !hasAiAuth(token)) return;
    if (imageCache[selectedPageIndex] !== undefined) {
      setImageLoading(false);
      return;
    }

    let cancelled = false;
    setImageLoading(true);
    (async () => {
      try {
        const blobUrl = await sourcesApi.getSourcePageImage(token, ref!, sourceId, selectedPageIndex);
        if (!cancelled) {
          setImageCache(prev => ({ ...prev, [selectedPageIndex]: blobUrl }));
        }
      } catch {
        if (!cancelled) {
          setImageCache(prev => ({ ...prev, [selectedPageIndex]: null }));
        }
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageIndex, hasImages, isReady, token, ref, sourceId]);

  // Clamp selectedPageIndex when totalPages changes
  useEffect(() => {
    setSelectedPageIndex((i) => (totalPages > 0 && i >= totalPages ? 0 : i));
  }, [totalPages]);

  const handleDownload = async () => {
    if (!isReady || !hasAiAuth(token)) return;
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(
        projectApiUrl(ref!, `/sources/${sourceId}/download`),
        { headers: aiAuthHeader(token) }
      );
      if (response.status === 401) throw new SessionExpiredError();
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = source?.name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!isReady || !hasAiAuth(token) || !source || !confirm(`Delete "${source.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      await sourcesApi.delete(token, ref as string, sourceId);
      router.push(`/project/${ref}/sources`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReextract = async () => {
    if (!isReady || !hasAiAuth(token) || !source) return;
    setIsReextracting(true);
    setError(null);
    try {
      await sourcesApi.reextract(token, ref!, sourceId);
      // Re-fetch source row to pick up the pending status
      const data = await sourcesApi.get(token, ref!, sourceId);
      setSource(data as Source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extract failed");
    } finally {
      setIsReextracting(false);
    }
  };

  const handleStartEditMetadata = () => {
    const meta = (source?.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, unknown> : {};
    setMetadataDraft(JSON.stringify(meta, null, 2));
    setMetadataError(null);
    setIsEditingMetadata(true);
  };
  const handleCancelEditMetadata = () => {
    setIsEditingMetadata(false);
    setMetadataError(null);
    setMetadataDraft("");
  };
  const handleSaveMetadata = async () => {
    if (!isReady || !hasAiAuth(token) || !source) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(metadataDraft || "{}");
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        throw new Error("Metadata must be a JSON object");
      }
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    setIsSavingMetadata(true);
    setMetadataError(null);
    try {
      await sourcesApi.update(token, ref!, sourceId, { metadata: parsed });
      // Re-fetch to reflect persisted value
      const data = await sourcesApi.get(token, ref!, sourceId);
      setSource(data as Source);
      setIsEditingMetadata(false);
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const renderPagination = useCallback(() => {
    if (totalPages <= 1) return null;
    return (
      <Pagination className="justify-start shrink-0">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedPageIndex((i) => Math.max(0, i - 1));
              }}
              className={
                selectedPageIndex === 0
                  ? "pointer-events-none opacity-50"
                  : "cursor-pointer"
              }
              aria-disabled={selectedPageIndex === 0}
            />
          </PaginationItem>
          {(() => {
            const total = totalPages;
            const showAll = total <= 7;
            const showEllipsisStart = !showAll && selectedPageIndex > 2;
            const showEllipsisEnd = !showAll && selectedPageIndex < total - 3;
            let start: number;
            let end: number;
            if (showAll) {
              start = 0;
              end = total;
            } else if (showEllipsisStart && showEllipsisEnd) {
              start = Math.max(0, selectedPageIndex - 1);
              end = Math.min(total, selectedPageIndex + 2);
            } else if (showEllipsisStart) {
              start = Math.max(0, total - 5);
              end = total;
            } else {
              start = 0;
              end = Math.min(5, total);
            }
            const indices: (number | "ellipsis")[] = showAll
              ? [...Array(total)].map((_, i) => i)
              : [
                  ...(start > 0 ? [0] : []),
                  ...(showEllipsisStart ? (["ellipsis"] as const) : []),
                  ...[...Array(end - start)].map((_, i) => start + i),
                  ...(showEllipsisEnd ? (["ellipsis"] as const) : []),
                  ...(end < total ? [total - 1] : []),
                ];
            return indices.map((key, idx) =>
              key === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={key}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedPageIndex(key as number);
                    }}
                    isActive={selectedPageIndex === key}
                    className="cursor-pointer"
                  >
                    {(key as number) + 1}
                  </PaginationLink>
                </PaginationItem>
              )
            );
          })()}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedPageIndex((i) =>
                  Math.min(totalPages - 1, i + 1)
                );
              }}
              className={
                selectedPageIndex === totalPages - 1
                  ? "pointer-events-none opacity-50"
                  : "cursor-pointer"
              }
              aria-disabled={selectedPageIndex === totalPages - 1}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  }, [totalPages, selectedPageIndex]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !source) {
    return (
      <div className="p-8">
        <div className="text-destructive-600">{error}</div>
        <Link
          href={`/project/${ref}/sources`}
          className="mt-4 inline-block text-brand-600 hover:text-brand-600"
        >
          ← Back to sources
        </Link>
      </div>
    );
  }

  if (!source) return null;

  const autoMeta = source.auto_metadata && typeof source.auto_metadata === "object" ? source.auto_metadata : {};
  const userMetadata = (source.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, unknown> : {};
  const userMetadataJson = JSON.stringify(userMetadata, null, 2);
  const pageCount = typeof (autoMeta as Record<string, unknown>).page_count === "number" ? (autoMeta as Record<string, unknown>).page_count as number : undefined;
  const extractedAt = typeof (autoMeta as Record<string, unknown>).extracted_at === "string" ? (autoMeta as Record<string, unknown>).extracted_at as string : undefined;
  const hasExtractedContent = totalPages > 0 || hasTextDerivative || pageLoading;

  // Determine loading/error states for content area
  const isContentLoading =
    (hasTextDerivative && textDerivativeLoading) ||
    (pageLoading && currentPageText === null);
  const contentError =
    (!hasTextDerivative && pageError && currentPageText === null)
      ? pageError
      : (hasTextDerivative && textDerivativeError)
        ? textDerivativeError
        : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header: Sources > (source name) */}
      <div className="shrink-0 px-6 py-4 border-b border-muted">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/project/${ref}/sources`}
            className="text-foreground-muted hover:text-brand-600 transition-colors"
          >
            Sources
          </Link>
          <ChevronRight size={14} className="text-foreground-muted" />
          <span className="text-foreground font-medium truncate">{source.name}</span>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm flex items-center justify-between shrink-0">
          {error}
          <Button variant="link" onClick={() => setError(null)} className="text-inherit underline-offset-2">
            Dismiss
          </Button>
        </div>
      )}

      {/* Two-panel layout: left metadata, right content */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup orientation="horizontal" className="relative h-full" autoSaveId="source-detail-layout">
          {/* Left panel: metadata and actions */}
          <ResizablePanel defaultSize="18" minSize="14" maxSize="28">
            <div className="h-full overflow-y-auto border-r border-muted bg-surface-100">
              <div className="p-4 space-y-6">
                <section>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-foreground-muted">ID</dt>
                      <dd className="text-foreground font-mono text-xs truncate mt-0.5">
                        {source.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground-muted">File type</dt>
                      <dd className="text-foreground mt-0.5">{source.file_type || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-foreground-muted">Status</dt>
                      <dd className="mt-0.5"><StatusPill status={source.extraction_status} /></dd>
                    </div>
                    <div>
                      <dt className="text-foreground-muted">Created</dt>
                      <dd className="text-foreground mt-0.5">
                        {source.created_at ? new Date(source.created_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground-muted">Updated</dt>
                      <dd className="text-foreground mt-0.5">
                        {source.updated_at ? new Date(source.updated_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                    {pageCount != null && (
                      <div>
                        <dt className="text-foreground-muted">Page count</dt>
                        <dd className="text-foreground mt-0.5">{pageCount}</dd>
                      </div>
                    )}
                    {extractionMethod && (
                      <div>
                        <dt className="text-foreground-muted">Extraction method</dt>
                        <dd className="text-foreground mt-0.5">{extractionMethod}</dd>
                      </div>
                    )}
                    {extractedAt && (
                      <div>
                        <dt className="text-foreground-muted">Extracted at</dt>
                        <dd className="text-foreground mt-0.5">
                          {new Date(extractedAt).toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {Object.keys(derivatives).length > 0 && (
                      <div>
                        <dt className="text-foreground-muted">Derivatives</dt>
                        <dd className="text-foreground mt-0.5">
                          {Object.keys(derivatives).join(", ")}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                {source.error_message && (
                  <section>
                    <div className={cn(
                      "p-3 rounded-lg text-xs",
                      source.extraction_status === "attention_required"
                        ? "bg-orange-400/30 border border-orange-300/70 text-white"
                        : "bg-destructive-200 border border-destructive-300 text-destructive-600"
                    )}>
                      {source.error_message}
                    </div>
                  </section>
                )}

                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Metadata</h4>
                    {!isEditingMetadata && (
                      <Button variant="link" size="sm" onClick={handleStartEditMetadata} className="h-auto p-0 text-xs">
                        Edit
                      </Button>
                    )}
                  </div>
                  {isEditingMetadata ? (
                    <div className="space-y-2">
                      <textarea
                        value={metadataDraft}
                        onChange={(e) => setMetadataDraft(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full h-40 p-2 text-xs font-mono bg-surface-200 border border-muted rounded resize-y text-foreground"
                      />
                      {metadataError && (
                        <div className="text-xs text-destructive-600">{metadataError}</div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="default" size="sm" onClick={handleSaveMetadata} disabled={isSavingMetadata}>
                          {isSavingMetadata ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCancelEditMetadata} disabled={isSavingMetadata}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : Object.keys(userMetadata).length === 0 ? (
                    <p className="text-xs text-foreground-muted italic">No metadata</p>
                  ) : (
                    <pre className="text-xs font-mono bg-surface-200 p-2 rounded overflow-x-auto text-foreground-light whitespace-pre-wrap break-words">
                      {userMetadataJson}
                    </pre>
                  )}
                </section>

                <hr className="border-muted" />

                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full justify-start gap-2"
                  >
                    <Download size={14} />
                    {isDownloading ? "Opening..." : "Download"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReextract}
                    disabled={isReextracting || source.extraction_status === "pending" || source.extraction_status === "extracting"}
                    className="w-full justify-start gap-2"
                  >
                    <RefreshCw size={14} />
                    {isReextracting ? "Re-extracting..." : "Re-extract"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full justify-start gap-2"
                  >
                    <Trash2 size={14} />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right panel: content */}
          <ResizablePanel defaultSize="82" minSize="50">
            <div className="h-full flex flex-col bg-default overflow-hidden">
              {hasExtractedContent ? (
                <div className="flex flex-col min-h-0 flex-1">
                  {/* Header bar: title, markdown toggle, pagination */}
                  <div className="shrink-0 px-6 py-3 border-b border-muted flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-medium text-foreground">
                        {hasImages ? "Original" : "Extracted content"}
                      </h2>
                      {hasImages && (
                        <span className="text-foreground-muted text-sm">/</span>
                      )}
                      {hasImages && (
                        <h2 className="text-sm font-medium text-foreground">Extracted</h2>
                      )}
                      <MarkdownToggle />
                    </div>
                    {renderPagination()}
                  </div>

                  {/* Content area */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {isContentLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 p-4 text-sm text-foreground-muted">
                          <div className="animate-spin h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full" />
                          Loading…
                        </div>
                      </div>
                    ) : contentError ? (
                      <div className="p-6">
                        <div className="p-4 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm">
                          {contentError}
                        </div>
                      </div>
                    ) : currentPageText !== null ? (
                      hasImages ? (
                        /* Side-by-side: original image + extracted text */
                        <div className="grid grid-cols-2 h-full min-h-0">
                          {/* Left: original page image */}
                          <div className="h-full overflow-auto border-r border-muted bg-surface-100 p-4 flex items-start justify-center">
                            {imageLoading && currentPageImage === null ? (
                              <div className="flex items-center gap-2 text-sm text-foreground-muted mt-8">
                                <div className="animate-spin h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full" />
                                Loading image…
                              </div>
                            ) : currentPageImage ? (
                              <img
                                src={currentPageImage}
                                alt={`Page ${selectedPageIndex + 1}`}
                                className="max-w-full h-auto rounded shadow-sm"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-foreground-muted mt-8">
                                <ImageOff size={24} />
                                <span className="text-xs">No image available</span>
                              </div>
                            )}
                          </div>
                          {/* Right: extracted text */}
                          <div
                            className="h-full overflow-auto p-4"
                            role="tabpanel"
                            aria-label={`Page ${selectedPageIndex + 1} extracted text`}
                          >
                            <MarkdownText
                              rawClassName="whitespace-pre-wrap break-words font-mono"
                              className="text-[13px]"
                              disableMath
                            >
                              {currentPageText}
                            </MarkdownText>
                          </div>
                        </div>
                      ) : (
                        /* Text only (no images available) */
                        <div
                          className="h-full overflow-auto p-6"
                          role="tabpanel"
                          aria-label={`Page ${selectedPageIndex + 1}`}
                        >
                          <div className="max-w-4xl">
                            <MarkdownText
                              rawClassName="whitespace-pre-wrap break-words font-mono"
                              className="text-[13px]"
                              disableMath
                            >
                              {currentPageText}
                            </MarkdownText>
                          </div>
                        </div>
                      )
                    ) : totalPages > 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 text-sm text-foreground-muted">
                          <div className="animate-spin h-4 w-4 border-2 border-brand-400 border-t-transparent rounded-full" />
                          Loading page…
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
                  <p className="text-foreground-muted text-sm">
                    No extracted content available
                  </p>
                  <p className="text-foreground-muted text-xs mt-1 max-w-sm">
                    {source.extraction_status === "pending" || source.extraction_status === "extracting"
                      ? "Extraction is in progress. Check back later."
                      : source.extraction_status === "cancelled"
                        ? "Extraction was cancelled."
                        : source.extraction_status === "failed"
                          ? "Extraction failed. Check the error message in the details panel."
                          : source.extraction_status === "attention_required"
                            ? "Extraction produced little content. Check the warning in the details panel."
                            : "Extraction may not have completed yet."}
                  </p>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

SourceDetailPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Source Detail">{page}</AILayout>
  </DefaultLayout>
)

export default SourceDetailPage
