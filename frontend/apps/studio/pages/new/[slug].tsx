import { PermissionAction } from '@supabase/shared-types/out/constants'
import { LOCAL_STORAGE_KEYS, useParams } from 'common'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect, useState } from 'react'
import { toast } from 'sonner'

import DefaultLayout from '@/components/layouts/DefaultLayout'
import { WizardLayoutWithoutAuth } from '@/components/layouts/WizardLayout'
import { NewProjectLimitReached } from '@/components/interfaces/ProjectCreation/NewProjectLimitReached'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import type { AIProviderKeysValue } from '@/components/interfaces/ProjectCreation/AIProviderKeysInput'
import {
  NewProjectForm,
  type NewProjectFormSubmit,
} from '@/components/interfaces/ProjectCreation/NewProjectForm'
import type { PlanTierId } from '@/data/billing/compute-tiers.display'
import { useProjectCreationEligibilityQuery } from '@/data/billing/project-creation-eligibility-query'
import { useFreeProjectLimitCheckQuery } from '@/data/organizations/free-project-limit-check-query'
import { useOrganizationsQuery } from '@/data/organizations/organizations-query'
import { useProjectCreateMutation } from '@/data/projects/project-create-mutation'
import { useCustomContent } from '@/hooks/custom-content/useCustomContent'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { withAuth } from '@/hooks/misc/withAuth'
import { buildStudioPageTitle } from '@/lib/page-title'
import type { NextPageWithLayout } from '@/types'

const Wizard: NextPageWithLayout = () => {
  const router = useRouter()
  const { slug } = useParams()
  const { appTitle } = useCustomContent(['app:title'])
  const pageTitle = buildStudioPageTitle({
    section: 'New Project',
    brand: appTitle || 'Powabase',
  })

  const { data: currentOrg } = useSelectedOrganizationQuery()
  const billingUiEnabled = useIsBillingUiEnabled(currentOrg)
  const { can: isAdmin } = useAsyncCheckPermissions(PermissionAction.CREATE, 'projects')
  const { data: organizations = [], isSuccess: isOrganizationsSuccess } = useOrganizationsQuery()
  const isEmptyOrganizations = isOrganizationsSuccess && organizations.length <= 0

  const [lastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const [keyFieldErrors, setKeyFieldErrors] =
    useState<Partial<Record<keyof AIProviderKeysValue, string>>>({})

  // Handle no org: redirect to new org route
  if (slug === 'last-visited-org') {
    if (lastVisitedOrganization) {
      router.replace(`/new/${lastVisitedOrganization}`, undefined, { shallow: true })
    } else {
      router.replace(`/new/_`, undefined, { shallow: true })
    }
  }

  useEffect(() => {
    if (isEmptyOrganizations) {
      router.push(`/new`)
    }
  }, [isEmptyOrganizations, router])

  // Gate at page-mount time on the server-authoritative creation-eligibility
  // signal: when no tier is allowed (a 2nd+ project on a non-entitled org),
  // every create would 403, so showing the form is a dead end — render the
  // in-page upgrade panel (NewProjectLimitReached) instead. The legacy
  // free-project-limit query is still consulted only to source the panel's
  // member list (its other consumers are untouched).
  const { data: membersExceededLimit } = useFreeProjectLimitCheckQuery({ slug })
  const { data: eligibility } = useProjectCreationEligibilityQuery(slug)
  const isFreePlanLimitReached = eligibility?.allowed_tiers?.length === 0

  const {
    mutate: createProject,
    isPending: isCreatingNewProject,
    isSuccess: isSuccessNewProject,
  } = useProjectCreateMutation({
    onSuccess: (res) => {
      router.push(`/project/${res.ref}`)
    },
  })

  const isSubmitting = isCreatingNewProject || isSuccessNewProject

  function handleCreate({
    name,
    aiProviderKeys,
    computeSizeId,
  }: NewProjectFormSubmit) {
    if (!currentOrg) return toast.error('No organization selected')
    setKeyFieldErrors({})
    createProject(
      {
        name,
        organizationSlug: currentOrg.slug,
        dbPass: 'unused',
        aiProviderKeys,
        computeSizeId,
      },
      {
        onError: (err) => {
          // The entitlement gate (Task 3) returns 403; the machine code is on
          // `err.code` (the HTTP status), NOT in `err.message` (which fetchers
          // builds from the body's human `message`). Surface the upgrade CTA.
          if (err.code === 403) {
            return toast.error(
              'Upgrade to a paid plan to create more projects or pick a larger compute size.'
            )
          }
          try {
            const parsed = JSON.parse(err.message)
            if (parsed?.fields && typeof parsed.fields === 'object') {
              setKeyFieldErrors(parsed.fields)
            }
          } catch {
            // err.message is not JSON; no field-level errors to show
          }
        },
      }
    )
  }

  function handleCancel() {
    if (lastVisitedOrganization) router.push(`/org/${lastVisitedOrganization}`)
    else router.push('/organizations')
  }

  if (isFreePlanLimitReached) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
        </Head>
        <NewProjectLimitReached
          membersExceededLimit={membersExceededLimit ?? []}
          billingUiEnabled={billingUiEnabled}
        />
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <NewProjectForm
        isAdmin={isAdmin}
        isOrganizationsSuccess={isOrganizationsSuccess}
        isSubmitting={isSubmitting}
        onCreate={handleCreate}
        onCancel={handleCancel}
        keyFieldErrors={keyFieldErrors}
        // Price the compute cards + upsell for the org being created into. The
        // form defaults planTier to 'free', so without this every org sees Free
        // rates + an "Upgrade to Self-Serve" upsell regardless of its real plan.
        planTier={(currentOrg?.plan?.id ?? 'free') as PlanTierId}
      />
    </>
  )
}

const PageLayout = withAuth(({ children }: PropsWithChildren) => {
  return <WizardLayoutWithoutAuth>{children}</WizardLayoutWithoutAuth>
})

Wizard.getLayout = (page) => (
  <DefaultLayout hideMobileMenu headerTitle="New project">
    <PageLayout>{page}</PageLayout>
  </DefaultLayout>
)

export default Wizard
