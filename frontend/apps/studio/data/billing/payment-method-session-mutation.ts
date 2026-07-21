import { useMutation } from '@tanstack/react-query'

import { postBillingSession } from './_session-fetch'

export type PaymentMethodSessionVariables = {
  slug: string
  returnUrl?: string
}

export type PaymentMethodSessionResponse = { url: string }

export async function createPaymentMethodSession(
  args: PaymentMethodSessionVariables
): Promise<PaymentMethodSessionResponse> {
  const returnUrl = args.returnUrl ?? `/org/${args.slug}/billing`
  return postBillingSession(
    `/platform/organizations/${args.slug}/billing/payment-method-session`,
    { return_url: returnUrl },
    'Payment method session creation failed'
  )
}

export const useCreatePaymentMethodSessionMutation = () =>
  useMutation({
    mutationFn: (vars: PaymentMethodSessionVariables) => createPaymentMethodSession(vars),
  })
