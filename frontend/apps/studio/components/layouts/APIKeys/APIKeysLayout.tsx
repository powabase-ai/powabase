import { useParams } from 'common'
import { PropsWithChildren } from 'react'

import { PageLayout } from '@/components/layouts/PageLayout/PageLayout'
import { ScaffoldContainer } from '@/components/layouts/Scaffold'
import { DocsButton } from '@/components/ui/DocsButton'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

const ApiKeysLayout = ({ children }: PropsWithChildren) => {
  const { ref: projectRef } = useParams()
  const newApiKeyFormatEnabled = useIsFeatureEnabled('project_settings:new_api_key_format')

  const navigationItems = [
    ...(newApiKeyFormatEnabled
      ? [
          {
            label: 'Publishable and secret API keys',
            href: `/project/${projectRef}/settings/api-keys`,
            id: 'new-keys',
          },
        ]
      : []),
    {
      label: newApiKeyFormatEnabled
        ? 'Legacy anon, service_role API keys'
        : 'Project API keys',
      href: `/project/${projectRef}/settings/api-keys/legacy`,
      id: 'legacy-keys',
    },
  ]

  return (
    <PageLayout
      title="API Keys"
      subtitle="Configure API keys to securely control access to your project"
      navigationItems={navigationItems}
      secondaryActions={<DocsButton />}
    >
      <ScaffoldContainer className="flex flex-col py-8 gap-8" bottomPadding>
        {children}
      </ScaffoldContainer>
    </PageLayout>
  )
}

export default ApiKeysLayout
