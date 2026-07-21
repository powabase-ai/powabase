import { useMutation } from '@tanstack/react-query'

import { postBillingSession } from './_session-fetch'

export type TopupSessionVariables = {
  slug: string
  amountCents: number
  saveCardOnFile: boolean
  returnUrl?: string
}

export type TopupSessionResponse = { url: string }

export async function createTopupSession(
  args: TopupSessionVariables
): Promise<TopupSessionResponse> {
  const returnUrl = args.returnUrl ?? `/org/${args.slug}/billing`
  return postBillingSession(
    `/platform/organizations/${args.slug}/billing/topup-session`,
    {
      amount_cents: args.amountCents,
      save_card_on_file: args.saveCardOnFile,
      return_url: returnUrl,
    },
    'Top-up session creation failed'
  )
}

export const useCreateTopupSessionMutation = () =>
  useMutation({ mutationFn: (vars: TopupSessionVariables) => createTopupSession(vars) })
