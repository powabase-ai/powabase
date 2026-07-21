import { useRouter } from "next/router"
import Link from "next/link"
import type { NextPageWithLayout } from "@/types"

import { AdminLayout } from "@/components/admin/AdminLayout"
import { withAuth } from "@/hooks/misc/withAuth"
import { DetailHeader } from "@/components/admin/DetailHeader"
import { DetailSection } from "@/components/admin/DetailSection"
import { ProjectActivity } from "@/components/admin/ProjectActivity"
import { QueryErrorPanel } from "@/components/admin/QueryErrorPanel"
import { useAdminProjectQuery } from "@/data/admin/use-admin-project-query"

// NOTE: the dynamic segment is `[projectRef]`, NOT `[ref]`, on purpose. The
// global RouteValidationWrapper reads `ref` from useParams() and, when set,
// fetches the *tenant* project — which 403s for a platform admin who isn't an
// org member, then redirects away with "You do not have access to this
// project". Naming the segment `projectRef` keeps `useParams().ref` undefined
// so that validation (and the tenant project/auth-config calls) never fire.
const AdminProjectDetailPage: NextPageWithLayout = () => {
  const router = useRouter()
  const ref = typeof router.query.projectRef === "string" ? router.query.projectRef : undefined
  const { data, isLoading, isError, error, refetch } = useAdminProjectQuery(ref)

  if (isLoading) return <div className="text-sm">Loading…</div>
  if (isError) return (
    <QueryErrorPanel
      error={error}
      onRetry={() => refetch()}
      message="Failed to load project."
    />
  )
  if (!data) return null

  return (
    <div>
      <DetailHeader
        title={data.project.name}
        subtitle={
          <>
            Ref: {data.project.ref} · State: {data.project.state ?? "unknown"} · Owner org:{" "}
            <Link href={`/admin/orgs/${data.org.slug}`} className="hover:underline">
              {data.org.name}
            </Link>
          </>
        }
        createdAt={data.project.created_at}
      />

      <div className="my-8">
        <ProjectActivity
          projectRef={ref}
          activity={data.activity}
          summary={data.activity_summary}
        />
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
    </div>
  )
}

AdminProjectDetailPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminProjectDetailPage)
