import { TroubleshootingAccordion } from '../TroubleshootingAccordion'
import {
  FixWithAITroubleshootingSection,
  RestartDatabaseTroubleshootingSection,
  TroubleshootingGuideSection,
} from '../TroubleshootingSections'
import { SIDEBAR_KEYS } from '@/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { getDocsLandingUrl } from '@/lib/constants/docs'
import { useAiAssistantStateSnapshot } from '@/state/ai-assistant-state'
import { useSidebarManagerSnapshot } from '@/state/sidebar-manager-state'

const ERROR_TYPE = 'connection-timeout'

const BUILD_PROMPT = () =>
  `The user is encountering connection timeout errors. The error message is: "CONNECTION TERMINATED DUE TO CONNECTION TIMEOUT". What are the most likely causes of this issue and how can the user resolve it?`

export function ConnectionTimeoutTroubleshooting() {
  const { openSidebar } = useSidebarManagerSnapshot()
  const aiSnap = useAiAssistantStateSnapshot()
  const aiAssistantEnabled = useIsFeatureEnabled('ai:assistant')

  const stepTitles: Record<number, string> = {
    1: 'Try restarting your project',
    2: 'Try our troubleshooting guide',
  }
  if (aiAssistantEnabled) {
    stepTitles[3] = 'Debug with AI'
  }

  return (
    <TroubleshootingAccordion errorType={ERROR_TYPE} stepTitles={stepTitles}>
      <RestartDatabaseTroubleshootingSection number={1} errorType={ERROR_TYPE} />
      <TroubleshootingGuideSection
        number={2}
        errorType={ERROR_TYPE}
        href={getDocsLandingUrl()}
        description="Follow step-by-step instructions for diagnosing connection timeout issues."
      />
      {aiAssistantEnabled && (
        <FixWithAITroubleshootingSection
          number={3}
          errorType={ERROR_TYPE}
          onDebugWithAI={(prompt) => {
            openSidebar(SIDEBAR_KEYS.AI_ASSISTANT)
            aiSnap.newChat({ initialMessage: prompt })
          }}
          buildPrompt={BUILD_PROMPT}
        />
      )}
    </TroubleshootingAccordion>
  )
}
