import { useRouter } from "next/router"
import Link from "next/link"
import type { NextPageWithLayout } from "@/types"

import { AdminLayout } from "@/components/admin/AdminLayout"
import { withAuth } from "@/hooks/misc/withAuth"
import { formatUsd } from "@/components/admin/credits"
import { DetailHeader } from "@/components/admin/DetailHeader"
import { DetailSection } from "@/components/admin/DetailSection"
import { LocalTimestamp } from "@/components/admin/LocalTimestamp"
import { OrgActionsPanel } from "@/components/admin/OrgActionsPanel"
import { QueryErrorPanel } from "@/components/admin/QueryErrorPanel"
import { useAdminOrgQuery } from "@/data/admin/use-admin-org-query"

const AdminOrgDetailPage: NextPageWithLayout = () => {
  const router = useRouter()
  const slug = typeof router.query.slug === "string" ? router.query.slug : undefined
  const { data, isLoading, isError, error, refetch } = useAdminOrgQuery(slug)

  if (isLoading) return <div className="text-sm">Loading…</div>
  if (isError) return (
    <QueryErrorPanel
      error={error}
      onRetry={() => refetch()}
      message="Failed to load org."
    />
  )
  if (!data) return null

  return (
    <div>
      <DetailHeader
        title={data.org.name}
        subtitle={`Slug: ${data.org.slug} · Plan: ${data.org.plan_id} · Balance: ${formatUsd(
          data.org.balance_millicents
        )}`}
        createdAt={data.org.created_at}
      />

      <div className="mb-8">
        <h2 className="text-base font-medium mb-3">Operator actions</h2>
        <OrgActionsPanel slug={data.org.slug} trustState={data.org.trust_state} />
      </div>

      <DetailSection
        title="Members"
        emptyCopy="No members yet."
        itemCount={data.members.length}
      >
        <ul className="divide-y divide-border">
          {data.members.map((m) => (
            <li key={m.user_id} className="py-2">
              <Link href={`/admin/users/${m.user_id}`} className="hover:underline">
                <span className="font-medium">{m.email}</span>
                <span className="text-xs text-foreground-light ml-2">· {m.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection
        title="Projects"
        emptyCopy="No projects yet."
        itemCount={data.projects.length}
      >
        <ul className="divide-y divide-border">
          {data.projects.map((p) => (
            <li key={p.id} className="py-2">
              {p.ref ? (
                <Link href={`/admin/projects/${p.ref}`} className="hover:underline">
                  {p.name}
                </Link>
              ) : (
                <span>{p.name}</span>
              )}
              <span className="text-xs text-foreground-light ml-2">
                · <LocalTimestamp iso={p.created_at} />
              </span>
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  )
}

AdminOrgDetailPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminOrgDetailPage)
