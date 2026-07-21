import { SettingsForm } from "@/components/interfaces/AI/Shared/SettingsForm"
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { SettingsLayout } from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const AgentsSettingsPage: NextPageWithLayout = () => {
  return <SettingsForm category="agents" />
}

AgentsSettingsPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Agents Settings">{page}</SettingsLayout>
  </DefaultLayout>
)

export default AgentsSettingsPage
