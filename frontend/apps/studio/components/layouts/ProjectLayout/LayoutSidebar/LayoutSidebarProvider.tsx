import { LOCAL_STORAGE_KEYS } from 'common'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { parseAsString, useQueryState } from 'nuqs'
import { useEffect, useState, type PropsWithChildren } from 'react'

import { ProjectCopilotWelcomeModal } from '@/components/interfaces/AI/ProjectCopilot/ProjectCopilotWelcome'
import { guideEngineState } from '@/state/guide-engine-state'

import { getSupportLinkQueryParams } from '@/components/ui/HelpPanel/HelpPanel.utils'
import { useSendEventMutation } from '@/data/telemetry/send-event-mutation'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import useLatest from '@/hooks/misc/useLatest'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { useRegisterSidebar, useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

const AdvisorPanel = dynamic(() =>
  import('@/components/ui/AdvisorPanel/AdvisorPanel').then((m) => m.AdvisorPanel)
)
const AIAssistant = dynamic(() =>
  import('@/components/ui/AIAssistantPanel/AIAssistant').then((m) => m.AIAssistant)
)
const EditorPanel = dynamic(() =>
  import('@/components/ui/EditorPanel/EditorPanel').then((m) => m.EditorPanel)
)
const HelpPanel = dynamic(() =>
  import('@/components/ui/HelpPanel/HelpPanel').then((m) => m.HelpPanel)
)
const ProjectCopilotPanel = dynamic(() =>
  import('@/components/interfaces/AI/ProjectCopilot/ProjectCopilotPanel').then(
    (m) => m.ProjectCopilotPanel
  )
)

export const SIDEBAR_KEYS = {
  AI_ASSISTANT: 'ai-assistant',
  EDITOR_PANEL: 'editor-panel',
  ADVISOR_PANEL: 'advisor-panel',
  HELP_PANEL: 'help-panel',
  PROJECT_COPILOT: 'project-copilot',
} as const

export type TYPEOF_SIDEBAR_KEYS = (typeof SIDEBAR_KEYS)[keyof typeof SIDEBAR_KEYS]

export const LayoutSidebarProvider = ({ children }: PropsWithChildren) => {
  const router = useRouter()
  const { data: project } = useSelectedProjectQuery()
  const { data: org } = useSelectedOrganizationQuery()
  const { mutate: sendEvent } = useSendEventMutation()
  const { openSidebar, closeSidebar, activeSidebar } = useSidebarManagerSnapshot()
  const aiAssistantEnabled = useIsFeatureEnabled('ai:assistant')

  const [sidebarURLParam, setSidebarUrlParam] = useQueryState('sidebar', parseAsString)
  const [sidebarLocalStorage, setSidebarLocalStorage, { isSuccess: isLoadedLocalStorage }] =
    useLocalStorageQuery(LOCAL_STORAGE_KEYS.LAST_OPENED_SIDE_BAR(project?.ref ?? ''), '')

  const sidebarURLParamRef = useLatest(sidebarURLParam)
  const sidebarLocalStorageRef = useLatest(sidebarLocalStorage)

  // First-entry onboarding: show the welcome modal once per project, then dock
  // the copilot into the side panel.
  const [welcomeSeen, setWelcomeSeen, { isSuccess: isLoadedWelcomeSeen }] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.COPILOT_WELCOME_SEEN(project?.ref ?? ''),
    false
  )
  const [showWelcome, setShowWelcome] = useState(false)

  useRegisterSidebar(
    SIDEBAR_KEYS.PROJECT_COPILOT,
    () => <ProjectCopilotPanel />,
    {},
    undefined,
    !!project
  )

  useEffect(() => {
    // Show the welcome once per project. The "seen" flag is written on DISMISS
    // (not here), so an interrupted first-entry — e.g. a reload while the modal
    // is open — retries instead of silently losing onboarding. Drive BOTH branches
    // so switching to an already-seen project closes a modal left open on the
    // previous one (showWelcome lives in this provider, which persists across
    // client-side project switches).
    setShowWelcome(!!project?.ref && isLoadedWelcomeSeen && !welcomeSeen)
  }, [project?.ref, isLoadedWelcomeSeen, welcomeSeen])

  useRegisterSidebar(
    SIDEBAR_KEYS.AI_ASSISTANT,
    () => <AIAssistant />,
    {},
    aiAssistantEnabled ? 'i' : undefined,
    !!project && aiAssistantEnabled
  )
  useRegisterSidebar(SIDEBAR_KEYS.EDITOR_PANEL, () => <EditorPanel />, {}, 'e', !!project)
  useRegisterSidebar(SIDEBAR_KEYS.ADVISOR_PANEL, () => <AdvisorPanel />, {}, undefined, true)
  useRegisterSidebar(
    SIDEBAR_KEYS.HELP_PANEL,
    () => (
      <HelpPanel
        onClose={() => closeSidebar(SIDEBAR_KEYS.HELP_PANEL)}
        projectRef={project?.ref}
        supportLinkQueryParams={getSupportLinkQueryParams(
          project,
          org,
          router.query.ref as string | undefined
        )}
      />
    ),
    {},
    undefined,
    true
  )

  useEffect(() => {
    if (!!project) {
      if (activeSidebar) {
        // add event tracking
        sendEvent({
          action: 'sidebar_opened',
          properties: {
            sidebar: activeSidebar.id as (typeof SIDEBAR_KEYS)[keyof typeof SIDEBAR_KEYS],
          },
          groups: {
            project: project?.ref ?? 'Unknown',
            organization: org?.slug ?? 'Unknown',
          },
        })
        setSidebarLocalStorage(activeSidebar.id)
      } else {
        setSidebarLocalStorage('')
        setSidebarUrlParam(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSidebar])

  // Handle toggling of sidebars on page init
  // Prioritize URL params first, then local storage
  useEffect(() => {
    if (router.isReady && isLoadedLocalStorage) {
      if (
        typeof sidebarURLParamRef.current === 'string' &&
        Object.values(SIDEBAR_KEYS).includes(
          sidebarURLParamRef.current as (typeof SIDEBAR_KEYS)[keyof typeof SIDEBAR_KEYS]
        )
      ) {
        console.log('Open sidebar based on URL')
        openSidebar(sidebarURLParamRef.current)
      } else if (
        !!sidebarLocalStorageRef.current &&
        Object.values(SIDEBAR_KEYS).includes(
          sidebarLocalStorageRef.current as (typeof SIDEBAR_KEYS)[keyof typeof SIDEBAR_KEYS]
        )
      ) {
        openSidebar(sidebarLocalStorageRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, isLoadedLocalStorage])

  return (
    <>
      {children}
      {!!project && (
        <ProjectCopilotWelcomeModal
          open={showWelcome}
          onOpenChange={(open) => {
            setShowWelcome(open)
            if (!open) {
              // Mark seen on dismiss (so it shows exactly once, but survives a
              // reload mid-welcome) and dock the copilot into the side panel.
              setWelcomeSeen(true)
              openSidebar(SIDEBAR_KEYS.PROJECT_COPILOT)
            }
          }}
          onStartGuide={(id) => guideEngineState.start(id, 'welcome')}
        />
      )}
    </>
  )
}
