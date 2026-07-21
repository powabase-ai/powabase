import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RedirectToStorage() {
  const router = useRouter()
  const ref = router.query.ref as string
  useEffect(() => {
    if (ref) router.replace(`/project/${ref}/storage/files`)
  }, [ref, router])
  return null
}
