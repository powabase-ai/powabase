import { useParams } from 'common'
import { ArrowUpRight } from 'lucide-react'

import { useIsColumnLevelPrivilegesEnabled } from '@/components/interfaces/App/FeaturePreview/FeaturePreviewContext'
import type {
  ProductMenuGroup,
  ProductMenuGroupItem,
} from '@/components/ui/ProductMenu/ProductMenu.types'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'

const ExternalLinkIcon = <ArrowUpRight strokeWidth={1} className="h-4 w-4" />

export const useGenerateDatabaseMenu = (): ProductMenuGroup[] => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()

  const {
    databaseRoles: showRoles,
  } = useIsFeatureEnabled(['database:roles'])

  const columnLevelPrivileges = useIsColumnLevelPrivilegesEnabled()

  const getDatabaseURL = (path: string) => `/project/${ref}/database/${path}`

  return [
    {
      title: 'Database Management',
      items: [
        { name: 'Schema Visualizer', key: 'schemas', url: getDatabaseURL('schemas') },
        { name: 'Tables', key: 'tables', url: getDatabaseURL('tables') },
        { name: 'Functions', key: 'functions', url: getDatabaseURL('functions') },
        { name: 'Triggers', key: 'triggers', url: getDatabaseURL('triggers/data') },
        { name: 'Enumerated Types', key: 'types', url: getDatabaseURL('types') },
        { name: 'Extensions', key: 'extensions', url: getDatabaseURL('extensions') },
        { name: 'Indexes', key: 'indexes', url: getDatabaseURL('indexes') },
        { name: 'Publications', key: 'publications', url: getDatabaseURL('publications') },
      ],
    },
    {
      title: 'Configuration',
      items: [
        showRoles && { name: 'Roles', key: 'roles', url: getDatabaseURL('roles') },
        columnLevelPrivileges && {
          name: 'Column Privileges',
          key: 'column-privileges',
          url: getDatabaseURL('column-privileges'),
        },
        {
          name: 'Policies',
          key: 'policies',
          url: `/project/${ref}/auth/policies`,
          rightIcon: ExternalLinkIcon,
        },
        // Settings — gated: needs Supabase cloud infra (pooling, SSL, network, disk)
      ].filter(Boolean) as ProductMenuGroupItem[],
    },
    // Platform section — gated: Replication, Backups, Migrations, Wrappers, Webhooks
    // (Wrappers and Webhooks redirect to /integrations which is cloud-only)
  ]
}
