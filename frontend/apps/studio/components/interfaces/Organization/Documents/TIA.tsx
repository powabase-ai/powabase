import {
  ScaffoldSection,
  ScaffoldSectionContent,
  ScaffoldSectionDetail,
} from '@/components/layouts/Scaffold'

export const TIA = () => {
  return (
    <ScaffoldSection className="py-12">
      <ScaffoldSectionDetail>
        <h4 className="mb-5">Transfer Impact Assessment (TIA)</h4>
        <div className="space-y-2 text-sm text-foreground-light [&_p]:m-0">
          <p>
            All organizations can access and use our TIA as part of their GDPR-compliant data
            transfer process.
          </p>
        </div>
      </ScaffoldSectionDetail>
      <ScaffoldSectionContent>
        <div className="@lg:flex items-center justify-center h-full">
          <p className="text-sm text-foreground-light">
            Contact your operator for TIA documentation.
          </p>
        </div>
      </ScaffoldSectionContent>
    </ScaffoldSection>
  )
}
