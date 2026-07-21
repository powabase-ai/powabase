export const billingKeys = {
  wallet: (slug: string | undefined) => ['organizations', slug, 'billing', 'wallet'] as const,
}
