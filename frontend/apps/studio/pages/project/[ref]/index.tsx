import { IS_PLATFORM } from 'common'

import { Home } from '@/components/interfaces/Home/Home'
import { ProjectHome } from '@/components/interfaces/ProjectHome/Home'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from '@/components/layouts/ProjectLayout'
import type { NextPageWithLayout } from '@/types'

const HomePage: NextPageWithLayout = () => {
  // IS_PLATFORM is UPSTREAM Supabase's hosted-vs-self-hosted switch
  // (NEXT_PUBLIC_IS_PLATFORM, baked at build time) — NOT a Powabase feature
  // gate. The fork repurposes this split to serve its own overview:
  //   true  → ProjectHome (Powabase overview; Docker/prod builds set it true)
  //   false → Home (upstream overview; `make dev-fe` leaves the env unset)
  // Powabase UI mounted on this page must exist in BOTH variants (or at
  // minimum ProjectHome, the one every deployed build renders). Product
  // gating belongs in useIsFeatureEnabled / per-org enabled_features instead.
  return IS_PLATFORM ? <ProjectHome /> : <Home />
}

HomePage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default HomePage
