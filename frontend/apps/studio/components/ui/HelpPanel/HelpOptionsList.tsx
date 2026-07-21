import { BookOpen, Mail, Wrench } from 'lucide-react'
import { AiIconAnimation, ButtonGroup, ButtonGroupItem } from 'ui'

import type { HelpOptionId } from './HelpPanel.constants'
import { HELP_OPTION_IDS } from './HelpPanel.constants'
import type { SupportFormUrlKeys } from '@/components/interfaces/Support/SupportForm.utils'
import { SupportLink } from '@/components/interfaces/Support/SupportLink'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { DOCS_URL } from '@/lib/constants'

type HelpOptionsListProps = {
  excludeIds?: HelpOptionId[]
  isPlatform: boolean
  projectRef: string | undefined
  supportLinkQueryParams: Partial<SupportFormUrlKeys> | undefined
  onAssistantClick?: () => void
  onSupportClick?: () => void
  size?: 'tiny' | 'small'
}

export const HelpOptionsList = ({
  excludeIds = [],
  isPlatform,
  projectRef,
  supportLinkQueryParams,
  onAssistantClick,
  onSupportClick,
  size = 'tiny',
}: HelpOptionsListProps) => {
  const aiAssistantEnabled = useIsFeatureEnabled('ai:assistant')

  const ids = HELP_OPTION_IDS.filter((id) => !excludeIds.includes(id))

  const include = (id: HelpOptionId): boolean => {
    if (id === 'assistant') return !!projectRef && aiAssistantEnabled
    if (id === 'support') return isPlatform
    return true
  }

  const filteredIds = ids.filter(include)

  return (
    <ButtonGroup className="w-full">
      {filteredIds.map((id) => {
        switch (id) {
          case 'assistant':
            return (
              <ButtonGroupItem
                key={id}
                size={size}
                icon={<AiIconAnimation allowHoverEffect size={14} />}
                onClick={onAssistantClick}
              >
                Powabase Assistant
              </ButtonGroupItem>
            )
          case 'docs':
            return (
              <ButtonGroupItem
                key={id}
                size={size}
                icon={<BookOpen strokeWidth={1.5} size={14} />}
                asChild
              >
                <a href={`${DOCS_URL}/`} target="_blank" rel="noreferrer">
                  Docs
                </a>
              </ButtonGroupItem>
            )
          case 'troubleshooting':
            return (
              <ButtonGroupItem
                key={id}
                size={size}
                icon={<Wrench strokeWidth={1.5} size={14} />}
                asChild
              >
                <a
                  href={`${DOCS_URL}/guides/troubleshooting?products=platform`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Troubleshooting
                </a>
              </ButtonGroupItem>
            )
          case 'support':
            return (
              <ButtonGroupItem
                key={id}
                size={size}
                icon={<Mail strokeWidth={1.5} size={14} />}
                asChild
              >
                <SupportLink queryParams={supportLinkQueryParams} onClick={onSupportClick}>
                  Contact support
                </SupportLink>
              </ButtonGroupItem>
            )
          default: {
            const _exhaustive: never = id
            return null
          }
        }
      })}
    </ButtonGroup>
  )
}
