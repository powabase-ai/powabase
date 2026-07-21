import { useState } from 'react'
import { toast } from 'sonner'
import {
  Button,
  Checkbox_Shadcn_,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input_Shadcn_,
  Label_Shadcn_,
} from 'ui'

import { useCreateTopupSessionMutation } from '@/data/billing/topup-session-mutation'

export const TopupModal = ({ slug, onClose }: { slug: string; onClose: () => void }) => {
  const [amount, setAmount] = useState('10.00')
  const [saveCard, setSaveCard] = useState(true)
  const { mutate, isPending } = useCreateTopupSessionMutation() // R10: v5 mutations expose isPending

  const amountCents = Math.round(parseFloat(amount) * 100)
  const valid = Number.isFinite(amountCents) && amountCents >= 50

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add credits</DialogTitle>
          <DialogDescription>
            Credits are applied 1:1 — $1 of payment = $1 of credits. Minimum $0.50.
          </DialogDescription>
        </DialogHeader>
        <Label_Shadcn_ htmlFor="topup-amount-input" className="text-sm">
          Amount (USD)
        </Label_Shadcn_>
        <Input_Shadcn_
          id="topup-amount-input"
          type="number"
          step="0.01"
          min="0.50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-testid="topup-amount"
        />
        <div className="flex items-center gap-2">
          <Checkbox_Shadcn_
            id="save-card"
            checked={saveCard}
            onCheckedChange={(v) => setSaveCard(Boolean(v))}
          />
          <Label_Shadcn_ htmlFor="save-card" className="text-sm">
            Save card for future top-ups and overage auto-charge
          </Label_Shadcn_>
        </div>
        <DialogFooter>
          <Button type="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="primary"
            disabled={!valid || isPending}
            loading={isPending}
            onClick={() =>
              mutate(
                { slug, amountCents, saveCardOnFile: saveCard },
                { onError: (e: any) => toast.error(`Top-up failed: ${e?.message}`) }
              )
            }
          >
            Continue to checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
