import { Sparkles } from 'lucide-react'

import { cn } from 'ui'
import { SIDEBAR_KEYS } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { ButtonTooltip } from '@/components/ui/ButtonTooltip'
import { useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

/** Top-nav toggle for the Project Copilot side panel. Visible on project pages. */
export const ProjectCopilotButton = () => {
  const { activeSidebar, toggleSidebar } = useSidebarManagerSnapshot()
  const isOpen = activeSidebar?.id === SIDEBAR_KEYS.PROJECT_COPILOT

  return (
    <ButtonTooltip
      type="outline"
      size="tiny"
      id="project-copilot-trigger"
      icon={<Sparkles size={16} className={cn(isOpen && 'text-background')} />}
      className={cn('rounded-full', isOpen && 'bg-foreground text-background')}
      onClick={() => toggleSidebar(SIDEBAR_KEYS.PROJECT_COPILOT)}
      tooltip={{ content: { text: 'Toggle the Project Copilot' } }}
    >
      <span>Project Copilot</span>
    </ButtonTooltip>
  )
}
