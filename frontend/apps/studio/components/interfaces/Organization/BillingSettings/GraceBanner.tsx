import { Alert_Shadcn_, AlertTitle_Shadcn_, AlertDescription_Shadcn_, WarningIcon } from 'ui'
import { ScaffoldContainer } from '@/components/layouts/Scaffold'
import { useOrgWalletQuery } from '@/data/billing/wallet-query'

export const GraceBanner = ({ slug }: { slug: string }) => {
  const { data: wallet } = useOrgWalletQuery(slug)
  const status = wallet?.payment_status
  if (status !== 'grace' && status !== 'paused' && status !== 'card_failed') return null

  const copy =
    status === 'paused'
      ? {
          title: 'Your projects are paused',
          body: 'Your grace zone is exhausted and all projects are paused. Top up your wallet, then resume each project from its dashboard.',
        }
      : status === 'card_failed'
      ? {
          title: 'Your card is failing',
          body: 'We could not auto-charge your card after several attempts. Update your payment method to restore automatic top-ups.',
        }
      : {
          title: 'Your wallet is in the grace zone',
          body: 'Your wallet is negative. Service continues for now — top up to avoid your projects being paused.',
        }

  return (
    <ScaffoldContainer id="billing-grace-banner" className="mt-4">
      <Alert_Shadcn_ variant="warning">
        <WarningIcon />
        <AlertTitle_Shadcn_>{copy.title}</AlertTitle_Shadcn_>
        <AlertDescription_Shadcn_>{copy.body}</AlertDescription_Shadcn_>
      </Alert_Shadcn_>
    </ScaffoldContainer>
  )
}
