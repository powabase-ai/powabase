import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RedirectToProject() {
  const router = useRouter()
  const ref = router.query.ref as string
  useEffect(() => {
    if (ref) router.replace(`/project/${ref}`)
  }, [ref, router])
  return null
}
