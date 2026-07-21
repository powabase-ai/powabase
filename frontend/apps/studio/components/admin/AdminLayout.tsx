import Link from "next/link"
import { useRouter } from "next/router"

import { useIsPlatformAdminQuery } from "@/data/admin/use-is-platform-admin-query"
import { QueryErrorPanel } from "./QueryErrorPanel"

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { data, isLoading, isError, error: whoamiError, refetch } = useIsPlatformAdminQuery()

  if (isLoading) return null
  if (isError) {
    return (
      <div className="p-12">
        <QueryErrorPanel
          error={whoamiError}
          onRetry={() => refetch()}
          message="Could not verify admin status."
        />
      </div>
    )
  }
  if (!data?.is_admin) {
    return (
      <div className="p-12 max-w-2xl mx-auto">
        <div className="border border-default rounded p-6">
          <h2 className="text-lg font-semibold mb-2">Platform operator access required</h2>
          <p className="text-sm text-foreground-light mb-3">
            You&apos;re signed in, but your account isn&apos;t in the platform admin allowlist.
          </p>
          <p className="text-xs text-foreground-light">
            To grant access, add this account&apos;s email to{" "}
            <code className="font-mono">PLATFORM_ADMIN_EMAILS</code> on the control plane (the env
            var that gates <code className="font-mono">@require_platform_admin</code>), then sign
            out and back in.
          </p>
          <a
            href="/"
            className="inline-block mt-4 px-3 py-1 border border-border rounded text-sm hover:bg-surface-100"
          >
            Return home
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-border bg-surface-100 p-4 flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase text-foreground-light mb-2">Admin</h2>
        <NavLink href="/admin" label="Dashboard" />
        <NavLink href="/admin/users" label="Users" />
        <NavLink href="/admin/orgs" label="Orgs" />
        <NavLink href="/admin/farm" label="Farm defense" />
        <NavLink href="/admin/observability" label="Observability" />
      </aside>

      <div className="flex-1">
        <div id="impersonation-banner-slot" />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  const router = useRouter()
  const isActive =
    router.pathname === href || router.pathname.startsWith(`${href}/`)
  return (
    <Link
      href={href}
      className={`px-2 py-1 rounded text-sm ${
        isActive ? "bg-surface-200 font-medium" : "hover:bg-surface-200"
      }`}
    >
      {label}
    </Link>
  )
}
