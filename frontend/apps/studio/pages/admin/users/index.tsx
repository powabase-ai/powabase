import { useState } from "react"
import { toast } from "sonner"
import { Button } from "ui"
import type { NextPageWithLayout } from "@/types"

import { AdminLayout } from "@/components/admin/AdminLayout"
import { withAuth } from "@/hooks/misc/withAuth"
import { AdminListPage } from "@/components/admin/AdminListPage"
import { FlagBadge, flagRowClassName } from "@/components/admin/FlagBadge"
import { isReturningUser, returningRowClassName } from "@/components/admin/returning"
import { LocalTimestamp } from "@/components/admin/LocalTimestamp"
import {
  useAdminUsersQuery,
  type AdminUserRow,
} from "@/data/admin/use-admin-users-query"
import { useAdminExportUsers } from "@/data/admin/use-admin-export-users"

const PAGE_SIZE = 50

const AdminUsersPage: NextPageWithLayout = () => {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState("created_at:desc")

  const { data, isLoading, error, refetch } = useAdminUsersQuery({
    q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort,
  })

  const { exportUsers, isExporting } = useAdminExportUsers()
  const onExport = () =>
    exportUsers().catch((e) => toast.error(e instanceof Error ? e.message : "Export failed"))

  return (
    <AdminListPage<AdminUserRow>
      title="Users"
      searchPlaceholder="Search by email…"
      headerAction={
        <Button type="default" loading={isExporting} onClick={onExport}>
          Export CSV
        </Button>
      }
      columns={[
        { key: "email", header: "Email", sortable: true, render: (r) => r.email },
        { key: "created_at", header: "Signed up", sortable: true, render: (r) => <LocalTimestamp iso={r.created_at} /> },
        { key: "last_sign_in_at", header: "Last sign-in", sortable: true, render: (r) => <LocalTimestamp iso={r.last_sign_in_at} /> },
        { key: "org_count", header: "Orgs", render: (r) => r.org_count },
        {
          key: "project_count",
          header: "Projects",
          // Annotate paused projects so a flagged/convicted user's project
          // total isn't mistaken for live projects (conviction pauses them).
          render: (r) =>
            r.paused_project_count > 0 ? (
              <span>
                {r.project_count}{" "}
                <span className="text-foreground-light">({r.paused_project_count} paused)</span>
              </span>
            ) : (
              r.project_count
            ),
        },
        {
          key: "flag_state",
          header: "Flag",
          render: (r) => <FlagBadge state={r.flag_state} />,
        },
      ]}
      rows={data?.users ?? []}
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
      rowLinkBuilder={(r) => `/admin/users/${r.id}`}
      // A flag (gated/convicted → red/amber) wins over the returning-user
      // green: an abuse signal matters more than the engagement signal.
      rowClassName={(r) =>
        flagRowClassName(r.flag_state) ||
        (isReturningUser(r.created_at, r.last_sign_in_at) ? returningRowClassName : "")
      }
      emptyCopy="No users yet."
      filteredEmptyCopy={`No users matching "${q}".`}
    />
  )
}

AdminUsersPage.getLayout = (page) => <AdminLayout>{page}</AdminLayout>

export default withAuth(AdminUsersPage)
