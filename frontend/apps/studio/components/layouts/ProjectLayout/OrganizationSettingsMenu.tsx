import { useParams } from 'common'
import { useRouter } from 'next/router'

import {
  generateOrganizationSettingsSections,
  normalizeOrganizationSettingsPath,
} from './OrganizationSettingsLayout'
import { SubMenu } from '@/components/ui/ProductMenu/SubMenu'
import { getPathnameWithoutQuery } from '@/lib/pathname.utils'

export interface OrganizationSettingsMenuProps {
  onCloseSheet?: () => void
}

export function OrganizationSettingsMenu({ onCloseSheet }: OrganizationSettingsMenuProps) {
  const router = useRouter()
  const { slug } = useParams()
  const organizationSlug = slug ?? (router.query.orgSlug as string) ?? ''

  const pathname = getPathnameWithoutQuery(router.asPath, router.pathname)
  const currentPath = normalizeOrganizationSettingsPath(pathname)

  const sections = generateOrganizationSettingsSections({
    slug: organizationSlug,
    currentPath,
  })

  const page = currentPath.split('/').filter(Boolean).pop()

  return <SubMenu sections={sections} page={page} onItemClick={onCloseSheet} />
}
