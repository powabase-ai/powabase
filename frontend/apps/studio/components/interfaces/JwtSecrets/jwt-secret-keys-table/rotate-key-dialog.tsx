import { ArrowRight, Info, Key, Timer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Checkbox_Shadcn_,
  cn,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionSeparator,
  DialogTitle,
  Label_Shadcn_,
} from 'ui'

import { algorithmLabels } from '../algorithm-details'
import { statusColors } from '../jwt.constants'
import { ButtonTooltip } from '@/components/ui/ButtonTooltip'
import { useJWTSigningKeyUpdateMutation } from '@/data/jwt-signing-keys/jwt-signing-key-update-mutation'
import { JWTSigningKey } from '@/data/jwt-signing-keys/jwt-signing-keys-query'

export function RotateKeyDialog({
  projectRef,
  standbyKey,
  inUseKey,
  onClose,
}: {
  projectRef: string
  standbyKey: JWTSigningKey
  inUseKey: JWTSigningKey
  onClose: () => void
}) {
  const [isStandbyUnderstood, setStandbyUnderstood] = useState(false)
  const [isPreviouslyUsedUnderstood, setPreviouslyUsedUnderstood] = useState(false)

  const { mutate, isPending: isPendingMutation } = useJWTSigningKeyUpdateMutation({
    onSuccess: () => {
      toast.success('Signing key rotated successfully')
      onClose()
    },
    onError: (error) => {
      toast.error(`Failed to rotate signing key: ${error.message}`)
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rotate JWT signing key</DialogTitle>
        <DialogDescription>
          Change the key used by Supabase Auth to create new JSON Web Tokens. Non-expired tokens
          remain <span className="text-brand">valid and accepted</span>!
        </DialogDescription>
      </DialogHeader>
      <DialogSectionSeparator />
      <DialogSection className="bg">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
          <Badge
            className={cn(
              statusColors['standby'],
              'px-4 py-1 gap-2 flex flex-row items-center uppercase'
            )}
          >
            <Timer size={14} />
            Standby key
          </Badge>
          <div>
            <ArrowRight className="size-4 text-foreground-light" />
          </div>
          <div>
            <Badge
              className={cn(
                statusColors['in_use'],
                'px-4 py-1 gap-2 flex flex-row items-center uppercase'
              )}
            >
              <Key size={14} />
              Current key
            </Badge>
          </div>
          <div className="text-xs text-foreground-light font-mono text-center">
            {algorithmLabels[standbyKey.algorithm]}
          </div>
          <div />
          <div />

          <div className="col-span-3" />

          <Badge
            className={cn(
              statusColors['in_use'],
              'px-4 py-1 gap-2 flex flex-row items-center uppercase'
            )}
          >
            <Key size={14} />
            Current key
          </Badge>
          <div>
            <ArrowRight className="h-4 w-4 text-foreground-light" />
          </div>
          <Badge
            className={cn(
              statusColors['previously_used'],
              'px-4 py-1 gap-2 flex flex-row items-center uppercase'
            )}
          >
            <Timer size={14} />
            Previous key
          </Badge>
          <div />
          <div />
          <div className="text-xs text-foreground-light font-mono text-center">
            {algorithmLabels[inUseKey.algorithm]}
          </div>
        </div>
      </DialogSection>
      <DialogSectionSeparator />
      <DialogSection className="flex flex-col gap-4">
        <div className="text-sm">To proceed please confirm:</div>

        <Label_Shadcn_
          htmlFor="understands-standby"
          className="flex items-top gap-4 text-sm leading-none"
        >
          <Checkbox_Shadcn_
            id="understands-standby"
            className="mt-0.5"
            checked={isStandbyUnderstood}
            onCheckedChange={(value) => setStandbyUnderstood(!!value)}
          />
          <p className="text-sm text-foreground-light">
            All of my application's components have picked up the standby key.
          </p>
          <ButtonTooltip
            type="default"
            icon={<Info />}
            className="px-1.5 py-2 mt-0.5"
            tooltip={{
              content: {
                className: 'max-w-[320px] p-4',
                text: (
                  <p>
                    If your application verifies JWTs on its own in backend servers, functions,
                    lambdas or other such components, ensure that they've picked up and are
                    verifying tokens against the standby key.
                    <br />
                    <br />
                    Recommendation: Periodically fetch the public keys from the project's{' '}
                    <code>jwks.json</code> endpoint.
                  </p>
                ),
              },
            }}
          />
        </Label_Shadcn_>

        <Label_Shadcn_
          htmlFor="understands-previously-used"
          className="flex items-top gap-4 text-sm leading-none"
        >
          <Checkbox_Shadcn_
            className="mt-0.5"
            id="understands-previously-used"
            checked={isPreviouslyUsedUnderstood}
            onCheckedChange={(value) => setPreviouslyUsedUnderstood(!!value)}
          />
          <p className="text-sm text-foreground-light">
            To invalidate non-expired JWTs I need to explicitly revoke the currently used key.
          </p>
          <ButtonTooltip
            type="default"
            icon={<Info />}
            className="px-1.5 py-2 mt-0.5"
            tooltip={{
              content: {
                className: 'max-w-[320px] p-4',
                text: (
                  <p>
                    Rotating the signing key only changes what key is used by Supabase Auth to
                    issue <em className="text-brand not-italic">new tokens</em>
                    .<br />
                    <br />
                    To prevent users from being prematurely signed out, you have to manually
                    revoke the current in use key after rotation.
                    <br />
                    <br />
                    Recommendation: If your JWT expiry time is 1 hour, wait at least 1 hour and
                    15 minutes before revoking the key.
                  </p>
                ),
              },
            }}
          />
        </Label_Shadcn_>
      </DialogSection>
      <DialogFooter>
        <Button
          onClick={() => mutate({ projectRef, keyId: standbyKey.id, status: 'in_use' })}
          disabled={!isPreviouslyUsedUnderstood || !isStandbyUnderstood}
          loading={isPendingMutation}
        >
          Rotate signing key
        </Button>
      </DialogFooter>
    </>
  )
}
