import { useRouter } from "next/router"
import Link from "next/link"
import type { NextPageWithLayout } from "@/types"

import { AdminLayout } from "@/components/admin/AdminLayout"
import { withAuth } from "@/hooks/misc/withAuth"
import { DetailHeader } from "@/components/admin/DetailHeader"
import { DetailSection } from "@/components/admin/DetailSection"
import { LocalTimestamp } from "@/components/admin/LocalTimestamp"
import { QueryErrorPanel } from "@/components/admin/QueryErrorPanel"
import { useAdminUserQuery } from "@/data/admin/use-admin-user-query"

const AdminUserDetailPage: NextPageWithLayout = () => {
  const router = useRouter()
  const id = typeof router.query.id === "string" ? router.query.id : undefined
  const { data, isLoading, isError, error, refetch } = useAdminUserQuery(id)

  if (isLoading) return <div className="text-sm">Loading…</div>
  if (isError) return (
    <QueryErrorPanel
      error={error}
      onRetry={() => refetch()}
      message="Failed to load user."
    />
  )
  if (!data) return null

  return (
    <div>
      <DetailHeader
        title={data.user.email}
        subtitle={`User ID: ${data.user.id}`}
        meta={[
          { label: "Last sign-in", value: <LocalTimestamp iso={data.user.last_sign_in_at} /> },
        ]}
        createdAt={data.user.created_at}
      />

      <DetailSection
        title="Organizations"
        emptyCopy="This user hasn't joined any orgs."
        itemCount={data.orgs.length}
      >
        <ul className="divide-y divide-border">
          {data.orgs.map((o) => (
            <li key={o.id} className="py-2">
              <Link href={`/admin/orgs/${o.slug}`} className="hover:underline">
                <span className="font-medium">{o.name}</span>
                <span className="text-foreground-light ml-2">({o.slug})</span>
                <span className="text-xs text-foreground-light ml-2">· {o.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection
        title="Projects"
        emptyCopy="This user has no projects."
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

AdminUserDetailPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminUserDetailPage)
