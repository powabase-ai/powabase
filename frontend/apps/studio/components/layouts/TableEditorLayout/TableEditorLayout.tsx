import { PermissionAction } from '@supabase/shared-types/out/constants'
import { PropsWithChildren, useEffect } from 'react'

import { ProjectLayoutWithAuth } from '../ProjectLayout'
import { SaveQueueActionBar } from '@/components/grid/components/footer/operations/SaveQueueActionBar'
import { useBannerStack } from '@/components/ui/BannerStack/BannerStackProvider'
import NoPermission from '@/components/ui/NoPermission'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'

export const TableEditorLayout = ({ children }: PropsWithChildren<{}>) => {
  const { dismissBanner } = useBannerStack()

  const { can: canReadTables, isSuccess: isPermissionsLoaded } = useAsyncCheckPermissions(
    PermissionAction.TENANT_SQL_ADMIN_READ,
    'tables'
  )

  // "Queue row edits in Table Editor" promo banner is disabled — the
  // underlying queue-operations feature isn't wired up in this fork, so
  // showing the banner advertises something the user can't actually use.
  // Always-dismiss covers the case where a stale banner was added in a
  // prior session before this guard landed.
  useEffect(() => {
    dismissBanner('table-editor-queue-operations-banner')
    return () => {
      dismissBanner('table-editor-queue-operations-banner')
    }
  }, [dismissBanner])

  if (isPermissionsLoaded && !canReadTables) {
    return (
      <ProjectLayoutWithAuth isBlocking={false}>
        <NoPermission isFullPage resourceText="view tables from this project" />
      </ProjectLayoutWithAuth>
    )
  }

  return (
    <>
      {children}
      <SaveQueueActionBar />
    </>
  )
}
