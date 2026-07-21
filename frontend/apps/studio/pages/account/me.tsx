import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { AccountIdentities } from '@/components/interfaces/Account/Preferences/AccountIdentities'
import { DashboardSettings } from '@/components/interfaces/Account/Preferences/DashboardSettings'
import { HotkeySettings } from '@/components/interfaces/Account/Preferences/HotkeySettings'
import { ThemeSettings } from '@/components/interfaces/Account/Preferences/ThemeSettings'
import AccountLayout from '@/components/layouts/AccountLayout/AccountLayout'
import { AppLayout } from '@/components/layouts/AppLayout/AppLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import { IS_PLATFORM } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const User: NextPageWithLayout = () => {
  return IS_PLATFORM ? <PlatformPreferences /> : <SelfHostedPreferences />
}

User.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout headerTitle={IS_PLATFORM ? 'Account' : 'Preferences'}>
      <AccountLayout title="Preferences">{page}</AccountLayout>
    </DefaultLayout>
  </AppLayout>
)

export default User

const PreferencesPageHeader = ({ description }: { description: string }) => (
  <PageHeader size="small">
    <PageHeaderMeta>
      <PageHeaderSummary>
        <PageHeaderTitle>Preferences</PageHeaderTitle>
        <PageHeaderDescription>{description}</PageHeaderDescription>
      </PageHeaderSummary>
    </PageHeaderMeta>
  </PageHeader>
)

const PlatformPreferences = () => {
  return (
    <>
      <PreferencesPageHeader description="Manage your account identities and password." />
      <PageContainer size="small">
        <AccountIdentities />
      </PageContainer>
    </>
  )
}

const SelfHostedPreferences = () => {
  return (
    <>
      <PreferencesPageHeader description="Manage how the dashboard looks and behaves on this browser and device." />
      <PageContainer size="small">
        <ThemeSettings />

        <HotkeySettings />

        <DashboardSettings />
      </PageContainer>
    </>
  )
}
