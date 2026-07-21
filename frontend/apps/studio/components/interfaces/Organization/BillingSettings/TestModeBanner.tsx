import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_ } from "ui"
import { ScaffoldContainer } from "@/components/layouts/Scaffold"

/**
 * Shown above the picker for orgs flipped to test-mode via /admin/orgs.
 * Plan §F10 — operators need to KNOW they're in test-mode before clicking
 * Subscribe, else they'll panic-Stripe-dispute the test charge.
 */
export function TestModeBanner() {
  return (
    <ScaffoldContainer id="billing-test-mode-banner" className="mt-4">
      <Alert_Shadcn_ variant="warning">
        <AlertTitle_Shadcn_>This organization is in Stripe test mode</AlertTitle_Shadcn_>
        <AlertDescription_Shadcn_ className="flex flex-col gap-2">
          Checkout will use test-mode Stripe credentials. No real card will be charged.
          Use test card <code>4242 4242 4242 4242</code> with any future expiry, any CVC.
          <br />
          Test mode is <strong>permanent</strong> for this organization — it cannot be
          converted back to a real-billing org. When you're done smoke-testing, ask an
          operator to delete this organization.
        </AlertDescription_Shadcn_>
      </Alert_Shadcn_>
    </ScaffoldContainer>
  )
}
