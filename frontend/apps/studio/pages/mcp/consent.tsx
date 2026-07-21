import { getAccessToken } from 'common'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Button } from 'ui'

type AuthorizationDetails = {
  authorization_id: string
  redirect_uri: string
  client: { id: string; name: string; uri?: string; logo_uri?: string }
  user: { id: string; email: string }
  scope: string
}

function authHeaders(token: string): Record<string, string> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return { Authorization: `Bearer ${token}`, ...(anonKey ? { apikey: anonKey } : {}) }
}

export default function McpConsentPage() {
  const router = useRouter()
  const [details, setDetails] = useState<AuthorizationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const authorizationId =
    typeof router.query.authorization_id === 'string' ? router.query.authorization_id : undefined

  useEffect(() => {
    if (!router.isReady) return
    if (!authorizationId) {
      setError('This consent link is missing its authorization_id.')
      return
    }
    const gotrueUrl = process.env.NEXT_PUBLIC_GOTRUE_URL
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAccessToken()
        if (!token) {
          const returnTo = encodeURIComponent(`/mcp/consent?authorization_id=${authorizationId}`)
          router.replace(`/sign-in?returnTo=${returnTo}`)
          return
        }
        const res = await fetch(`${gotrueUrl}/oauth/authorizations/${authorizationId}`, {
          headers: authHeaders(token),
        })
        if (cancelled) return
        if (!res.ok) {
          setError('This authorization request has expired or could not be loaded.')
          return
        }
        setDetails((await res.json()) as AuthorizationDetails)
      } catch {
        // Network/CORS/parse failure — surface an error instead of wedging on "Loading…".
        if (!cancelled)
          setError('We could not reach Powabase to load this request. Please try again.')
      }
    })()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, authorizationId])

  async function decide(action: 'approve' | 'deny') {
    if (!authorizationId) return
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const gotrueUrl = process.env.NEXT_PUBLIC_GOTRUE_URL
      const res = await fetch(`${gotrueUrl}/oauth/authorizations/${authorizationId}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setError('We could not record your decision. Please try again.')
        return
      }
      const { redirect_url } = (await res.json()) as { redirect_url: string }
      window.location.href = redirect_url
    } catch {
      // Network/CORS/parse failure — surface an error instead of spinning forever.
      setError('We could not record your decision. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <div className="mx-auto mt-24 max-w-md p-6 text-center">
        <h1 className="text-lg font-medium">Connection request</h1>
        <p className="mt-2 text-sm text-foreground-light">{error}</p>
      </div>
    )
  }
  if (!details) {
    return <div className="mx-auto mt-24 max-w-md p-6 text-center text-sm">Loading…</div>
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-md border p-6">
      <h1 className="text-lg font-medium">Connect to Powabase</h1>
      <p className="mt-2 text-sm text-foreground-light">
        <span className="font-medium text-foreground">{details.client.name}</span> wants to access your
        Powabase account as <span className="font-medium text-foreground">{details.user.email}</span>.
      </p>
      <p className="mt-2 text-sm text-foreground-light">
        Requested scopes: <span className="font-mono">{details.scope}</span>
      </p>
      <div className="mt-6 flex gap-2">
        <Button type="primary" loading={submitting} onClick={() => decide('approve')}>
          Approve
        </Button>
        <Button type="default" disabled={submitting} onClick={() => decide('deny')}>
          Deny
        </Button>
      </div>
    </div>
  )
}
