import Link from 'next/link'
import { parseAsString, useQueryState } from 'nuqs'
import { useState } from 'react'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { SignInWithGitHub } from '@/components/interfaces/SignIn/SignInWithGitHub'
import { SignInWithGoogle } from '@/components/interfaces/SignIn/SignInWithGoogle'
import { SignUpForm } from '@/components/interfaces/SignIn/SignUpForm'
import {
  getSignUpInviteStep,
  type SignUpInviteAcceptance,
} from '@/components/interfaces/SignIn/SignUpInvite.utils'
import { SignUpInviteCodeForm } from '@/components/interfaces/SignIn/SignUpInviteCodeForm'
import SignInLayout from '@/components/layouts/SignInLayout/SignInLayout'
import { UnknownInterface } from '@/components/ui/UnknownInterface'
import { useSignUpInviteRequiredQuery } from '@/data/misc/signup-invite-required-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { IS_PLATFORM } from '@/lib/constants'
import { isGoogleAuthEnabled } from '@/lib/google-auth'
import type { NextPageWithLayout } from '@/types'

const SignUpPage: NextPageWithLayout = () => {
  const {
    dashboardAuthSignUp: signUpEnabled,
    dashboardAuthSignInWithGithub: signInWithGithubEnabled,
  } = useIsFeatureEnabled(['dashboard_auth:sign_up', 'dashboard_auth:sign_in_with_github'])

  const googleAuthEnabled = isGoogleAuthEnabled()

  // Optional invite code step: when the platform API says sign-up needs an invite
  // code, ask for one before showing any way to create an account. If that check
  // fails, the regular page is shown and the server still enforces the rule.
  const [inviteParam] = useQueryState('invite', parseAsString.withDefault(''))
  const [inviteAcceptance, setInviteAcceptance] = useState<SignUpInviteAcceptance | null>(null)
  const { data: inviteRequirement, isLoading: isLoadingInviteRequirement } =
    useSignUpInviteRequiredQuery({ enabled: signUpEnabled })

  const step = getSignUpInviteStep({
    isPlatform: IS_PLATFORM,
    isLoading: isLoadingInviteRequirement,
    required: inviteRequirement?.required,
    acceptance: inviteAcceptance,
  })

  if (!signUpEnabled) {
    return <UnknownInterface fullHeight={false} urlBack="/sign-in" />
  }

  if (step === 'loading') {
    return <GenericSkeletonLoader className="py-2" />
  }

  if (step === 'invite-code') {
    return (
      <>
        <SignUpInviteCodeForm
          // Remount once the query string is available so the link's code is prefilled.
          key={inviteParam}
          defaultCode={inviteParam}
          onAccepted={setInviteAcceptance}
        />
        <HaveAnAccountLink />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* [Powabase] Hidden cloud-only sign-in methods */}
        {/* {signInWithGithubEnabled && (
          <>
            <SignInWithGitHub />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-strong" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-studio px-2 text-sm text-foreground">or</span>
              </div>
            </div>
          </>
        )} */}

        {googleAuthEnabled && (
          <>
            <SignInWithGoogle />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-strong" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-studio px-2 text-sm text-foreground">or</span>
              </div>
            </div>
          </>
        )}

        <SignUpForm inviteCode={inviteAcceptance?.code} />

        {inviteAcceptance?.code && (
          <button
            type="button"
            className="self-center text-sm text-foreground-light underline transition hover:text-foreground"
            onClick={() => setInviteAcceptance(null)}
          >
            Use a different invite code
          </button>
        )}
      </div>

      <HaveAnAccountLink />
    </>
  )
}

const HaveAnAccountLink = () => (
  <div className="my-8 self-center text-sm">
    <span className="text-foreground-light">Have an account?</span>{' '}
    <Link
      href="/sign-in"
      className="underline text-foreground hover:text-foreground-light transition"
    >
      Sign in
    </Link>
  </div>
)

SignUpPage.getLayout = (page) => (
  <SignInLayout heading="Get started" subheading="Create a new account">
    {page}
  </SignInLayout>
)

export default SignUpPage
