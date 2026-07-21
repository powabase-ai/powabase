import { ExternalLink } from 'lucide-react'
import { Button } from 'ui'
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

import Indexes from '@/components/interfaces/Database/Indexes/Indexes'
import DatabaseLayout from '@/components/layouts/DatabaseLayout/DatabaseLayout'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { DOCS_URL } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const IndexesPage: NextPageWithLayout = () => {
  return (
    <>
      <PageHeader size="large">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Database Indexes</PageHeaderTitle>
            <PageHeaderDescription>
              Improve query performance against your database
            </PageHeaderDescription>
          </PageHeaderSummary>
          <PageHeaderAside>
            <Button asChild type="default" icon={<ExternalLink strokeWidth={1.5} />}>
              <a
                target="_blank"
                rel="noreferrer"
                className="no-underline"
                href={`${DOCS_URL}/guides/database/extensions/index_advisor`}
              >
                Index Advisor
              </a>
            </Button>
          </PageHeaderAside>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="large">
        <PageSection>
          <PageSectionContent>
            <Indexes />
          </PageSectionContent>
        </PageSection>
      </PageContainer>
    </>
  )
}

IndexesPage.getLayout = (page) => (
  <DefaultLayout>
    <DatabaseLayout title="Indexes">{page}</DatabaseLayout>
  </DefaultLayout>
)

export default IndexesPage
