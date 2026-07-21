import { IS_PLATFORM } from 'common'
import { X } from 'lucide-react'

import { ASSISTANT_SUGGESTIONS } from './HelpPanel.constants'
import { HelpSection } from './HelpSection'
import type { SupportFormUrlKeys } from '@/components/interfaces/Support/SupportForm.utils'
import { SIDEBAR_KEYS } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { ButtonTooltip } from '@/components/ui/ButtonTooltip'
import { useAiAssistantStateSnapshot } from '@/state/ai-assistant-state'
import { useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

export const HelpPanel = ({
  onClose,
  projectRef,
  supportLinkQueryParams,
}: {
  onClose: () => void
  projectRef: string | undefined
  supportLinkQueryParams: Partial<SupportFormUrlKeys> | undefined
}) => {
  const snap = useAiAssistantStateSnapshot()
  const { openSidebar, closeSidebar } = useSidebarManagerSnapshot()

  return (
    <div className="space-y-4">
      <div className="flex text-xs items-center justify-between pl-4 pr-3 h-[var(--header-height)] border-b">
        <span>Help & Support</span>
        <ButtonTooltip
          type="text"
          className="w-7 h-7"
          onClick={() => closeSidebar(SIDEBAR_KEYS.HELP_PANEL)}
          icon={<X strokeWidth={1.5} />}
          tooltip={{ content: { side: 'bottom', text: 'Close' } }}
        />
      </div>
      <HelpSection
        className="px-4"
        isPlatform={IS_PLATFORM}
        projectRef={projectRef}
        supportLinkQueryParams={supportLinkQueryParams}
        onAssistantClick={() => {
          onClose()
          openSidebar(SIDEBAR_KEYS.AI_ASSISTANT)
          snap.newChat(ASSISTANT_SUGGESTIONS)
        }}
        onSupportClick={onClose}
      />
    </div>
  )
}
