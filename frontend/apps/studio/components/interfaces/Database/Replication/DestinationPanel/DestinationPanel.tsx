import { parseAsInteger, parseAsStringEnum, useQueryState } from 'nuqs'
import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  DialogSectionSeparator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from 'ui'

import { EnableReplicationCallout } from '../EnableReplicationCallout'
import { PipelineStatusName } from '../Replication.constants'
import { useDestinationInformation } from '../useDestinationInformation'
import { useIsETLPrivateAlpha } from '../useIsETLPrivateAlpha'
import { DestinationForm } from './DestinationForm'
import { DestinationType } from './DestinationPanel.types'
import { DestinationTypeSelection } from './DestinationTypeSelection'
import { ReadReplicaForm } from './ReadReplicaForm'
import { useCheckEntitlements } from '@/hooks/misc/useCheckEntitlements'

interface DestinationPanelProps {
  onSuccessCreateReadReplica?: () => void
}

export const DestinationPanel = ({ onSuccessCreateReadReplica }: DestinationPanelProps) => {
  const enablePgReplicate = useIsETLPrivateAlpha()
  const { hasAccess: hasETLReplicationAccess } = useCheckEntitlements('replication.etl')

  const [urlDestinationType, setDestinationType] = useQueryState(
    'destinationType',
    parseAsStringEnum<DestinationType>([
      'Read Replica',
      'BigQuery',
      'Analytics Bucket',
    ]).withOptions({
      history: 'push',
      clearOnDefault: true,
    })
  )

  const [edit, setEdit] = useQueryState(
    'edit',
    parseAsInteger.withOptions({
      history: 'push',
      clearOnDefault: true,
    })
  )

  const visible = urlDestinationType !== null || edit !== null
  const editMode = edit !== null

  const {
    sourceId,
    pipeline,
    statusName,
    replicationNotEnabled,
    type: existingDestinationType,
    destinationFetcher,
  } = useDestinationInformation({ id: edit })
  const destinationType = existingDestinationType ?? urlDestinationType
  const invalidExistingDestination = destinationFetcher.error?.code === 404

  const existingDestination = editMode
    ? {
        sourceId,
        destinationId: edit,
        pipelineId: pipeline?.id,
        statusName,
        enabled:
          statusName === PipelineStatusName.STARTED || statusName === PipelineStatusName.FAILED,
      }
    : undefined

  const onClose = () => {
    setDestinationType(null)
    setEdit(null)
  }

  useEffect(() => {
    if (edit !== null && invalidExistingDestination) {
      toast(`Unable to find destination ID ${edit}`)
      setEdit(null)
    }
  }, [edit, invalidExistingDestination, setEdit])

  return (
    <>
      <Sheet open={visible} onOpenChange={onClose}>
        <SheetContent size="default" showClose={false} className="md:!w-[850px]">
          <div className="flex flex-col h-full" tabIndex={-1}>
            <SheetHeader>
              <SheetTitle>{editMode ? 'Edit destination' : 'Create a new destination'}</SheetTitle>
              <SheetDescription>
                {editMode
                  ? 'Update the configuration for this destination'
                  : 'A destination is an external platform that automatically receives your database changes in real time.'}
              </SheetDescription>
            </SheetHeader>

            <DestinationTypeSelection />

            <DialogSectionSeparator />

            {destinationType === 'Read Replica' ? (
              <ReadReplicaForm onClose={onClose} onSuccess={() => onSuccessCreateReadReplica?.()} />
            ) : !enablePgReplicate ? (
              <SheetSection>
                <p className="text-sm text-foreground-light">
                  This destination type is not available on your project. Contact your operator
                  to request access.
                </p>
              </SheetSection>
            ) : replicationNotEnabled ? (
              <SheetSection>
                <EnableReplicationCallout
                  className="!p-6"
                  type={destinationType}
                  hasAccess={hasETLReplicationAccess}
                />
              </SheetSection>
            ) : (
              <DestinationForm
                visible={visible}
                selectedType={destinationType ?? 'Read Replica'}
                existingDestination={existingDestination}
                onClose={onClose}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
