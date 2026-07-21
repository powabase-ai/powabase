import { useParams } from 'common'
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import DefaultLayout from '@/components/layouts/DefaultLayout'
import AILayout from '@/components/layouts/AILayout/AILayout'
import type { NextPageWithLayout } from '@/types'
import Link from "next/link";
import { Search, Plus, ChevronRight, ChevronDown, FileText, Download, Trash2, Eye, XCircle, Upload, HardDriveDownload, Globe } from "lucide-react";
import { sourcesApi, projectApiUrl, hasAiAuth, SessionExpiredError, DuplicateSourceError } from "@/lib/ai-api";
import type { DuplicateHit } from "@/components/interfaces/Sources/DuplicateSourceDialog";
import { StorageFilePicker } from "@/components/interfaces/AI/Sources/StorageFilePicker";
import { DuplicateSourceDialog } from "@/components/interfaces/Sources/DuplicateSourceDialog";
import { useProjectSupabaseClient, Source } from "@/hooks/ai/useProjectSupabaseClient";
import { useKBDefaults } from "@/hooks/useKBDefaults";
import {
  Button_Shadcn_ as Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Checkbox_Shadcn_ as Checkbox,
} from "ui";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/interfaces/AI/Shared/StatusPill";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const SORT_OPTIONS: Array<{ label: string; value: "created_at" | "name" }> = [
  { label: "Sort by created at", value: "created_at" },
  { label: "Sort by name", value: "name" },
];

const PAGE_SIZE = 50;

