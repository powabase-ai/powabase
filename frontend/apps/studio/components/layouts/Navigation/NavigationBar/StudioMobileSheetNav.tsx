import type { ReactNode } from 'react'
import { CommandWrapper, MobileSheetNav } from 'ui-patterns'

import {
  SIDEBAR_KEYS,
  type TYPEOF_SIDEBAR_KEYS,
} from '../../ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import type { MobileSheetContentType } from './MobileSheetContext'
import { useMobileSheet } from './MobileSheetContext'
import { CommandMenuInnerContent } from '@/components/interfaces/App/CommandMenu/CommandMenu'
import { sidebarManagerState, useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

function isSidebarId(content: unknown): content is TYPEOF_SIDEBAR_KEYS {
  return (
    typeof content === 'string' &&
    Object.values(SIDEBAR_KEYS).includes(content as TYPEOF_SIDEBAR_KEYS)
  )
}

function getSheetChildren(
  content: MobileSheetContentType,
  activeSidebar: { id: string; component?: () => ReactNode } | null
): ReactNode {
  if (content === null) return null
  if (content === 'search') {
    return (
      <CommandWrapper className="h-full flex flex-col bg-background">
        <CommandMenuInnerContent />
      </CommandWrapper>
    )
  }
  if (isSidebarId(content) && activeSidebar?.id === content) {
    return activeSidebar.component?.() ?? null
  }
  if (!isSidebarId(content)) return content
  return null
}

const StudioMobileSheetNav = () => {
  const { content, setContent } = useMobileSheet()
  const { activeSidebar } = useSidebarManagerSnapshot()
  const sheetChildren = getSheetChildren(content, activeSidebar ?? null)

  const handleOpenChange = (open: boolean, userInitiated?: boolean) => {
    if (!open) {
      setContent(null)
      // The Project Copilot is a persistent panel. MobileSheetNav fires
      // onOpenChange(false) from its route-change / viewport effects on ANY url
      // change (e.g. ?showConnect=true when the Connect dialog opens, or guide-bubble
      // navigation) — even on desktop, where this component is mounted but unused.
      // Closing the copilot there tears it down spuriously, so exempt it — UNLESS
      // this is a genuine user dismiss (backdrop tap / swipe / Escape on the sheet
      // itself, userInitiated=true), which must still close it. Without this
      // carve-out the copilot's activeSidebar never clears, so the LayoutSidebar
      // effect re-asserts it and the sheet snaps back open with no way to close it.
      // Task-scoped sidebars keep the existing close-on-navigation behavior.
      if (activeSidebar?.id !== SIDEBAR_KEYS.PROJECT_COPILOT || userInitiated) {
        sidebarManagerState.closeActive()
      }
    }
  }

  return (
    <MobileSheetNav
      open={content !== null}
      onOpenChange={handleOpenChange}
      shouldCloseOnViewportResize={!activeSidebar}
    >
      {sheetChildren}
    </MobileSheetNav>
  )
}

export { StudioMobileSheetNav }
