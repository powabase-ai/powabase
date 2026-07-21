import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Badge, Button, cn } from 'ui'

import {
  CheckoutSessionError,
  useCreateCheckoutSessionMutation,
} from '@/data/billing/checkout-session-mutation'
import { navigateStripeTab, openStripeTab } from '@/data/billing/open-stripe-tab'
import {
  ENTERPRISE_CONTACT_URL,
  POWABASE_PLANS,
  POWABASE_PLAN_ORDER,
  planRank,
  type PowabasePlanId,
} from '@/data/billing/powabase-plans.constants'
import { creditsKeys } from '@/data/credits/keys'
import { organizationKeys } from '@/data/organizations/keys'
import { subscriptionKeys } from '@/data/subscriptions/keys'

// Moved from UpgradePlanPicker: maps the CP checkout error_hint to a toast.
// Exported for unit testing (the payment-failure path isn't exercised by the
// component test, which mocks the mutation and never triggers onError).
export function checkoutErrorMessage(err: unknown): string {
  if (err instanceof CheckoutSessionError) {
    switch (err.errorHint) {
      case 'use_portal_for_downgrade':
        return 'To downgrade to a lower plan, please use the Customer Portal.'
      case 'card_declined':
        return err.serverMessage ?? 'Your card was declined. Please try another payment method.'
      case 'stripe_error':
        return 'Could not reach Stripe. Please try again in a moment.'
      case 'not_synced':
        return 'Plans are not yet synced with Stripe. Please contact support.'
      case 'invalid_plan':
        return 'Selected plan is not available.'
      case 'already_on_plan':
        return 'You are already on this plan.'
      case 'not_owner':
        return 'Only the organization owner can change the subscription.'
      case 'billing_disabled':
        return 'Billing is not configured on this deployment.'
      default:
        return err.serverMessage ?? 'Subscription request failed. Please try again.'
    }
  }
  return 'Unexpected error. Please try again.'
}

export function PowabasePlanCards({
  slug,
  currentPlanId,
}: {
  slug: string
  currentPlanId: string
}) {
  const { mutate, isPending } = useCreateCheckoutSessionMutation()
  const queryClient = useQueryClient()
  const currentRank = planRank(currentPlanId)

  // After an in-place Paid->Paid upgrade the new plan lands via webhook a beat
  // later, so poll the subscription + credit limits 1s x 5 (mirrors
  // CheckoutResultBanner). Timers live in a ref so the unmount cleanup can
  // clear them — otherwise the interval keeps invalidating queries on an
  // unmounted tree for up to 5s.
  const pollTimers = useRef<{
    interval?: ReturnType<typeof setInterval>
    timeout?: ReturnType<typeof setTimeout>
  }>({})
  const clearUpgradePoll = () => {
    if (pollTimers.current.interval) clearInterval(pollTimers.current.interval)
    if (pollTimers.current.timeout) clearTimeout(pollTimers.current.timeout)
    pollTimers.current = {}
  }
  // Clear any in-flight poll on unmount. Inlined (not a ref to clearUpgradePoll)
  // so exhaustive-deps stays happy with an empty dep array; timers live in a
  // ref, so reading pollTimers.current at cleanup time is correct.
  useEffect(
    () => () => {
      if (pollTimers.current.interval) clearInterval(pollTimers.current.interval)
      if (pollTimers.current.timeout) clearTimeout(pollTimers.current.timeout)
    },
    []
  )
  const startUpgradePoll = () => {
    clearUpgradePoll() // never stack two concurrent polls
    pollTimers.current.interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.orgSubscription(slug) })
      queryClient.invalidateQueries({ queryKey: creditsKeys.limits(slug) })
      // org.plan.id drives this card's highlight + the project-creation compute
      // rates, and sits in the 30-min-staleTime organizations list — refresh it
      // too, else the upgraded plan won't show until the staleTime expires.
      queryClient.invalidateQueries({ queryKey: organizationKeys.list() })
    }, 1000)
    pollTimers.current.timeout = setTimeout(clearUpgradePoll, 5000)
  }

  return (
    <div className="space-y-4" data-testid="powabase-plan-cards">
      <h2 className="text-lg font-semibold">Plans</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {POWABASE_PLAN_ORDER.map((planId) => {
          const plan = POWABASE_PLANS[planId]
          const isCurrent = planId === currentPlanId
          const isUpgrade = planRank(planId) > currentRank

          return (
            <div
              key={planId}
              data-testid={`plan-card-${planId}`}
              className={cn(
                'flex flex-col gap-3 rounded border p-4',
                // Only the current plan gets the green highlight; the popular plan
                // is distinguished by its "Popular" badge alone (avoids two green
                // boxes reading as ambiguous).
                isCurrent ? 'border-brand ring-1 ring-brand' : 'border-default'
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {isCurrent ? (
                  <Badge variant="success">Current plan</Badge>
                ) : plan.popular ? (
                  <Badge>Popular</Badge>
                ) : null}
              </div>

              <div>
                <p className="text-2xl font-semibold">{plan.monthlyPriceLabel}</p>
                <p className="text-sm text-foreground-light">{plan.creditLabel}</p>
              </div>

              <ul className="flex flex-col gap-1 text-sm text-foreground-light">
                {plan.features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrent ? (
                  <Button type="default" disabled className="w-full">
                    Current plan
                  </Button>
                ) : isUpgrade ? (
                  <Button
                    type="primary"
                    className="w-full"
                    loading={isPending}
                    onClick={() => {
                      // Open the tab synchronously inside the click gesture so
                      // the popup blocker permits it; fill it once the Checkout
                      // session resolves (see open-stripe-tab).
                      const tab = openStripeTab()
                      mutate(
                        // isUpgrade only fires when planRank(planId) > current; free
                        // is rank 0, so an upgrade target always ranks > 0 → paid.
                        { slug, planId: planId as Exclude<PowabasePlanId, 'free'> },
                        {
                          onSuccess: (data) => {
                            if (data.url) {
                              // Free->Paid: open Stripe Checkout in the new tab.
                              navigateStripeTab(tab, data.url)
                            } else {
                              // Paid->Paid (e.g. Self-Serve->Scale) is applied
                              // in-place server-side with no url — close the
                              // blank tab instead of navigating to `/undefined`
                              // (the old 404 bug), then poll for the new plan.
                              tab?.close()
                              toast.success(`Upgraded to ${plan.name}.`)
                              startUpgradePoll()
                            }
                          },
                          onError: (err) => {
                            tab?.close()
                            toast.error(checkoutErrorMessage(err))
                          },
                        }
                      )
                    }}
                  >
                    Upgrade to {plan.name}
                  </Button>
                ) : (
                  <p className="text-center text-sm text-foreground-lighter">
                    Included in your plan
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-sm text-foreground-light">
        Need SSO, BYO-Cloud, SOC 2 &amp; SLAs?{' '}
        <Link
          href={ENTERPRISE_CONTACT_URL}
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:underline"
        >
          Enterprise — contact us
        </Link>
      </p>
    </div>
  )
}
