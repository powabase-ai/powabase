import { useFlag } from 'common'
import { PropsWithChildren } from 'react'

import { ClockSkewBanner } from '@/components/layouts/AppLayout/ClockSkewBanner'
import { NoticeBanner } from '@/components/layouts/AppLayout/NoticeBanner'
import { ConvictedAccountBanner } from '@/components/interfaces/Organization/ConvictedAccountBanner'
import { WalletBalanceBanner } from '@/components/interfaces/Organization/WalletBalanceBanner'

export const AppBannerWrapper = ({ children }: PropsWithChildren<{}>) => {
  const showNoticeBanner = useFlag('showNoticeBanner')
  const clockSkewBanner = useFlag('clockSkewBanner')

  return (
    <div className="flex flex-col">
      <div className="flex-shrink-0">
        {showNoticeBanner && <NoticeBanner />}
        {clockSkewBanner && <ClockSkewBanner />}
        <ConvictedAccountBanner />
        <WalletBalanceBanner />
      </div>
      {children}
    </div>
  )
}
