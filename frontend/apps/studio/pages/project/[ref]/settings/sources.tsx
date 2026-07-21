import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const SourcesSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="sources" />
}

SourcesSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Sources Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default SourcesSettingsPage
