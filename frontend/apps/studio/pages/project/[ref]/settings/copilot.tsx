import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const CopilotSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="copilot" />
}

CopilotSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Copilot Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default CopilotSettingsPage
