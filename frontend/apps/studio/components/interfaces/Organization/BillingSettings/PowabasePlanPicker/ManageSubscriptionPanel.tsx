import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_, Button } from 'ui'

import { navigateStripeTab, openStripeTab } from '@/data/billing/open-stripe-tab'
import {
  PortalSessionError,
  useCreatePortalSessionMutation,
} from '@/data/billing/portal-session-mutation'
import { subscriptionKeys } from '@/data/subscriptions/keys'

export type ManageSubscriptionSubscription = {
  plan: { id: string; name: string }
  current_period_end: number | null
  // Set when a cancel is scheduled via the Customer Portal. `cancel_at` is the
  // final subscription date (epoch seconds); falls back to current_period_end.
  cancel_at_period_end?: boolean
  cancel_at?: number | null
}

/** PR #499 R1 #5b: map error_hint to a user-facing toast message. */
function portalErrorMessage(err: unknown): string {
  if (err instanceof PortalSessionError) {
    switch (err.errorHint) {
      case 'card_declined':
        return err.serverMessage ?? 'Your card was declined.'
      case 'stripe_error':
        return 'Could not reach Stripe. Please try again in a moment.'
      case 'no_stripe_customer':
        return 'No Stripe customer record exists for this organization yet.'
      case 'not_owner':
        return 'Only the organization owner can manage the subscription.'
      case 'billing_disabled':
        return 'Billing is not configured on this deployment.'
      default:
        return err.serverMessage ?? 'Could not open the Customer Portal. Please try again.'
    }
  }
  return 'Unexpected error. Please try again.'
}

export function ManageSubscriptionPanel({
  slug,
  subscription,
}: {
  slug: string
  subscription: ManageSubscriptionSubscription
}) {
  const { mutate, isPending } = useCreatePortalSessionMutation()
  const queryClient = useQueryClient()

  // The user may schedule (or clear) a cancel inside the Customer Portal, which
  // opens in a separate tab. Refresh the subscription when they return focus so
  // the cancel banner reflects the change — the query's long staleTime means it
  // won't refetch on its own. Armed only after a portal session is opened.
  const portalOpenedRef = useRef(false)
  useEffect(() => {
    const onReturn = () => {
      if (!portalOpenedRef.current) return
      portalOpenedRef.current = false
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.orgSubscription(slug) })
    }
    window.addEventListener('focus', onReturn)
    return () => window.removeEventListener('focus', onReturn)
  }, [queryClient, slug])

  const formatDate = (epochSeconds?: number | null) =>
    epochSeconds && epochSeconds > 0
      ? new Date(epochSeconds * 1000).toLocaleDateString()
      : 'N/A'

  const renewsOn = formatDate(subscription.current_period_end)
  // Prefer the explicit cancel_at; fall back to the period end.
  const isCanceling = !!subscription.cancel_at_period_end
  const endsOn = formatDate(subscription.cancel_at ?? subscription.current_period_end)

  return (
    <div className="space-y-4 rounded border p-6">
      <h2 className="text-lg font-semibold">Subscription</h2>
      <p>
        Current plan: <strong>{subscription.plan.name}</strong>
      </p>
      {isCanceling ? (
        <Alert_Shadcn_ variant="warning">
          <AlertTitle_Shadcn_>Subscription scheduled to cancel</AlertTitle_Shadcn_>
          <AlertDescription_Shadcn_>
            Your subscription is set to cancel and will end on <strong>{endsOn}</strong>. You can
            keep your plan by reactivating in the Customer Portal.
          </AlertDescription_Shadcn_>
        </Alert_Shadcn_>
      ) : (
        <p>
          Renews on: <strong>{renewsOn}</strong>
        </p>
      )}
      <Button
        onClick={() => {
          // Open a blank tab synchronously inside the click gesture so the
          // popup blocker allows it; point it at the Stripe portal once the
          // async session resolves (see open-stripe-tab — passing `noopener`
          // would null the handle and silently fall back to same-tab nav).
          const tab = openStripeTab()
          mutate(
            { slug },
            {
              onSuccess: (data) => {
                navigateStripeTab(tab, data.url)
                // Refresh the subscription when the user returns from the portal.
                portalOpenedRef.current = true
              },
              onError: (err) => {
                tab?.close()
                toast.error(portalErrorMessage(err))
              },
            }
          )
        }}
        disabled={isPending}
      >
        {isPending ? 'Opening...' : 'Manage subscription'}
      </Button>
      <p className="text-sm text-muted">
        Use the Customer Portal to update payment methods, view invoices, or cancel.
      </p>
    </div>
  )
}
