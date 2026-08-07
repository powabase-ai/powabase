import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from 'ui'

import { LastSignInWrapper } from './LastSignInWrapper'
import { useLastSignIn } from '@/hooks/misc/useLastSignIn'
import { BASE_PATH } from '@/lib/constants'
import { captureCriticalError } from '@/lib/error-reporting'
import { auth, buildPathWithParams } from '@/lib/gotrue'

export const SignInWithGoogle = () => {
  const [loading, setLoading] = useState(false)
  const [_, setLastSignInUsed] = useLastSignIn()

  async function handleGoogleSignIn() {
    setLoading(true)

    try {
      // Land on /sign-in-mfa, which decides whether an MFA step is actually needed.
      // NOT SignInLayout — that bails out early when pathname === '/sign-in-mfa'
      // (SignInLayout.tsx:57-59), so the page's own effect is what runs here.
      const redirectTo = buildPathWithParams(
        `${
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
            ? location.origin
            : process.env.NEXT_PUBLIC_SITE_URL
        }${BASE_PATH}/sign-in-mfa?method=google`
      )

      const { error } = await auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })

      if (error) throw error
      else setLastSignInUsed('google')
    } catch (error: any) {
      toast.error(`Failed to sign in via Google: ${error.message}`)
      captureCriticalError(error, 'sign in via Google')
      setLoading(false)
    }
  }

  return (
    <LastSignInWrapper type="google">
      <Button
        block
        onClick={handleGoogleSignIn}
        // width 20 matches the loading spinner so the label does not shift when loading
        icon={
          <img
            src={`${BASE_PATH}/img/icons/google-icon.svg`}
            width={20}
            height={18}
            alt="Google auth icon"
          />
        }
        size="large"
        type="default"
        loading={loading}
      >
        Continue with Google
      </Button>
    </LastSignInWrapper>
  )
}
