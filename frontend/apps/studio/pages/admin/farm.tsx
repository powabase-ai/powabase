import { AdminLayout } from "@/components/admin/AdminLayout"
import { LocalTimestamp } from "@/components/admin/LocalTimestamp"
import { QueryErrorPanel } from "@/components/admin/QueryErrorPanel"
import {
  useAdminFarmQuery,
  type AdminFarmOrgRow,
} from "@/data/admin/use-admin-farm-query"
import { withAuth } from "@/hooks/misc/withAuth"
import type { NextPageWithLayout } from "@/types"

/**
 * Farm-defense admin view. Two sections off the same `/farm/flagged` payload:
 *
 *   1. Flagged orgs — slug / email / trust_state / latest-verdict tier.
 *   2. Audit / Log — the latest verdict per flagged org, most-recent first
 *      (tier / action / reasons / rationale / created_at).
 *
 * Factored out of the default page export so the vitest suite can render the
 * content with a mocked `useAdminFarmQuery` without dragging in `withAuth` /
 * `AdminLayout` (those need the auth + whoami queries + a router).
 */
export function FarmDefenseContent() {
  const { data, isLoading, error, refetch } = useAdminFarmQuery()
  const orgs = data ?? []

  // Latest-verdict-per-org audit rows, most recent first. Orgs with no
  // verdict yet are omitted from the audit log (nothing to show).
  const auditRows = orgs
    .filter((o): o is AdminFarmOrgRow & { verdict: NonNullable<AdminFarmOrgRow["verdict"]> } =>
      o.verdict !== null,
    )
    .sort((a, b) => (a.verdict.created_at ?? "") < (b.verdict.created_at ?? "") ? 1 : -1)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Farm defense</h1>
        <p className="text-sm text-foreground-light mt-1">
          Orgs whose trust state is <code className="font-mono">gated</code> or{" "}
          <code className="font-mono">convicted</code>, with the latest farm verdict.
        </p>
      </div>

      {error ? (
        <QueryErrorPanel
          error={error}
          onRetry={() => refetch()}
          message="Failed to load flagged orgs."
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-surface-100 animate-pulse rounded" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-sm text-foreground-light py-12 text-center">
          No flagged orgs — nothing gated or convicted right now.
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-base font-medium mb-3">Flagged orgs</h2>
            <table className="w-full border-collapse text-sm">
              <thead className="text-left text-xs text-foreground-light uppercase tracking-wide border-b border-border">
                <tr>
                  <th className="py-2">Slug</th>
                  <th className="py-2">Owner email</th>
                  <th className="py-2">Trust state</th>
                  <th className="py-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-border">
                    <td className="py-2 font-mono">{o.slug}</td>
                    <td className="py-2">{o.email ?? "—"}</td>
                    <td className="py-2">{o.trust_state}</td>
                    <td className="py-2">{o.verdict?.tier ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-base font-medium mb-3">Audit / Log</h2>
            {auditRows.length === 0 ? (
              <div className="text-sm text-foreground-light py-8 text-center">
                No verdicts recorded yet.
              </div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="text-left text-xs text-foreground-light uppercase tracking-wide border-b border-border">
                  <tr>
                    <th className="py-2">When</th>
                    <th className="py-2">Slug</th>
                    <th className="py-2">Tier</th>
                    <th className="py-2">Action</th>
                    <th className="py-2">Reasons</th>
                    <th className="py-2">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((o) => (
                    <tr key={`${o.id}-verdict`} className="border-b border-border align-top">
                      <td className="py-2 whitespace-nowrap">
                        <LocalTimestamp
                          iso={o.verdict.created_at}
                          className="text-xs text-foreground-light"
                        />
                      </td>
                      <td className="py-2 font-mono">{o.slug}</td>
                      <td className="py-2">{o.verdict.tier}</td>
                      <td className="py-2">{o.verdict.action ?? "—"}</td>
                      <td className="py-2 font-mono text-xs">
                        {o.verdict.reasons.length > 0 ? o.verdict.reasons.join(", ") : "—"}
                      </td>
                      <td className="py-2 text-foreground-light">{o.verdict.rationale ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}

const AdminFarmPage: NextPageWithLayout = () => <FarmDefenseContent />

AdminFarmPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminFarmPage)
