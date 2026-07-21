import { useState } from 'react'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_, Button } from 'ui'

import { useOrgWalletQuery } from '@/data/billing/wallet-query'
import { millicentsToUsd } from '@/lib/billing-units'
import { PaymentMethodsPanel } from './PaymentMethodsPanel'
import { SpendCapEditor } from './SpendCapEditor'
import { TopupModal } from './TopupModal'

const usd = (mc: number) => `$${millicentsToUsd(mc).toFixed(2)}`

export const WalletPanel = ({ slug }: { slug: string }) => {
  const { data: wallet, isLoading } = useOrgWalletQuery(slug)
  const [topupOpen, setTopupOpen] = useState(false)

  if (isLoading || !wallet) return null

  const lowBalance =
    wallet.monthly_grant_millicents > 0 &&
    wallet.balance_millicents <= 0.1 * wallet.monthly_grant_millicents
  const exhausted = wallet.balance_millicents <= 0
  const capWarning =
    wallet.monthly_max_spend_millicents > 0 &&
    wallet.cycle_spent_millicents >= 0.8 * wallet.monthly_max_spend_millicents

  return (
    <section className="space-y-4" data-testid="wallet-panel">
      {(exhausted || lowBalance) && (
        <Alert_Shadcn_ variant={exhausted ? 'destructive' : 'warning'}>
          <AlertTitle_Shadcn_>
            {exhausted ? 'Credits exhausted' : 'Credit balance is low'}
          </AlertTitle_Shadcn_>
          <AlertDescription_Shadcn_>
            {exhausted
              ? 'AI operations are blocked and infrastructure usage accrues as negative balance. Add credits to resume.'
              : 'Your balance is below 10% of your monthly grant. Top up to avoid interruption.'}
          </AlertDescription_Shadcn_>
        </Alert_Shadcn_>
      )}
      {capWarning && (
        <Alert_Shadcn_ variant="warning">
          <AlertTitle_Shadcn_>Approaching your monthly spending cap</AlertTitle_Shadcn_>
          <AlertDescription_Shadcn_>
            {usd(wallet.cycle_spent_millicents)} of your {usd(wallet.monthly_max_spend_millicents)}{' '}
            cap used this cycle.
          </AlertDescription_Shadcn_>
        </Alert_Shadcn_>
      )}

      <div>
        <h4 className="text-sm text-foreground-light">Wallet balance</h4>
        <p className="text-3xl font-semibold" data-testid="wallet-balance">
          {usd(wallet.balance_millicents)}
        </p>
        <p className="text-sm text-foreground-lighter">
          Credits roll over at your cycle boundary. Spent this cycle:{' '}
          {usd(wallet.cycle_spent_millicents)} of {usd(wallet.monthly_max_spend_millicents)} cap.
        </p>
        <div className="flex gap-2 mt-3">
          <Button type="primary" onClick={() => setTopupOpen(true)}>
            Add credits
          </Button>
        </div>
      </div>

      <SpendCapEditor slug={slug} valueMillicents={wallet.monthly_max_spend_millicents} />
      <PaymentMethodsPanel slug={slug} cardOnFile={wallet.card_on_file} />

      {topupOpen && (
        <TopupModal slug={slug} onClose={() => setTopupOpen(false)} />
      )}
    </section>
  )
}
