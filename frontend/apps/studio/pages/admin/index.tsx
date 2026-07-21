import { AdminLayout } from "@/components/admin/AdminLayout"
import { ActivityFeed } from "@/components/admin/ActivityFeed"
import { KpiTile } from "@/components/admin/KpiTile"
import { QueryErrorPanel } from "@/components/admin/QueryErrorPanel"
import { useAdminActivityQuery } from "@/data/admin/use-admin-activity-query"
import { useAdminStatsQuery } from "@/data/admin/use-admin-stats-query"
import { withAuth } from "@/hooks/misc/withAuth"
import type { NextPageWithLayout } from "@/types"

const AdminLandingPage: NextPageWithLayout = () => {
  const stats = useAdminStatsQuery()
  const activity = useAdminActivityQuery(20)

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      {stats.isError ? (
        <QueryErrorPanel
          error={stats.error}
          onRetry={() => stats.refetch()}
          message="Failed to load stats."
        />
      ) : (
        <div className="grid grid-cols-4 gap-3 mb-8">
          <KpiTile
            label="Users"
            value={stats.data?.users_total ?? "—"}
            subline={
              stats.data ? `${stats.data.signups_7d} in last 7 days` : undefined
            }
          />
          <KpiTile label="Orgs" value={stats.data?.orgs_total ?? "—"} />
          <KpiTile
            label="Projects"
            value={stats.data?.projects_total ?? "—"}
            subline={
              stats.data
                ? `${stats.data.projects_active} active · ${stats.data.projects_paused} paused`
                : undefined
            }
          />
          <KpiTile
            label="Signups (7d)"
            value={stats.data?.signups_7d ?? "—"}
          />
        </div>
      )}

      <h2 className="text-base font-medium mb-3">Recent activity</h2>
      {activity.isError ? (
        <QueryErrorPanel
          error={activity.error}
          onRetry={() => activity.refetch()}
          message="Failed to load recent activity."
        />
      ) : (
        <ActivityFeed
          events={activity.data?.events ?? []}
          isLoading={activity.isLoading}
        />
      )}
    </div>
  )
}

AdminLandingPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminLandingPage)
