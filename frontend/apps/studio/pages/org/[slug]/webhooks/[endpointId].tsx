import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RedirectToOrg() {
  const router = useRouter()
  const slug = router.query.slug as string
  useEffect(() => {
    if (slug) router.replace(`/org/${slug}`)
  }, [slug, router])
  return null
}
