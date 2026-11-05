import * as Sentry from '@sentry/nextjs'
import { isAuthImplicitGrantRedirectError } from '@supabase/auth-js'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, useParams } from 'common'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LogoLoader } from 'ui'

import { SignInMfaForm } from '@/components/interfaces/SignIn/SignInMfaForm'
import SignInLayout from '@/components/layouts/SignInLayout/SignInLayout'
import { useAddLoginEvent } from '@/data/misc/audit-login-mutation'
import { useSendEventMutation } from '@/data/telemetry/send-event-mutation'
import useLatest from '@/hooks/misc/useLatest'
import { auth, buildPathWithParams, getReturnToPath } from '@/lib/gotrue'
import type { NextPageWithLayout } from '@/types'

const SignInMfaPage: NextPageWithLayout = () => {
  const router = useRouter()

  const queryClient = useQueryClient()
  const {
    // current methods for mfa are github, sso and google
    method: signInMethod = 'unknown',
  } = useParams()
  const signInMethodRef = useLatest(signInMethod)

  const { mutate: sendEvent } = useSendEventMutation()
  const { mutate: addLoginEvent } = useAddLoginEvent()

  const [loading, setLoading] = useState(true)

  // This useEffect redirects the user to MFA if they're already halfway signed in
  useEffect(() => {
    auth
      .initialize()
      .then(async ({ error }) => {
        if (error) {
          // A failed provider sign-in lands here with an error in the URL. Surface it
          // and go back — otherwise this renders an MFA code prompt to someone who is
          // not signed in, with nothing on screen explaining why.
          // A provider sign-in the server refused (e.g. a new account it won't create
          // yet) comes back as `access_denied`; offer the way to sign-up as well.
          const isAccessDenied =
            isAuthImplicitGrantRedirectError(error) && error.details?.error === 'access_denied'
          toast.error(
            `Failed to sign in: ${error.message}`,
            isAccessDenied
              ? { action: { label: 'Go to sign up', onClick: () => router.push('/sign-up') } }
              : undefined
          )
          setLoading(false)
          // Drop the provider's error params: the sign-in buttons carry the current query
          // string into their redirect, so leaving them here would make the next,
          // successful attempt fail with this same stale error.
          const {
            error: _error,
            error_code: _code,
            error_description: _description,
            ...query
          } = router.query
          return router.push({ pathname: '/sign-in', query })
        }

        const token = await getAccessToken()

        if (token) {
          const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel()
          if (error) {
            // The assurance-level check failed after sign-in — surface the error and redirect back to sign-in.
            toast.error(
              `Failed to retrieve assurance level: ${error.message}. Please try signing in again`
            )
            setLoading(false)
            return router.push({ pathname: '/sign-in', query: router.query })
          }

          if (data.currentLevel === data.nextLevel) {
            sendEvent({
              action: 'sign_in',
              properties: {
                category: 'account',
                method: signInMethodRef.current,
              },
            })
            addLoginEvent({})

            await queryClient.resetQueries()
            router.push(getReturnToPath())
            return
          } else {
            // Show the MFA form
            setLoading(false)
            return
          }
        } else {
          // if the user doesn't have a token, he needs to go back to the sign-in page
          const redirectTo = buildPathWithParams('/sign-in')
          router.replace(redirectTo)
          return
        }
      })
      .catch((error) => {
        Sentry.captureException(error)
        console.error('Auth initialization error:', error)
        toast.error('Failed to initialize authentication. Please try again.')
        setLoading(false)
        router.push({ pathname: '/sign-in', query: router.query })
      })
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 bg-alternative h-screen items-center justify-center">
        <LogoLoader />
      </div>
    )
  }

  return (
    <SignInLayout
      heading="Two-factor authentication"
      subheading="Enter the authentication code from your two-factor authentication app"
    >
      <div className="flex flex-col gap-5">
        <SignInMfaForm />
      </div>
    </SignInLayout>
  )
}

export default SignInMfaPage
