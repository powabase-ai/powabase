import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RedirectToAuthUsers() {
  const router = useRouter()
  const ref = router.query.ref as string
  useEffect(() => {
    if (ref) router.replace(`/project/${ref}/auth/users`)
  }, [ref, router])
  return null
}
