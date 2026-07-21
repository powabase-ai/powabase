import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Input_Shadcn_, Label_Shadcn_ } from 'ui'

import { useUpdateBillingSettingsMutation } from '@/data/billing/billing-settings-mutation'
import { millicentsToUsd, usdToMillicents } from '@/lib/billing-units'

export const SpendCapEditor = ({
  slug,
  valueMillicents,
}: {
  slug: string
  valueMillicents: number
}) => {
  const [dollars, setDollars] = useState(millicentsToUsd(valueMillicents).toFixed(2))
  const { mutate, isPending } = useUpdateBillingSettingsMutation() // R10: v5 mutations expose isPending

  const parsed = usdToMillicents(parseFloat(dollars))
  const valid = Number.isFinite(parsed) && parsed >= 0

  return (
    <div data-testid="spend-cap-editor">
      <Label_Shadcn_ htmlFor="spend-cap-input" className="text-sm text-foreground-light">
        Monthly spending cap
      </Label_Shadcn_>
      <p className="text-xs text-foreground-lighter">
        You get alerted at 80% and 100% of this cap. Hard enforcement (auto-charge ceiling) arrives
        with overage billing. Owner-only.
      </p>
      <div className="flex gap-2 mt-2 max-w-xs">
        <Input_Shadcn_
          id="spend-cap-input"
          type="number"
          min="0"
          step="1"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
        />
        <Button
          type="default"
          loading={isPending}
          disabled={!valid}
          onClick={() =>
            mutate(
              { slug, monthlyMaxSpendMillicents: parsed },
              {
                onSuccess: () => toast.success('Spending cap updated'),
                onError: (e: any) =>
                  toast.error(
                    e?.message === 'not_owner'
                      ? 'Only the organization owner can change the spending cap.'
                      : `Failed to update cap: ${e?.message ?? 'unknown error'}`
                  ),
              }
            )
          }
        >
          Save cap
        </Button>
      </div>
    </div>
  )
}
