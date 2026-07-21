import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RedirectToGeneralSettings() {
  const router = useRouter()
  const ref = router.query.ref as string
  useEffect(() => {
    if (ref) router.replace(`/project/${ref}/settings/general`)
  }, [ref, router])
  return null
}
