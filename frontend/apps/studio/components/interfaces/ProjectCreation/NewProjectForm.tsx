import { useEffect, useState } from 'react'
import { Button, Input_Shadcn_, Label_Shadcn_ } from 'ui'
import { Admonition } from 'ui-patterns/admonition'

import { ComputeTierPicker } from '@/components/interfaces/Billing/ComputeTierPicker'
import { ComputeUpgradeUpsell } from '@/components/interfaces/Billing/ComputeUpgradeUpsell'
import Panel from '@/components/ui/Panel'
import { COMPUTE_TIERS, ComputeTierId, PlanTierId } from '@/data/billing/compute-tiers.display'
import { useProjectCreationEligibilityQuery } from '@/data/billing/project-creation-eligibility-query'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

import { AIProviderKeysInput, AIProviderKeysValue } from './AIProviderKeysInput'

export interface NewProjectFormSubmit {
  name: string
  aiProviderKeys: AIProviderKeysValue
  computeSizeId: ComputeTierId
}

interface NewProjectFormProps {
  isAdmin: boolean
  isOrganizationsSuccess: boolean
  isSubmitting: boolean
  onCreate: (vars: NewProjectFormSubmit) => void
  onCancel: () => void
  keyFieldErrors?: Partial<Record<keyof AIProviderKeysValue, string>>
  /**
   * Test/storybook override for the `billing:ai_on_us` gate. When omitted
   * (production), reads from `useIsFeatureEnabled('billing:ai_on_us')`.
   * Matches the prop-override pattern established for CostTooltip / pricing
   * (Phase 11.1 / 11.3).
   *
   * When `true`, the LLM keys section becomes optional (AI-on-us opt-in copy
   * + Skip CTA). When `false`, the existing "provide at least one key"
   * requirement is preserved.
   */
  isAiOnUsEnabled?: boolean
  /**
   * Test/storybook override for the compute-tier gate (the Powabase
   * compute-tier feature — NOT the IS_PLATFORM Supabase compute add-on). When
   * omitted, reads from the single per-org billing-UI switch
   * (`useIsBillingUiEnabled`) for the org the project is being created into.
   * Matches the `isAiOnUsEnabled` prop-override pattern above.
   */
  isComputeTierEnabled?: boolean
  /** Plan tier used to price the compute-tier cards. Defaults to 'free'. */
  planTier?: PlanTierId
}

const EMPTY_KEYS: AIProviderKeysValue = {
  openai: '',
  anthropic: '',
  google: '',
  openrouter: '',
}

