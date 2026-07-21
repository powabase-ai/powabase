import { InfrastructureComputeSection } from '@/components/interfaces/Infrastructure/InfrastructureComputeSection'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from '@/components/layouts/ProjectLayout'
import {
  ScaffoldContainer,
  ScaffoldHeader,
  ScaffoldTitle,
} from '@/components/layouts/Scaffold'
import type { NextPageWithLayout } from '@/types'

const InfrastructurePage: NextPageWithLayout = () => {
  return (
    <>
      <ScaffoldContainer>
        <ScaffoldHeader>
          <ScaffoldTitle>Infrastructure</ScaffoldTitle>
        </ScaffoldHeader>
      </ScaffoldContainer>
      <InfrastructureComputeSection />
    </>
  )
}

InfrastructurePage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default InfrastructurePage
