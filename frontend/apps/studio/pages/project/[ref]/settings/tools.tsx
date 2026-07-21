import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const ToolsSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="tools" />
}

ToolsSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Tools Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default ToolsSettingsPage
