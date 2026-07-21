import { IS_PLATFORM, useParams } from 'common'
import Link from 'next/link'
import { Badge, Menu } from 'ui'

import { BUCKET_TYPES } from './Storage.constants'
import { useStorageV2Page } from './Storage.utils'
import {
  useIsAnalyticsBucketsEnabled,
  useIsVectorBucketsEnabled,
} from '@/data/config/project-storage-config-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

export const StorageMenuV2 = () => {
  const { ref } = useParams()
  const page = useStorageV2Page()

  const { storageAnalytics, storageVectors } = useIsFeatureEnabled([
    'storage:analytics',
    'storage:vectors',
  ])

  const isAnalyticsBucketsEnabled = useIsAnalyticsBucketsEnabled({ projectRef: ref })
  const isVectorBucketsEnabled = useIsVectorBucketsEnabled({ projectRef: ref })

  const bucketTypes = Object.entries(BUCKET_TYPES).filter(([key]) => {
    // Analytics and Vectors — gated: needs Supabase cloud features
    if (key === 'analytics') return false
    if (key === 'vectors') return false
    return true
  })

  return (
    <Menu type="pills" className="my-2 md:my-4 flex flex-grow flex-col">
      <div className="space-y-4">
        <div className="md:mx-3">
          <Menu.Group title={<span className="uppercase font-mono">Manage</span>} />

          {bucketTypes.map(([type, config]) => {
            const isSelected = page === type
            const isAlphaEnabled =
              (type === 'analytics' && isAnalyticsBucketsEnabled) ||
              (type === 'vectors' && isVectorBucketsEnabled)

            return (
              <Link key={type} href={`/project/${ref}/storage/${type}`}>
                <Menu.Item rounded active={isSelected}>
                  <div className="flex items-center justify-between">
                    <p className="truncate">{config.displayName}</p>
                    {isAlphaEnabled && <Badge variant="success">New</Badge>}
                  </div>
                </Menu.Item>
              </Link>
            )
          })}
        </div>

        {/* S3 Configuration — gated: local disk storage, no S3 backend */}
      </div>
    </Menu>
  )
}
