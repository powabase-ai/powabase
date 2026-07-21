import { IS_PLATFORM } from 'common'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { DeleteProjectPanel } from '@/components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectPanel'
import { General } from '@/components/interfaces/Settings/General/General'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import SettingsLayout from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import type { NextPageWithLayout } from '@/types'

const ProjectSettings: NextPageWithLayout = () => {
  const { data: project } = useSelectedProjectQuery()

  const isBranch = !!project?.parent_project_ref
  const router = useRouter()

  useEffect(() => {
    if (!IS_PLATFORM) {
      router.push(`/project/default/settings/log-drains`)
    }
  }, [router])

  return (
    <>
      <PageHeader size="small">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Project Settings</PageHeaderTitle>
            <PageHeaderDescription>
              General configuration, domains, ownership, and lifecycle
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="small">
        <General />
        {!isBranch && <DeleteProjectPanel />}
      </PageContainer>
    </>
  )
}

ProjectSettings.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="General">{page}</SettingsLayout>
  </DefaultLayout>
)
export default ProjectSettings
