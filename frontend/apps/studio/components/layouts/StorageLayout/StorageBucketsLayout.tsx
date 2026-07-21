import { useParams } from 'common'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { NavMenu, NavMenuItem } from 'ui'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderNavigationTabs,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { BUCKET_TYPES } from '@/components/interfaces/Storage/Storage.constants'
import { useStorageV2Page } from '@/components/interfaces/Storage/Storage.utils'

export const StorageBucketsLayout = ({
  title,
  hideSubtitle = false,
  children,
}: PropsWithChildren<{ title?: string; hideSubtitle?: boolean }>) => {
  const { ref } = useParams()
  const pathname = usePathname()
  const page = useStorageV2Page()
  const config = !!page && page !== 's3' ? BUCKET_TYPES[page] : undefined

  const navigationItems =
    page === 'files'
      ? [
          {
            label: 'Buckets',
            href: `/project/${ref}/storage/files`,
          },
          // Settings — gated: needs Supabase cloud storage config API
          {
            label: 'Policies',
            href: `/project/${ref}/storage/files/policies`,
          },
        ]
      : []

  return (
    <>
      <PageHeader>
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>{title || (config?.displayName ?? 'Storage')}</PageHeaderTitle>
            {!hideSubtitle && (
              <PageHeaderDescription>
                {config?.description || 'Manage your storage buckets and files.'}
              </PageHeaderDescription>
            )}
          </PageHeaderSummary>

        </PageHeaderMeta>

        {navigationItems.length > 0 && (
          <PageHeaderNavigationTabs>
            <NavMenu>
              {navigationItems.map((item) => (
                <NavMenuItem key={item.label} active={pathname === item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </NavMenuItem>
              ))}
            </NavMenu>
          </PageHeaderNavigationTabs>
        )}
      </PageHeader>
      {children}
    </>
  )
}
