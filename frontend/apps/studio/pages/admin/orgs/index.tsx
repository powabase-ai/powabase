import { useState, type MouseEvent } from "react"
import { toast } from "sonner"
import { Button } from "ui"
import { ConfirmationModal } from "ui-patterns/Dialogs/ConfirmationModal"
import type { NextPageWithLayout } from "@/types"

import { AdminLayout } from "@/components/admin/AdminLayout"
import { withAuth } from "@/hooks/misc/withAuth"
import { AdminListPage } from "@/components/admin/AdminListPage"
import { FlagBadge, flagRowClassName } from "@/components/admin/FlagBadge"
import { formatUsd } from "@/components/admin/credits"
import { surfaceWarnings } from "@/components/admin/warnings"
import { LocalTimestamp } from "@/components/admin/LocalTimestamp"
import {
  useAdminOrgsQuery,
  type AdminOrgRow,
} from "@/data/admin/use-admin-orgs-query"
import { useAdminOrgFeatureToggleMutation } from "@/data/admin/use-admin-org-feature-mutation"
import { useAdminOrgTestModeMutation } from "@/data/admin/use-admin-org-test-mode-mutation"
import { useAdminOrgTrustMutation } from "@/data/admin/use-admin-org-actions"

const PLAN_PICKER_FEATURE = "billing:plan_picker"

/**
 * Inline button cell for the "Billing UI" column. Clicking toggles the
 * `billing:plan_picker` entry in the org's `enabled_features` array via
 * POST /api/platform/admin/orgs/<slug>/features. stopPropagation prevents
 * the AdminListPage row-click from navigating away before the mutation
 * fires.
 */
function PlanPickerToggleCell({ row }: { row: AdminOrgRow }) {
  const enabled = (row.enabled_features ?? []).includes(PLAN_PICKER_FEATURE)
  const { mutate, isPending } = useAdminOrgFeatureToggleMutation()
  return (
    <Button
      size="tiny"
      type={enabled ? "default" : "primary"}
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation()
        mutate(
          { slug: row.slug, feature: PLAN_PICKER_FEATURE, enabled: !enabled },
          {
            onSuccess: () =>
              toast.success(
                enabled
                  ? `Disabled billing UI for ${row.slug}`
                  : `Enabled billing UI for ${row.slug}`
              ),
            onError: (err) =>
              toast.error(
                `Failed to ${enabled ? "disable" : "enable"} billing UI: ${err.message}`
              ),
          }
        )
      }}
    >
      {enabled ? "Disable billing UI" : "Enable billing UI"}
    </Button>
  )
}

/**
 * One-way test-mode toggle. Once ON, renders a permanently-disabled label
 * (test mode is irreversible — teardown = delete the org entirely).
 * When OFF, renders "Enable test mode" which sends enabled:true explicitly.
 * Sending enabled:false is not possible from this UI (endpoint would 409 with one_way).
 */
function TestModeToggleCell({ row }: { row: AdminOrgRow }) {
  const enabled = row.is_test_mode === true
  const { mutate, isPending } = useAdminOrgTestModeMutation()

  // Test-mode is one-way. Once ON, render a non-clickable label. To
  // decommission a test org, the operator deletes the org entirely
  // (test orgs are created specifically for billing-feature smoke
  // testing; teardown != toggle-off).
  if (enabled) {
    return (
      <Button size="tiny" type="warning" disabled>
        Test mode (permanent)
      </Button>
    )
  }

  return (
    <Button
      size="tiny"
      type="default"
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation()
        mutate(
          { slug: row.slug, enabled: true },
          {
            onSuccess: () =>
              toast.success(`Enabled test-mode for ${row.slug} (permanent)`),
            onError: (err) =>
              toast.error(`Failed to enable test-mode: ${err.message}`),
          }
        )
      }}
    >
      Enable test mode
    </Button>
  )
}

