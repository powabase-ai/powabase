import HCaptcha from '@hcaptcha/react-hcaptcha'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'

import { NewOrgForm } from '@/components/interfaces/Organization/NewOrg/NewOrgForm'
import { AppLayout } from '@/components/layouts/AppLayout/AppLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import WizardLayout from '@/components/layouts/WizardLayout'
import { SetupIntentResponse, useSetupIntent } from '@/data/stripe/setup-intent-mutation'
import { useSignupSurveyExemptMutation } from '@/data/signup-survey/signup-survey-exempt-mutation'
import { useCustomContent } from '@/hooks/custom-content/useCustomContent'
import { useSignupSurveyGate } from '@/hooks/misc/useSignupSurveyGate'
import { isHCaptchaEnabled } from '@/lib/hcaptcha'
import { buildStudioPageTitle } from '@/lib/page-title'
import type { NextPageWithLayout } from '@/types'

/**
 * No org selected yet, create a new one
 */
const Wizard: NextPageWithLayout = () => {
  const router = useRouter()
  const gate = useSignupSurveyGate()
  const exempt = useSignupSurveyExemptMutation()

  useEffect(() => {
    if (gate.state === 'redirect-to-onboarding') {
      router.replace('/onboarding')
    } else if (
      gate.state === 'auto-exempt' &&
      !exempt.isPending &&
      !exempt.isSuccess
    ) {
      exempt.mutate()
    }
  }, [gate.state, router, exempt.isPending, exempt.isSuccess, exempt.mutate])

  const [intent, setIntent] = useState<SetupIntentResponse>()
  const { appTitle } = useCustomContent(['app:title'])
  const pageTitle = buildStudioPageTitle({
    section: 'New Organization',
    brand: appTitle || 'Powabase',
  })

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRef, setCaptchaRef] = useState<HCaptcha | null>(null)

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  const { mutate: setupIntent } = useSetupIntent({ onSuccess: (res) => setIntent(res) })

  const captchaRefCallback = useCallback((node: any) => {
    setCaptchaRef(node)
  }, [])

  const initSetupIntent = async (hcaptchaToken: string | undefined) => {
    if (isHCaptchaEnabled() && !hcaptchaToken)
      return console.error('Hcaptcha token is required')

    // Force a reload of Elements, necessary for Stripe
    // Also mitigates card testing to some extent as we generate a new captcha token
    setIntent(undefined)
    setupIntent({ hcaptchaToken: hcaptchaToken ?? '' })
  }

  const loadPaymentForm = async (force = false) => {
    if (selectedPlan == null || selectedPlan === 'FREE') return
    if (intent != null && !force) return

    if (captchaRef) {
      let token = captchaToken

      try {
        if (isHCaptchaEnabled() && !token) {
          const captchaResponse = await captchaRef.execute({ async: true })
          token = captchaResponse?.response ?? null
        }
      } catch (error) {
        return
      }

      await initSetupIntent(token ?? undefined)
      resetCaptcha()
    }
  }

  useEffect(() => {
    loadPaymentForm()
  }, [captchaRef, selectedPlan])

  const resetSetupIntent = () => {
    setIntent(undefined)
    return loadPaymentForm(true)
  }

  const onLocalCancel = () => {
    setIntent(undefined)
  }

  const resetCaptcha = () => {
    setCaptchaToken(null)
    captchaRef?.resetCaptcha()
  }

  if (gate.state === 'loading') {
    return <div className="p-12 text-center text-sm text-foreground-light">Loading…</div>
  }
  if (gate.state !== 'pass') {
    // We're about to redirect to /onboarding, or the exempt mutation is running.
    // Render nothing — the effect above handles navigation.
    return null
  }

  return (
    <>
      {/* Wizard layouts set the visual header but not the browser tab title. */}
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Supabase Studio" />
      </Head>
      <HCaptcha
        ref={captchaRefCallback}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
        size="invisible"
        onVerify={(token) => {
          setCaptchaToken(token)
        }}
        onClose={onLocalCancel}
        onExpire={() => {
          setCaptchaToken(null)
        }}
      />

      <NewOrgForm
        setupIntent={intent}
        onPaymentMethodReset={() => resetSetupIntent()}
        onPlanSelected={(plan) => setSelectedPlan(plan)}
      />
    </>
  )
}

Wizard.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout hideMobileMenu headerTitle="New organization">
      <WizardLayout>{page}</WizardLayout>
    </DefaultLayout>
  </AppLayout>
)

export default Wizard
