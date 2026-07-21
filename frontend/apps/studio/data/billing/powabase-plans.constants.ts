export type PowabasePlanId = 'free' | 'self-serve' | 'scale'

export interface PowabasePlan {
  id: PowabasePlanId
  name: string
  monthlyPriceLabel: string
  creditLabel: string
  popular?: boolean
  features: string[]
}

// Display order, low → high tier. The index doubles as the tier rank used to
// decide Upgrade vs Current vs Included on each card.
export const POWABASE_PLAN_ORDER: PowabasePlanId[] = ['free', 'self-serve', 'scale']

// An UNKNOWN id (not one of the three plans) intentionally floors to 0 — the
// same rank as Free — so a stale frontend hitting a newer backend plan shows
// the paid tiers as "Upgrade", never a wrong "Current" (which keys off `===`,
// not rank). This can't happen today: `org.plan.id` is always free/self-serve/
// scale. Callers needing to detect "unknown" must check membership separately.
export function planRank(id: string): number {
  const i = POWABASE_PLAN_ORDER.indexOf(id as PowabasePlanId)
  return i === -1 ? 0 : i // -1 (unknown) → 0; see note above
}

// Marketing copy mirrors the public pricing page (powabase.ai/pricing). These
// are DISPLAY strings only — the charging source of truth is the CP `plans`
// table, unchanged by this UI work.
export const POWABASE_PLANS: Record<PowabasePlanId, PowabasePlan> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceLabel: '$0/mo',
    creditLabel: '$10 free credits on sign-up',
    features: [
      'All platform features',
      'Pay-as-you-go from your wallet · Sandbox usage',
      'RAG with OCR + 4 indexing strategies',
      'Agents, orchestrations & workflows',
      'Bring your own LLM keys',
      'Inactive projects suspend after 7 days',
    ],
  },
  'self-serve': {
    id: 'self-serve',
    name: 'Self-Serve',
    monthlyPriceLabel: '$25/mo',
    creditLabel: '$25 monthly credits — spend on anything',
    popular: true,
    features: [
      'Up to 25% cheaper per-call costs vs Free',
      '15% cheaper per-hour compute vs Free',
      'Lower overage rates (EBS, S3, egress, requests)',
      'Email support',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyPriceLabel: '$300/mo',
    creditLabel: '$300 monthly credits — spend on anything',
    features: [
      'Up to 50% cheaper per-call costs vs Free',
      '20% cheaper per-hour compute vs Free',
      'Lowest overage rates',
      'Priority live support',
    ],
  },
}

// Enterprise is a contact CTA, not a checkout card.
export const ENTERPRISE_CONTACT_URL = 'https://powabase.ai/pricing/'