/**
 * Trust-state cell: badge + a quick toggle. Convicted orgs get a one-click
 * "Restore" (→trusted: resume projects + release stashed grant) — reversible
 * and cheap, so no confirm. Trusted orgs get a "Suspend" (→convicted: pause
 * projects + freeze balance) that routes through a confirmation modal, matching
 * the gating on the detail page's OrgActionsPanel (a stray click on a list row
 * must not silently pause an org's whole fleet). The heavier/irreversible
 * actions (drain, delete, grant, set-balance) stay on the detail page.
 * stopPropagation keeps the AdminListPage row-click from navigating mid-action.
 */
function TrustToggleCell({ row }: { row: AdminOrgRow }) {
  const { mutate, isPending } = useAdminOrgTrustMutation()
  const [confirming, setConfirming] = useState(false)
  const convicted = row.trust_state === "convicted"

  const restore = (e: MouseEvent) => {
    e.stopPropagation()
    mutate(
      { slug: row.slug, state: "trusted" },
      {
        onSuccess: (r) => {
          toast.success(`Restored ${row.slug}`)
          surfaceWarnings(r.warnings)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <FlagBadge state={row.trust_state} neutralLabel="Trusted" />
      {convicted ? (
        <Button size="tiny" type="default" loading={isPending} onClick={restore}>
          Restore
        </Button>
      ) : (
        <Button
          size="tiny"
          type="warning"
          loading={isPending}
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(true)
          }}
        >
          Suspend
        </Button>
      )}
      <ConfirmationModal
        visible={confirming}
        variant="warning"
        title={`Suspend ${row.slug}?`}
        confirmLabel="Suspend"
        loading={isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          mutate(
            { slug: row.slug, state: "convicted" },
            {
              onSuccess: (r) => {
                toast.success(`Suspended ${row.slug} — projects paused, balance frozen`)
                surfaceWarnings(r.warnings)
                setConfirming(false)
              },
              onError: (err) => toast.error(err.message),
            }
          )
        }
        alert={{
          title: "This pauses every project and freezes the org's credit balance.",
          description: "Reversible via Restore.",
        }}
      />
    </div>
  )
}

const PAGE_SIZE = 50

const AdminOrgsPage: NextPageWithLayout = () => {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState("created_at:desc")

  const { data, isLoading, error, refetch } = useAdminOrgsQuery({
    q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort,
  })

  return (
    <AdminListPage<AdminOrgRow>
      title="Organizations"
      searchPlaceholder="Search by name or slug…"
      columns={[
        { key: "name", header: "Name", sortable: true, render: (r) => r.name },
        { key: "slug", header: "Slug", sortable: true, render: (r) => r.slug },
        { key: "member_count", header: "Members", render: (r) => r.member_count },
        { key: "project_count", header: "Projects", render: (r) => r.project_count },
        {
          key: "balance",
          header: "Balance",
          render: (r) => (
            <span className="tabular-nums">{formatUsd(r.balance_millicents)}</span>
          ),
        },
        { key: "created_at", header: "Created", sortable: true, render: (r) => <LocalTimestamp iso={r.created_at} /> },
        {
          key: "billing_ui",
          header: "Billing UI",
          render: (r) => <PlanPickerToggleCell row={r} />,
        },
        {
          key: "test_mode",
          header: "Test mode",
          render: (r) => <TestModeToggleCell row={r} />,
        },
        {
          key: "trust_state",
          header: "Trust",
          render: (r) => <TrustToggleCell row={r} />,
        },
      ]}
      rows={data?.orgs ?? []}
      total={data?.total ?? 0}
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      q={q}
      setQ={setQ}
      page={page}
      pageSize={PAGE_SIZE}
      setPage={setPage}
      sort={sort}
      setSort={setSort}
      rowLinkBuilder={(r) => `/admin/orgs/${r.slug}`}
      rowClassName={(r) => flagRowClassName(r.trust_state)}
      emptyCopy="No orgs yet."
      filteredEmptyCopy={`No orgs matching "${q}".`}
    />
  )
}

AdminOrgsPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminOrgsPage)
