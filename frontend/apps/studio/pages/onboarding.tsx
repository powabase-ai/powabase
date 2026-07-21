import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { SignupSurveyWizard } from '@/components/interfaces/Onboarding/SignupSurveyWizard'
import { AppLayout } from '@/components/layouts/AppLayout/AppLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import WizardLayout from '@/components/layouts/WizardLayout'
import { useSignupSurveyExemptMutation } from '@/data/signup-survey/signup-survey-exempt-mutation'
import { useSignupSurveySchemaQuery } from '@/data/signup-survey/signup-survey-schema-query'
import { useCustomContent } from '@/hooks/custom-content/useCustomContent'
import { useSignupSurveyGate } from '@/hooks/misc/useSignupSurveyGate'
import { withAuth } from '@/hooks/misc/withAuth'
import { buildStudioPageTitle } from '@/lib/page-title'
import type { NextPageWithLayout } from '@/types'

const OnboardingPage: NextPageWithLayout = () => {
  const router = useRouter()
  const { appTitle } = useCustomContent(['app:title'])
  const pageTitle = buildStudioPageTitle({
    section: 'Welcome',
    brand: appTitle || 'Powabase',
  })

  const gate = useSignupSurveyGate()
  const schemaQuery = useSignupSurveySchemaQuery({
    enabled: gate.state === 'redirect-to-onboarding',
  })
  const exempt = useSignupSurveyExemptMutation({
    onSuccess: () => router.replace('/organizations'),
  })

  // Inverse gate: if the user has already passed, don't show the wizard.
  useEffect(() => {
    if (gate.state === 'pass') {
      router.replace('/organizations')
    } else if (
      gate.state === 'auto-exempt' &&
      !exempt.isPending &&
      !exempt.isSuccess
    ) {
      exempt.mutate()
    }
  }, [gate.state, router, exempt.isPending, exempt.isSuccess, exempt.mutate])

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Powabase" />
      </Head>

      {(gate.state === 'loading' || schemaQuery.isLoading) && (
        <div className="p-12 text-center text-sm text-foreground-light">Loading…</div>
      )}

      {gate.state === 'redirect-to-onboarding' && schemaQuery.data && (
        <SignupSurveyWizard
          schema={schemaQuery.data}
          onComplete={() => router.replace('/organizations')}
        />
      )}
    </>
  )
}

OnboardingPage.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="Welcome">
      <WizardLayout>{page}</WizardLayout>
    </DefaultLayout>
  </AppLayout>
)

export default withAuth(OnboardingPage)