export const NewProjectForm = ({
  isAdmin,
  isOrganizationsSuccess,
  isSubmitting,
  onCreate,
  onCancel,
  keyFieldErrors,
  isAiOnUsEnabled,
  isComputeTierEnabled,
  planTier = 'free',
}: NewProjectFormProps) => {
  const aiOnUsFromHook = useIsFeatureEnabled('billing:ai_on_us')
  const aiOnUsEnabled = isAiOnUsEnabled ?? aiOnUsFromHook
  // The compute-tier picker is gated on the single per-org billing-UI switch
  // (same flag as the B1 plan picker), resolved for the org the project is
  // being created into — `useSelectedOrganizationQuery` keys off the `slug`
  // param of the /new/[slug] route, mirroring the parent page.
  const { data: selectedOrganization } = useSelectedOrganizationQuery()
  const computeTierFromHook = useIsBillingUiEnabled(selectedOrganization)
  const computeTierEnabled = isComputeTierEnabled ?? computeTierFromHook

  // Server-authoritative entitlement mirror: which compute tiers this caller may
  // actually provision. Non-allowed tiers are rendered locked in the picker so
  // the create flow can't submit a tier the CP gate (Task 3) would 403.
  const { data: eligibility } = useProjectCreationEligibilityQuery(selectedOrganization?.slug)
  const allowedTiers = eligibility?.allowed_tiers ?? ['nano']
  const lockedTierIds = COMPUTE_TIERS.map((t) => t.id).filter((id) => !allowedTiers.includes(id))
  const lockedReason = eligibility?.entitled
    ? undefined
    : eligibility?.first_project_free
      ? 'Sandbox runs pay-as-you-go from your wallet. Upgrade to a paid plan for larger compute.'
      : 'Upgrade to a paid plan to create more projects.'

  const [projectName, setProjectName] = useState('')
  const [aiProviderKeys, setAiProviderKeys] = useState<AIProviderKeysValue>(EMPTY_KEYS)
  const [computeSizeId, setComputeSizeId] = useState<ComputeTierId>('nano')

  // Eligibility resolves asynchronously after mount; if the currently-selected
  // tier becomes locked, reset to the always-allowed Sandbox so the form can't
  // submit a locked tier.
  useEffect(() => {
    if (lockedTierIds.includes(computeSizeId)) setComputeSizeId('nano')
  }, [lockedTierIds, computeSizeId])

  // Keys are always optional now. A project provisions cleanly without any
  // BYOK key — agent / chat / workflow calls fall back to AI-on-us when the
  // pod has a platform key for the model's provider, and otherwise fail-fast
  // at run time with an actionable "add a key" message. This unblocks
  // operators who only populated OPENAI_API_KEY in the platform env and
  // still want to create projects that will use Anthropic / Gemini models
  // via balance.
  const isNameValid = projectName.trim().length >= 3
  const canSubmit = isAdmin && isNameValid && !isSubmitting

  function submit(keys: AIProviderKeysValue) {
    if (!isNameValid || isSubmitting) return
    onCreate({ name: projectName.trim(), aiProviderKeys: keys, computeSizeId })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    submit(aiProviderKeys)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Panel
        loading={!isOrganizationsSuccess}
        title={
          <div key="panel-title">
            <h3>Create a new project</h3>
            <p className="text-sm text-foreground-lighter">
              Your project will have its own dedicated database and API.
            </p>
          </div>
        }
        footer={
          <div className="flex items-center justify-end w-full space-x-2">
            <Button type="default" disabled={isSubmitting} onClick={onCancel}>
              Cancel
            </Button>
            <Button htmlType="submit" loading={isSubmitting} disabled={!canSubmit}>
              Create new project
            </Button>
          </div>
        }
      >
        <Panel.Content>
          <div className="space-y-4">
            <Admonition
              type="default"
              title="Setting up a project can take a few minutes"
              description={
                <div className="space-y-3">
                  <p className="text-sm leading-normal">
                    After you click Create, we provision dedicated, isolated
                    infrastructure for your project:
                  </p>
                  <ul className="pl-5 list-disc space-y-1">
                    <li>
                      Your own isolated PostgreSQL database (with pgvector) on dedicated storage.
                    </li>
                    <li>
                      The backend API surface — PostgREST (auto-generated REST), Auth (GoTrue),
                      Realtime, and Storage.
                    </li>
                    <li>
                      The AI service pods that run your agents, RAG pipelines, and workflows: the
                      project API plus a background worker for indexing and long-running runs.
                    </li>
                  </ul>
                  <p className="text-sm leading-normal">
                    You&apos;ll see a setup screen until everything is healthy, usually within a
                    couple of minutes.
                  </p>
                </div>
              }
            />
            <div className="space-y-1">
              <Label_Shadcn_ htmlFor="projectName">Project name</Label_Shadcn_>
              <Input_Shadcn_
                id="projectName"
                placeholder="My project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
              {projectName.length > 0 && projectName.trim().length < 3 && (
                <p className="text-sm text-destructive">
                  Project name must be at least 3 characters.
                </p>
              )}
            </div>
            {computeTierEnabled && (
              <div className="space-y-1">
                <Label_Shadcn_>Compute size</Label_Shadcn_>
                <p className="text-xs text-foreground-light">
                  The dedicated database size for your project. You can resize this later.
                </p>
                <ComputeTierPicker
                  planTier={planTier}
                  value={computeSizeId}
                  onSelect={setComputeSizeId}
                  lockedTierIds={lockedTierIds}
                  lockedReason={lockedReason}
                />
                <ComputeUpgradeUpsell planTier={planTier} />
              </div>
            )}
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Bring your own LLM keys (optional)</h3>
              <p className="text-xs text-foreground-light">
                {aiOnUsEnabled
                  ? 'Add keys to bill your provider directly (reduces cost ~25%). Leave blank to use your platform balance.'
                  : 'Add keys to enable agent + chat features. You can add them later in Settings → LLM Provider Keys.'}
              </p>
            </div>
            <AIProviderKeysInput
              value={aiProviderKeys}
              onChange={setAiProviderKeys}
              fieldErrors={keyFieldErrors}
              hideHeader
            />
          </div>
        </Panel.Content>
      </Panel>
    </form>
  )
}
