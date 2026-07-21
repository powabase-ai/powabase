import { useParams } from 'common'
import { PropsWithChildren } from 'react'

import type { SidebarSection } from '@/components/layouts/AccountLayout/AccountLayout.types'
import { WithSidebar } from '@/components/layouts/AccountLayout/WithSidebar'
import { useCurrentPath } from '@/hooks/misc/useCurrentPath'

interface OrganizationSettingsMenuItemsProps {
  slug?: string
  showSecuritySettings?: boolean
  showSsoSettings?: boolean
  showLegalDocuments?: boolean
  showPlatformWebhooks?: boolean
  showPrivateApps?: boolean
}

interface OrganizationSettingsSectionsProps extends OrganizationSettingsMenuItemsProps {
  currentPath: string
}

export const normalizeOrganizationSettingsPath = (path: string) => path.split('#')[0]

export const generateOrganizationSettingsMenuItems = ({
  slug,
}: OrganizationSettingsMenuItemsProps) => [
  {
    key: 'general',
    label: 'General',
    href: `/org/${slug}/general`,
  },
  // Hidden — no backend support:
  // Security (cloud IAM), OAuth Apps, SSO, Webhooks, Audit Logs, Legal Documents, Team, Billing, Usage
]

export const generateOrganizationSettingsSections = ({
  currentPath,
  slug,
}: OrganizationSettingsSectionsProps): SidebarSection[] => {
  const isLinkActive = (_key: string, href: string) => currentPath === href

  const configurationLinks = [
    {
      key: 'general',
      label: 'General',
      href: `/org/${slug}/general`,
    },
    // Hidden — no backend support:
    // Security, SSO, OAuth Apps, Webhooks, Audit Logs, Legal Documents
  ]

  return [
    {
      key: 'configuration',
      heading: 'Configuration',
      links: configurationLinks.map((item) => ({
        ...item,
        isActive: isLinkActive(item.key, item.href),
      })),
    },
    // Hidden sections: Connections (OAuth Apps, Webhooks), Compliance (Audit Logs, Legal Documents)
  ]
}

export function OrganizationSettingsLayout({ children }: PropsWithChildren) {
  const { slug } = useParams()
  const fullCurrentPath = useCurrentPath()
  const currentPath = normalizeOrganizationSettingsPath(fullCurrentPath)

  const sections = generateOrganizationSettingsSections({
    currentPath,
    slug,
  })

  // Browser titles for org settings routes are set by OrganizationLayout.
  return (
    <WithSidebar
      title="Organization Settings"
      breadcrumbs={[]}
      sections={sections}
      header={
        <div className="border-default flex min-h-[var(--header-height)] items-center border-b px-6">
          <h4 className="text-lg">Settings</h4>
        </div>
      }
    >
      {children}
    </WithSidebar>
  )
}

export default OrganizationSettingsLayout
