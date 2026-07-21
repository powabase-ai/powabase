import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useParams } from 'common'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import { Separator } from 'ui'

import {
  ApiKeysCreateCallout,
  ApiKeysFeedbackBanner,
} from '@/components/interfaces/APIKeys/ApiKeysIllustrations'
import { PublishableAPIKeys } from '@/components/interfaces/APIKeys/PublishableAPIKeys'
import { SecretAPIKeys } from '@/components/interfaces/APIKeys/SecretAPIKeys'
import ApiKeysLayout from '@/components/layouts/APIKeys/APIKeysLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import SettingsLayout from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import { DisableInteraction } from '@/components/ui/DisableInteraction'
import { useAPIKeysQuery } from '@/data/api-keys/api-keys-query'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import type { NextPageWithLayout } from '@/types'

const ApiKeysNewPage: NextPageWithLayout = () => {
  const { ref: projectRef } = useParams()
  const router = useRouter()
  const newApiKeyFormatEnabled = useIsFeatureEnabled('project_settings:new_api_key_format')

  const { can: canReadAPIKeys } = useAsyncCheckPermissions(PermissionAction.SECRETS_READ, '*')
  const { data: apiKeysData = [] } = useAPIKeysQuery(
    {
      projectRef,
      reveal: false,
    },
    { enabled: canReadAPIKeys && newApiKeyFormatEnabled }
  )

  useEffect(() => {
    if (!newApiKeyFormatEnabled && projectRef) {
      router.replace(`/project/${projectRef}/settings/api-keys/legacy`)
    }
  }, [newApiKeyFormatEnabled, projectRef, router])

  const newApiKeys = useMemo(
    () => apiKeysData.filter(({ type }) => type === 'publishable' || type === 'secret'),
    [apiKeysData]
  )
  const hasNewApiKeys = newApiKeys.length > 0

  if (!newApiKeyFormatEnabled) return null

  return (
    <>
      {canReadAPIKeys && !hasNewApiKeys && <ApiKeysCreateCallout />}
      {hasNewApiKeys && <ApiKeysFeedbackBanner />}
      <DisableInteraction disabled={!hasNewApiKeys} className="flex flex-col gap-8">
        <PublishableAPIKeys />
        <Separator />
        <SecretAPIKeys />
      </DisableInteraction>
    </>
  )
}

ApiKeysNewPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="API Keys">
      <ApiKeysLayout>{page}</ApiKeysLayout>
    </SettingsLayout>
  </DefaultLayout>
)

export default ApiKeysNewPage
