import { BookOpen } from 'lucide-react'
import { Button } from 'ui'

import { getDocsLandingUrl } from '@/lib/constants/docs'

interface DocsButtonProps {
  /** Ignored — Powabase docs have a single landing page. Kept for callsite compatibility. */
  href?: string
  abbrev?: boolean
  className?: string
}

export const DocsButton = ({ abbrev = true, className }: DocsButtonProps) => {
  return (
    <Button
      asChild
      type="default"
      className={className}
      icon={<BookOpen />}
      onClick={(e) => e.stopPropagation()}
    >
      <a target="_blank" rel="noopener noreferrer" href={getDocsLandingUrl()}>
        {abbrev ? 'Docs' : 'Documentation'}
      </a>
    </Button>
  )
}
