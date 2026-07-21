import Link from 'next/link'

import { getDocsLandingUrl } from '@/lib/constants/docs'

export const ObservabilityOverviewFooter = () => {
  return (
    <div className="py-12 flex items-center justify-center">
      <p className="text-sm text-foreground-light">
        <Link
          href={getDocsLandingUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-2 decoration-foreground-muted hover:decoration-foreground transition-all"
        >
          View our troubleshooting guides
        </Link>{' '}
        for solutions to common Powabase issues.{' '}
      </p>
    </div>
  )
}
