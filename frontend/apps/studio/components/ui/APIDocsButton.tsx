import { useParams } from 'common'
import { BookOpenText } from 'lucide-react'

import { ButtonTooltip } from './ButtonTooltip'
import { useSendEventMutation } from '@/data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

const POWABASE_DOCS_URL = 'https://docs.powabase.ai/concepts/platform-overview'

interface APIDocsButtonProps {
  source: string
  label?: string
  tooltip?: string
}

export const APIDocsButton = ({ source, label, tooltip }: APIDocsButtonProps) => {
  const { ref } = useParams()
  const { data: org } = useSelectedOrganizationQuery()
  const { mutate: sendEvent } = useSendEventMutation()

  return (
    <ButtonTooltip
      size="tiny"
      type="default"
      onClick={() => {
        window.open(POWABASE_DOCS_URL, '_blank', 'noopener,noreferrer')
        sendEvent({
          action: 'api_docs_opened',
          properties: {
            source,
          },
          groups: {
            project: ref ?? 'Unknown',
            organization: org?.slug ?? 'Unknown',
          },
        })
      }}
      icon={<BookOpenText />}
      className={label ? undefined : 'w-7'}
      tooltip={{
        content: {
          side: 'bottom',
          text: tooltip ?? 'API Docs',
        },
      }}
    >
      {label}
    </ButtonTooltip>
  )
}
