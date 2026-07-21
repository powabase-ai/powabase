import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const KnowledgeIndexingSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="knowledge-indexing" />
}

KnowledgeIndexingSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Knowledge Indexing Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default KnowledgeIndexingSettingsPage