const SourcesListPage: NextPageWithLayout = () => {
  const { ref } = useParams()
  const { token, isReady } = useProjectSupabaseClient();
  const { defaults } = useKBDefaults();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"created_at" | "name">("created_at");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);

  const [cancellingSourceId, setCancellingSourceId] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dedup, setDedup] = useState<{
    duplicates: DuplicateHit[];
    successCount: number;
  }>({ duplicates: [], successCount: 0 });
  const [showStoragePicker, setShowStoragePicker] = useState(false);
  const [showUrlImportModal, setShowUrlImportModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [extractionModel, setExtractionModel] = useState("auto");
  const [isUploading, setIsUploading] = useState(false);

  // URL import state
  const [urlImportMode, setUrlImportMode] = useState<"urls" | "crawl" | "sitemap">("urls");
  const [urlInput, setUrlInput] = useState("");
  const [urlMaxPages, setUrlMaxPages] = useState(50);
  const [isImportingUrls, setIsImportingUrls] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const queryClient = useQueryClient();

  const sourcesQuery = useInfiniteQuery({
    queryKey: ['sources', ref, debouncedSearch, sortBy],
    queryFn: async ({ pageParam }) => {
      if (!isReady || !hasAiAuth(token)) throw new Error('not ready');
      const start = pageParam as number;

      // Server-side substring match on name (case-insensitive), sort by
      // name asc or created_at desc with an id tiebreak — see
      // routes/sources.py:list_sources (parse_list_params).
      const res = await sourcesApi.list(token, ref as string, {
        limit: PAGE_SIZE,
        offset: start,
        q: debouncedSearch || undefined,
        sort: sortBy,
        order: sortBy === 'name' ? 'asc' : 'desc',
      });
      return {
        items: res.items as Source[],
        total: res.total,
        offset: start,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
    enabled: Boolean(isReady && hasAiAuth(token)),
    placeholderData: keepPreviousData,
  });

  const visibleSources = useMemo(
    () => sourcesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [sourcesQuery.data]
  );
  const isLoading = sourcesQuery.isLoading;

  useEffect(() => {
    if (sourcesQuery.error) {
      setError(sourcesQuery.error instanceof Error
        ? sourcesQuery.error.message
        : 'Failed to fetch sources');
    }
  }, [sourcesQuery.error]);

  // Clear selection when search/sort changes the result set
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, sortBy]);

  const allSelected = visibleSources.length > 0 && visibleSources.every((s) => selectedIds.has(s.id));
  const someSelected = visibleSources.some((s) => selectedIds.has(s.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleSources.map((s) => s.id)));
    }
  }, [allSelected, visibleSources]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleSources.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 64,
    overscan: 8,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (el) => el?.getBoundingClientRect().height
        : undefined,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = sourcesQuery;

  const handleScroll = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleBulkDelete = async () => {
    if (!isReady || !hasAiAuth(token) || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const ids = [...selectedIds];
      for (const id of ids) {
        await sourcesApi.delete(token, ref as string, id);
      }
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['sources', ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady || !hasAiAuth(token) || uploadFiles.length === 0) return;
    setIsUploading(true);
    setError(null);
    const collectedDuplicates: DuplicateHit[] = [];
    const otherErrors: string[] = [];
    let successCount = 0;
    for (const file of uploadFiles) {
      const name = uploadFiles.length === 1 ? (uploadName || undefined) : undefined;
      try {
        await sourcesApi.upload(token, ref!, file, name, undefined, extractionModel);
        successCount++;
      } catch (err) {
        if (err instanceof DuplicateSourceError) {
          collectedDuplicates.push({
            uploadedName: name ?? file.name,
            existing: err.duplicate,
          });
        } else if (err instanceof SessionExpiredError) {
          // Constructor toasts once. No further work for us — user must refresh.
          if (successCount > 0) {
            queryClient.invalidateQueries({ queryKey: ['sources', ref] });
          }
          setIsUploading(false);
          return;
        } else {
          otherErrors.push(err instanceof Error ? err.message : "Upload failed");
        }
      }
    }
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['sources', ref] });
    }
    if (otherErrors.length > 0) {
      setError(otherErrors.join("; "));
    }
    if (collectedDuplicates.length > 0) {
      setDedup({ duplicates: collectedDuplicates, successCount });
      setUploadFiles([]);
      setUploadName("");
      setExtractionModel("auto");
      setShowUploadModal(false);
    } else if (otherErrors.length === 0) {
      setUploadFiles([]);
      setUploadName("");
      setExtractionModel("auto");
      setShowUploadModal(false);
      router.push(`/project/${ref}/sources`);
    }
    setIsUploading(false);
  };

  const handleDownload = async (sourceId: string, sourceName: string) => {
    if (!isReady || !hasAiAuth(token)) return;
    try {
      const response = await fetch(
        projectApiUrl(ref!, `/sources/${sourceId}/download`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) throw new SessionExpiredError();
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sourceName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleCancelExtraction = async (sourceId: string) => {
    if (!isReady || !hasAiAuth(token)) return;
    setCancellingSourceId(sourceId);
    try {
      await sourcesApi.cancelExtraction(token, ref!, sourceId);
      queryClient.invalidateQueries({ queryKey: ['sources', ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingSourceId(null);
    }
  };

  const handleDelete = async (sourceId: string, name: string) => {
    if (!isReady || !hasAiAuth(token) || !confirm(`Delete source "${name}"? This cannot be undone.`)) return;
    try {
      await sourcesApi.delete(token, ref as string, sourceId);
      setSelectedIds((prev) => {
        if (!prev.has(sourceId)) return prev;
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['sources', ref] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header - centered */}
        <div className="px-6 py-6 border-b border-muted shrink-0">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-2">Sources</h1>
            <p className="text-foreground-light">Upload and manage document sources for this project</p>
          </div>
        </div>

        {error && (
          <div className="max-w-5xl mx-auto px-6 mt-4">
            <div className="p-4 bg-destructive-200 border border-destructive-300 rounded-lg text-destructive-600 text-sm flex items-center justify-between">
              {error}
              <button onClick={() => setError(null)} className="underline hover:no-underline">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Table section - centered with toolbar directly above */}
        <div ref={tableContainerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
          <div className="max-w-5xl mx-auto px-6 py-6">
            {/* Toolbar - directly above table */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative w-64">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sources..."
                    className={cn(
                      "w-full h-8 pl-9 pr-3 text-sm rounded-md",
                      "bg-surface-200 border border-muted",
                      "text-foreground placeholder-foreground-muted",
                      "focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                    )}
                  />
                </div>

                {/* Sort */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="gap-1.5">
                      Sorted by {sortBy === "name" ? "name" : "created at"}
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

              {/* New Source dropdown - primary action */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2 flex items-center gap-1.5">
                    <Plus size={14} />
                    New Source
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setShowUploadModal(true)}>
                    <Upload size={14} className="mr-2" />
                    Upload files
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowStoragePicker(true)}>
                    <HardDriveDownload size={14} className="mr-2" />
                    Import from Storage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowUrlImportModal(true)}>
                    <Globe size={14} className="mr-2" />
                    Import from URL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-foreground font-medium">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-foreground-light text-xs"
                  >
                    Deselect all
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowBulkDeleteDialog(true)}
                >
                  <Trash2 size={14} />
                  Delete selected
                </Button>
              </div>
            )}

            <div className="border border-muted rounded-lg overflow-x-auto bg-surface-100">
            {!isLoading && visibleSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                {searchQuery.trim() ? (
                  <>
                    <p className="text-foreground-light text-sm mb-2">No results found</p>
                    <p className="text-foreground-muted text-xs text-center max-w-sm">
                      Your search for &quot;{searchQuery}&quot; did not return any results
                    </p>
                  </>
                ) : (
                  <>
                    <FileText size={40} className="text-foreground-muted mb-4" />
                    <p className="text-foreground-light text-sm mb-2">No sources yet</p>
                    <p className="text-foreground-muted text-xs mb-4 text-center max-w-sm">
                      Upload documents to get started. Supported formats include PDF, Markdown, text files, Word, and images.
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2 flex items-center gap-1.5">
                          <Plus size={14} />
                          New Source
                          <ChevronDown size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-48">
                        <DropdownMenuItem onClick={() => setShowUploadModal(true)}>
                          <Upload size={14} className="mr-2" />
                          Upload files
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowStoragePicker(true)}>
                          <HardDriveDownload size={14} className="mr-2" />
                          Import from Storage
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowUrlImportModal(true)}>
                          <Globe size={14} className="mr-2" />
                          Import from URL
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted bg-surface-100">
                    <th className="w-12 px-4 py-3">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all sources"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground-muted uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-foreground-muted uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalSize = rowVirtualizer.getTotalSize();
                    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
                    const paddingBottom =
                      virtualItems.length > 0
                        ? totalSize - virtualItems[virtualItems.length - 1].end
                        : 0;
                    return (
                      <>
                        {paddingTop > 0 && (
                          <tr aria-hidden="true" style={{ height: paddingTop }}>
                            <td colSpan={6} />
                          </tr>
                        )}
                        {virtualItems.map((virtualItem) => {
                          const source = visibleSources[virtualItem.index];
                          if (!source) return null;
                          return (
                            <tr
                              key={source.id}
                              ref={rowVirtualizer.measureElement}
                              data-index={virtualItem.index}
                              className={cn(
                                "border-b border-muted last:border-b-0 hover:bg-surface-200 transition-colors",
                                selectedIds.has(source.id) && "bg-brand-200/10"
                              )}
                            >
                              <td className="w-12 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(source.id)}
                                  onCheckedChange={() => toggleSelect(source.id)}
                                  aria-label={`Select ${source.name}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/project/${ref}/sources/${source.id}`}
                                  className="flex items-center gap-2 group"
                                >
                                  <FileText size={16} className="text-foreground-muted shrink-0" />
                                  <div>
                                    <span className="text-foreground font-medium group-hover:text-brand-600 transition-colors">
                                      {source.name}
                                    </span>
                                    <p className="text-foreground-muted text-xs font-mono truncate max-w-[200px]">
                                      {source.id}
                                    </p>
                                  </div>
                                  <ChevronRight
                                    size={14}
                                    className="text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                  />
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-foreground-light">{source.file_type || "—"}</td>
                              <td className="px-4 py-3"><StatusPill status={source.extraction_status} /></td>
                              <td className="px-4 py-3 text-foreground-light">
                                {source.created_at ? new Date(source.created_at).toLocaleString() : "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {(source.extraction_status === "pending" || source.extraction_status === "extracting") && (
                                    <button
                                      onClick={() => handleCancelExtraction(source.id)}
                                      disabled={cancellingSourceId === source.id}
                                      className="p-1.5 rounded text-foreground-muted hover:text-amber-400 hover:bg-amber-400/10 transition disabled:opacity-50"
                                      title="Cancel extraction"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  )}
                                  <Link
                                    href={`/project/${ref}/sources/${source.id}`}
                                    className="p-1.5 rounded text-foreground-muted hover:text-foreground hover:bg-surface-200 transition"
                                    title="View"
                                  >
                                    <Eye size={14} />
                                  </Link>
                                  <button
                                    onClick={() => handleDownload(source.id, source.name)}
                                    className="p-1.5 rounded text-foreground-muted hover:text-foreground hover:bg-surface-200 transition"
                                    title="Download"
                                  >
                                    <Download size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(source.id, source.name)}
                                    className="p-1.5 rounded text-foreground-muted hover:text-destructive-600 hover:bg-destructive-200 transition"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {paddingBottom > 0 && (
                          <tr aria-hidden="true" style={{ height: paddingBottom }}>
                            <td colSpan={6} />
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <Dialog
        open={showUploadModal}
        onOpenChange={(open) => {
          // Block Escape/overlay-click while uploading so we don't strand
          // an in-flight loop that still mutates state behind a closed modal.
          if (isUploading && !open) return;
          setShowUploadModal(open);
          if (!open) {
            setUploadFiles([]);
            setUploadName("");
            setExtractionModel("auto");
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-surface-100 border-default p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground">Upload sources</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload}>
            <div className="space-y-4 py-4">
              <div>
                <label htmlFor="upload-source-file" className="block text-sm text-foreground-light mb-1.5">
                  Files
                </label>
                <input
                  id="upload-source-file"
                  type="file"
                  multiple
                  accept=".pdf,.md,.txt,.docx,.png,.jpg,.jpeg,.webp,.gif,.tiff"
                  onChange={(e) => setUploadFiles(e.target.files ? Array.from(e.target.files) : [])}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm rounded-lg",
                    "bg-surface-200 border border-default",
                    "text-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0",
                    "file:bg-brand-400 file:text-white file:text-sm file:cursor-pointer"
                  )}
                  required
                />
                <p className="text-xs text-foreground-muted mt-1">
                  Supported: PDF, Markdown (.md), Text (.txt), Word (.docx), Images (PNG, JPG, WebP, GIF, TIFF)
                </p>
                {uploadFiles.length > 1 && (
                  <p className="text-xs text-foreground-muted mt-1.5">
                    {uploadFiles.length} files selected
                  </p>
                )}
              </div>
              {uploadFiles.length <= 1 && (
                <div>
                  <label className="block text-sm text-foreground-light mb-1.5">
                    Display name (optional)
                  </label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Defaults to filename"
                    className={cn(
                      "w-full px-4 py-2.5 text-sm rounded-lg",
                      "bg-surface-200 border border-default",
                      "text-foreground placeholder-foreground-muted",
                      "focus:outline-none focus:ring-1 focus:ring-brand-400"
                    )}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-foreground-light mb-1.5">
                  Extraction model
                </label>
                <select
                  value={extractionModel}
                  onChange={(e) => setExtractionModel(e.target.value)}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm rounded-lg",
                    "bg-surface-200 border border-default",
                    "text-foreground",
                    "focus:outline-none focus:ring-1 focus:ring-brand-400"
                  )}
                >
                  {(defaults.extraction?.options ?? [
                    { value: "auto", label: "Auto (recommended)", description: "Uses fallback chain." },
                    { value: "mistral", label: "Mistral OCR", description: "Best for scanned PDFs." },
                    { value: "paddleocr", label: "PaddleOCR", description: "PaddleOCR-VL API." },
                    { value: "lighton", label: "LightOn OCR", description: "LightOn OCR API." },
                    { value: "llamaparse", label: "LlamaParse (Advanced OCR)", description: "Advanced OCR for complex PDFs." },
                    { value: "opendataloader", label: "OpenDataLoader", description: "High-accuracy structural extraction." },
                    { value: "fitz", label: "PyMuPDF (fitz)", description: "Fast, text-based PDFs." },
                    { value: "pdfplumber", label: "pdfplumber", description: "Reliable fallback." },
                  ]).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-foreground-muted mt-1">
                  How to extract text content. Auto uses the best method for each file type.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isUploading}
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFiles([]);
                  setUploadName("");
                  setExtractionModel("auto");
                }}
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={isUploading || uploadFiles.length === 0}
                className="px-4 py-2 bg-brand-400 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2"
              >
                {isUploading ? "Uploading..." : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} files` : "Upload"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import from Storage modal */}
      <StorageFilePicker
        open={showStoragePicker}
        onClose={() => setShowStoragePicker(false)}
        onSelect={async (selection) => {
          if (!isReady || !hasAiAuth(token)) return;
          try {
            await sourcesApi.importFromStorage(token, ref!, {
              bucket: selection.bucket,
              path: selection.path,
              name: selection.fileName.replace(/\.[^.]+$/, ''),
            });
            setShowStoragePicker(false);
            queryClient.invalidateQueries({ queryKey: ['sources', ref] });
          } catch (err) {
            if (err instanceof DuplicateSourceError) {
              setDedup({
                duplicates: [{ uploadedName: selection.fileName, existing: err.duplicate }],
                successCount: 0,
              });
              setShowStoragePicker(false);
              return;
            }
            setError(err instanceof Error ? err.message : "Import failed");
            setShowStoragePicker(false);
          }
        }}
      />

      {/* URL Import Modal */}
      <Dialog open={showUrlImportModal} onOpenChange={(open) => {
        setShowUrlImportModal(open);
        if (!open) { setUrlInput(""); setUrlImportMode("urls"); }
      }}>
        <DialogContent className="sm:max-w-lg p-6">
          <DialogHeader>
            <DialogTitle>Import from URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Mode selector */}
            <div className="flex gap-2">
              {(["urls", "crawl", "sitemap"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setUrlImportMode(m); setUrlInput(""); }}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md border transition-colors",
                    urlImportMode === m
                      ? "bg-brand-400 text-white border-brand-400"
                      : "bg-surface-200 text-foreground-light border-default hover:border-strong"
                  )}
                >
                  {m === "urls" ? "URL list" : m === "crawl" ? "Crawl page" : "Sitemap"}
                </button>
              ))}
            </div>

            {urlImportMode === "urls" ? (
              <div>
                <label className="block text-sm text-foreground-light mb-1.5">
                  URLs (one per line)
                </label>
                <textarea
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={"https://example.com/page1\nhttps://example.com/page2"}
                  rows={6}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm rounded-lg font-mono",
                    "bg-surface-200 border border-default",
                    "text-foreground placeholder-foreground-muted",
                    "focus:outline-none focus:ring-1 focus:ring-brand-400",
                    "resize-y"
                  )}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-foreground-light mb-1.5">
                  {urlImportMode === "crawl" ? "URL to crawl" : "Sitemap URL"}
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={urlImportMode === "crawl" ? "https://example.com" : "https://example.com/sitemap.xml"}
                  className={cn(
                    "w-full px-4 py-2.5 text-sm rounded-lg",
                    "bg-surface-200 border border-default",
                    "text-foreground placeholder-foreground-muted",
                    "focus:outline-none focus:ring-1 focus:ring-brand-400"
                  )}
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-foreground-light mb-1.5">
                Max pages
              </label>
              <input
                type="number"
                value={urlMaxPages}
                onChange={(e) => setUrlMaxPages(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                min={1}
                max={200}
                className={cn(
                  "w-24 px-4 py-2.5 text-sm rounded-lg",
                  "bg-surface-200 border border-default",
                  "text-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-brand-400"
                )}
              />
              <p className="text-xs text-foreground-muted mt-1">
                {urlImportMode === "urls"
                  ? "Maximum number of URLs to import."
                  : urlImportMode === "crawl"
                  ? "Maximum pages to discover and import from the crawled site."
                  : "Maximum pages to import from the sitemap."}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowUrlImportModal(false);
                setUrlInput("");
                setUrlImportMode("urls");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={isImportingUrls || !urlInput.trim()}
              onClick={async () => {
                if (!isReady || !hasAiAuth(token) || !urlInput.trim()) return;
                setIsImportingUrls(true);
                setError(null);
                try {
                  if (urlImportMode === "urls") {
                    const urls = urlInput
                      .split("\n")
                      .map((u) => u.trim())
                      .filter((u) => u.length > 0);
                    if (urls.length === 0) {
                      setError("Please enter at least one URL");
                      return;
                    }
                    await sourcesApi.importUrl(token, ref!, {
                      mode: "urls",
                      urls,
                      max_pages: urlMaxPages,
                    });
                  } else {
                    await sourcesApi.importUrl(token, ref!, {
                      mode: urlImportMode,
                      url: urlInput.trim(),
                      max_pages: urlMaxPages,
                    });
                  }
                  setShowUrlImportModal(false);
                  setUrlInput("");
                  setUrlImportMode("urls");
                  queryClient.invalidateQueries({ queryKey: ['sources', ref] });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "URL import failed");
                } finally {
                  setIsImportingUrls(false);
                }
              }}
            >
              {isImportingUrls ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={(open) => { if (!isBulkDeleting) setShowBulkDeleteDialog(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} source{selectedIds.size !== 1 ? "s" : ""}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground-light py-2">
            This action cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBulkDeleteDialog(false)}
              disabled={isBulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateSourceDialog
        open={dedup.duplicates.length > 0}
        onOpenChange={(open) => {
          if (!open) setDedup({ duplicates: [], successCount: 0 });
        }}
        duplicates={dedup.duplicates}
        successCount={dedup.successCount}
      />
    </div>
  );
}

SourcesListPage.getLayout = (page) => (
  <DefaultLayout>
    <AILayout title="Sources">{page}</AILayout>
  </DefaultLayout>
)

export default SourcesListPage
