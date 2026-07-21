import { PermissionAction } from '@supabase/shared-types/out/constants'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderAside,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

import { Extensions } from '@/components/interfaces/Database/Extensions/Extensions'
import DatabaseLayout from '@/components/layouts/DatabaseLayout/DatabaseLayout'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import NoPermission from '@/components/ui/NoPermission'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import type { NextPageWithLayout } from '@/types'

const DatabaseExtensions: NextPageWithLayout = () => {
  const { can: canReadExtensions, isSuccess: isPermissionsLoaded } = useAsyncCheckPermissions(
    PermissionAction.TENANT_SQL_ADMIN_READ,
    'extensions'
  )

  if (isPermissionsLoaded && !canReadExtensions) {
    return <NoPermission isFullPage resourceText="view database extensions" />
  }

  return (
    <>
      <PageHeader size="large">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Database Extensions</PageHeaderTitle>
            <PageHeaderDescription>
              Manage what extensions are installed in your database
            </PageHeaderDescription>
          </PageHeaderSummary>
          <PageHeaderAside>
          </PageHeaderAside>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="large">
        <PageSection>
          <PageSectionContent>
            <Extensions />
          </PageSectionContent>
        </PageSection>
      </PageContainer>
    </>
  )
}

DatabaseExtensions.getLayout = (page) => (
  <DefaultLayout>
    <DatabaseLayout title="Extensions">{page}</DatabaseLayout>
  </DefaultLayout>
)

export default DatabaseExtensions
