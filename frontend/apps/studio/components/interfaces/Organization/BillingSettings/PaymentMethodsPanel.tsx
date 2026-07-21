import { toast } from 'sonner'
import { Badge, Button } from 'ui'

import { navigateStripeTab, openStripeTab } from '@/data/billing/open-stripe-tab'
import { useCreatePaymentMethodSessionMutation } from '@/data/billing/payment-method-session-mutation'
import { useCreatePortalSessionMutation } from '@/data/billing/portal-session-mutation'

export const PaymentMethodsPanel = ({
  slug,
  cardOnFile,
}: {
  slug: string
  cardOnFile: boolean
}) => {
  const addCard = useCreatePaymentMethodSessionMutation()
  const portal = useCreatePortalSessionMutation()

  return (
    <div data-testid="payment-methods-panel">
      <h4 className="text-sm text-foreground-light">Payment methods</h4>
      <div className="flex items-center gap-2 mt-2">
        {cardOnFile ? (
          <>
            <Badge variant="success">Card on file</Badge>
            {/* N18: "brand" variant doesn't exist in the cva config — use "success" */}
            <Button
              type="default"
              loading={portal.isPending} // R10: v5 mutations expose isPending
              onClick={() => {
                // New-tab handoff (the shared mutation no longer self-navigates;
                // nav is the caller's responsibility — see open-stripe-tab).
                const tab = openStripeTab()
                portal.mutate(
                  { slug },
                  {
                    onSuccess: (data) => navigateStripeTab(tab, data.url),
                    onError: (e: any) => {
                      tab?.close()
                      toast.error(`Could not open portal: ${e?.message}`)
                    },
                  }
                )
              }}
            >
              Manage payment methods
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-foreground-lighter">No card on file</span>
            <Button
              type="default"
              loading={addCard.isPending} // R10: v5 mutations expose isPending
              onClick={() =>
                addCard.mutate(
                  { slug },
                  { onError: (e: any) => toast.error(`Could not start card setup: ${e?.message}`) }
                )
              }
            >
              Add card
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
