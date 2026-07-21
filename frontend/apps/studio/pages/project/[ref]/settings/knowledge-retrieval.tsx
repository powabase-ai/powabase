import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const KnowledgeRetrievalSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="knowledge-retrieval" />
}

KnowledgeRetrievalSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Knowledge Retrieval Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default KnowledgeRetrievalSettingsPage
