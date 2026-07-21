import { useRouter } from 'next/router'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogTitle,
} from 'ui'

import type { DuplicateSource } from '@/lib/ai-api'

export interface DuplicateHit {
  uploadedName: string
  existing: DuplicateSource
}

interface DuplicateSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  duplicates: DuplicateHit[]
  successCount: number
}

export function DuplicateSourceDialog({
  open,
  onOpenChange,
  duplicates,
  successCount,
}: DuplicateSourceDialogProps) {
  const router = useRouter()
  const projectRef = (router.query.ref as string | undefined) ?? ''

  if (duplicates.length === 0) return null

  const uniqueDuplicates = Array.from(
    new Map(duplicates.map((d) => [d.existing.id, d])).values(),
  )

  const s = successCount
  const m = duplicates.length
  const title =
    s === 0 && m === 1
      ? 'This file is already in your sources'
      : s === 0
        ? `${m} files are already in your sources`
        : m === 1
          ? `${s} ${s === 1 ? 'file' : 'files'} uploaded; 1 was already in your sources`
          : `${s} ${s === 1 ? 'file' : 'files'} uploaded; ${m} were already in your sources`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {m === 1 && s === 0
              ? 'A source with identical content was already uploaded. Open the existing source in a new tab or close this dialog and choose a different file.'
              : 'The files below have identical content to sources already in your project. Click Open to inspect any of them in a new tab.'}
          </DialogDescription>
        </DialogHeader>

        <DialogSection className="max-h-[60vh] overflow-y-auto space-y-2 border-t">
          {uniqueDuplicates.map(({ uploadedName, existing }) => {
            const uploadedAt = existing.created_at
              ? new Date(existing.created_at).toLocaleString()
              : 'unknown date'
            const showUploadedName = uploadedName && uploadedName !== existing.name
            return (
              <div
                key={existing.id}
                className="rounded border bg-surface-200 p-3 text-sm flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  {showUploadedName && (
                    <div className="text-xs text-foreground-lighter truncate">
                      You uploaded: <span className="font-mono">{uploadedName}</span>
                    </div>
                  )}
                  <div className="font-medium truncate">
                    {existing.name ?? '(unnamed source)'}
                  </div>
                  <div className="mt-1 text-xs text-foreground-lighter">
                    {existing.file_type} · status:{' '}
                    <span className="font-mono">
                      {existing.extraction_status ?? 'unknown'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-foreground-lighter">
                    Uploaded {uploadedAt}
                  </div>
                </div>
                <Button
                  type="default"
                  disabled={!projectRef}
                  onClick={() =>
                    window.open(
                      `/project/${projectRef}/sources/${existing.id}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  Open
                </Button>
              </div>
            )
          })}
        </DialogSection>

        <DialogFooter>
          <Button type="primary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
