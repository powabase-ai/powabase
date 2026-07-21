

import { useState } from "react"
import { useBucketsQuery, useObjectsQuery } from "@/data/storage/storage-query"
import { File, Folder, ChevronRight } from "lucide-react"

interface StorageFileSelection {
  bucket: string
  path: string
  fileName: string
}

interface StorageFilePickerProps {
  open: boolean
  onSelect: (selection: StorageFileSelection) => void
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function StorageFilePicker({ open, onSelect, onClose }: StorageFilePickerProps) {
  const { data: allBuckets = [] } = useBucketsQuery()
  // Hide internal 'sources' bucket (managed by AI pipeline)
  const buckets = allBuckets.filter(b => b.id !== 'sources')
  const [selectedBucket, setSelectedBucket] = useState<string>('')
  const [currentPath, setCurrentPath] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const activeBucket = selectedBucket || buckets[0]?.id || ''

  const { data: objects = [], isLoading: objectsLoading } = useObjectsQuery(activeBucket, currentPath)

  if (!open) return null

  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : []

  const handleBucketChange = (bucketId: string) => {
    setSelectedBucket(bucketId)
    setCurrentPath('')
    setSelectedFile(null)
  }

  const navigateToFolder = (folderName: string) => {
    const cleanName = folderName.replace(/\/$/, '')
    setCurrentPath(currentPath ? `${currentPath}/${cleanName}` : cleanName)
    setSelectedFile(null)
  }

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      setCurrentPath('')
    } else {
      setCurrentPath(pathSegments.slice(0, index + 1).join('/'))
    }
    setSelectedFile(null)
  }

  const handleSelect = () => {
    if (!selectedFile) return
    onSelect({
      bucket: activeBucket,
      path: currentPath ? `${currentPath}/${selectedFile}` : selectedFile,
      fileName: selectedFile,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-100 border border-default rounded-lg shadow-xl w-[min(600px,calc(100vw-2rem))] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-default">
          <h2 className="text-sm font-semibold text-foreground">Import from Storage</h2>
          <button
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Bucket selector */}
        <div className="px-5 py-3 border-b border-default">
          <label className="text-xs text-foreground-muted block mb-1">Bucket</label>
          <select
            className="w-full text-sm bg-surface-200 border border-default rounded px-2 py-1.5 text-foreground"
            value={activeBucket}
            onChange={e => handleBucketChange(e.target.value)}
          >
            {buckets.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Breadcrumb */}
        <div className="px-5 py-2 flex items-center gap-1 text-xs text-foreground-muted border-b border-default">
          <button
            className="hover:text-foreground transition-colors"
            onClick={() => navigateToBreadcrumb(-1)}
          >
            Root
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} />
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => navigateToBreadcrumb(i)}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[200px]">
          {objectsLoading ? (
            <p className="text-xs text-foreground-muted py-4 text-center">Loading...</p>
          ) : objects.length === 0 ? (
            <p className="text-xs text-foreground-muted py-4 text-center">No files in this location.</p>
          ) : (
            <div className="space-y-0.5">
              {objects.map(obj => {
                const isFolder = obj.name.endsWith('/')
                if (isFolder) {
                  return (
                    <button
                      key={obj.name}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-surface-200 transition-colors"
                      onClick={() => navigateToFolder(obj.name)}
                    >
                      <Folder size={14} className="text-foreground-muted shrink-0" />
                      <span className="text-sm text-foreground">{obj.name.replace(/\/$/, '')}</span>
                    </button>
                  )
                }
                const isSelected = selectedFile === obj.name
                return (
                  <div
                    key={obj.name}
                    data-file-row
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-brand-200 border border-brand-400'
                        : 'hover:bg-surface-200'
                    }`}
                    onClick={() => setSelectedFile(obj.name)}
                  >
                    <File size={14} className="text-foreground-muted shrink-0" />
                    <span className="text-sm text-foreground flex-1 truncate">{obj.name}</span>
                    {typeof obj.metadata?.size === 'number' && (
                      <span className="text-xs text-foreground-muted shrink-0">
                        {formatBytes(obj.metadata.size as number)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-default">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            data-select-btn
            disabled={!selectedFile}
            onClick={handleSelect}
            className="px-4 py-1.5 text-sm rounded bg-brand-400 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  )
}
