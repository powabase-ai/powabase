import type { PropsWithChildren } from 'react'

import { ProjectLayout } from '../ProjectLayout'
import { withAuth } from '@/hooks/misc/withAuth'

const AILayout = ({ title, children }: PropsWithChildren<{ title: string }>) => {
  return (
    <ProjectLayout
      product="AI"
      browserTitle={{ section: title }}
      isBlocking={false}
    >
      {children}
    </ProjectLayout>
  )
}

export default withAuth(AILayout)
