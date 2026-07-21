import type { QueryKey } from '@tanstack/react-query'

export const creditsKeys = {
  all: ['credits'] as const,
  balance: (orgSlug: string | undefined): QueryKey =>
    [...creditsKeys.all, 'balance', orgSlug] as const,
  limits: (orgSlug: string | undefined): QueryKey =>
    [...creditsKeys.all, 'limits', orgSlug] as const,
  ledger: (orgSlug: string | undefined, filters: Record<string, string | undefined>): QueryKey =>
    [...creditsKeys.all, 'ledger', orgSlug, filters] as const,
  pricing: (): QueryKey => [...creditsKeys.all, 'pricing'] as const,
}
