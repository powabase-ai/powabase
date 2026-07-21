import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { creditsKeys } from '@/data/credits/keys'
import { billingKeys } from '@/data/billing/keys'
import { organizationKeys } from '@/data/organizations/keys'
import { subscriptionKeys } from '@/data/subscriptions/keys'

export function CheckoutResultBanner() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const checkout = router.query.checkout as string | undefined
  const topup = router.query.topup as string | undefined
  const setup = router.query.setup as string | undefined
  const slug = router.query.slug as string | undefined

  useEffect(() => {
    if (checkout === 'success') {
      toast.success('Subscription activated! Your plan and balance are updating...')
      // Webhook landing race: poll subscription + credits limits queries 1s x 5.
      // PR #499 R1 #5c + R2 B3: the previous keys were both dead.
      //   - Round 0: `['billing', 'wallet', slug]` — no factory ever registered it
      //   - Round 1: `creditsKeys.balance(slug)` — `useCreditsBalanceQuery` was
      //     removed in 2026-05 cleanup (see data/credits/balance-query.ts:30-32);
      //     no subscriber exists today
      // The live subscriber is `useCreditsLimitsQuery` (data/credits/limits-query.ts:42),
      // which is mounted globally via `<CreditBar />` inside `<LayoutHeader />`.
      // Use `creditsKeys.limits(slug)` to invalidate it.
      const intervalId = setInterval(() => {
        if (slug) {
          queryClient.invalidateQueries({ queryKey: subscriptionKeys.orgSubscription(slug) })
          queryClient.invalidateQueries({ queryKey: creditsKeys.limits(slug) })
          // The plan lands on `org.plan.id` (via the webhook). That field drives
          // the plan-card highlight AND the project-creation compute rates/upsell,
          // and lives in the 30-min-staleTime organizations list — invalidate it
          // too or the UI shows the pre-upgrade plan until the staleTime expires.
          queryClient.invalidateQueries({ queryKey: organizationKeys.list() })
        }
      }, 1000)
      const timeoutId = setTimeout(() => clearInterval(intervalId), 5000)
      return () => {
        clearInterval(intervalId)
        clearTimeout(timeoutId)
      }
    }
    if (checkout === 'cancel') {
      toast.info('Checkout canceled. No changes made.')
    }
  }, [checkout, slug, queryClient])

  // B3: top-up result handling (mirrors checkout handling above)
  useEffect(() => {
    if (topup === 'success') {
      toast.success('Top-up received! Credits are being applied...')
      const intervalId = setInterval(() => {
        if (slug) {
          queryClient.invalidateQueries({ queryKey: creditsKeys.limits(slug) })
          queryClient.invalidateQueries({ queryKey: billingKeys.wallet(slug) })
        }
      }, 1000)
      const timeoutId = setTimeout(() => clearInterval(intervalId), 5000)
      return () => {
        clearInterval(intervalId)
        clearTimeout(timeoutId)
      }
    }
    if (topup === 'cancel') {
      toast.info('Top-up canceled. No charge made.')
    }
  }, [topup, slug, queryClient])

  // B3: add-card result handling
  useEffect(() => {
    if (setup === 'success') {
      toast.success('Card saved.')
      if (slug) {
        queryClient.invalidateQueries({ queryKey: billingKeys.wallet(slug) })
      }
    }
    if (setup === 'cancel') {
      toast.info('Card setup canceled.')
    }
  }, [setup, slug, queryClient])

  return null
}
