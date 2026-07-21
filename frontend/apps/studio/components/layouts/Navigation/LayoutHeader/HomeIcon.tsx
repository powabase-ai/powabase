import Link from 'next/link'
import { useRouter } from 'next/router'
import { cn } from 'ui'

import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

export const HomeIcon = ({ className }: { className?: string }) => {
  const largeLogo = useIsFeatureEnabled('branding:large_logo')
  const router = useRouter()

  return (
    <Link href="/organizations" className={cn('items-center justify-center flex-shrink-0 flex', className)}>
      <img
        alt="Powabase"
        src={`${router.basePath}/img/powabase-logo.svg`}
        className={largeLogo ? 'h-[20px]' : 'h-[18px]'}
      />
    </Link>
  )
}
