import Link from "next/link"
import { Building2, FolderKanban, UserPlus } from "lucide-react"

import type { AdminEvent, AdminEventType } from "@/data/admin/use-admin-activity-query"
import { LocalTimestamp } from "./LocalTimestamp"

const ICONS: Record<AdminEventType, React.ComponentType<{ className?: string }>> = {
  user_signup: UserPlus,
  org_created: Building2,
  project_created: FolderKanban,
}

function eventHref(e: AdminEvent): string {
  switch (e.type) {
    case "user_signup":
      return `/admin/users/${e.id}`
    case "org_created":
      return `/admin/orgs/${e.slug}`
    case "project_created":
      return `/admin/projects/${e.ref}`
  }
}

interface ActivityFeedProps {
  events: AdminEvent[]
  isLoading?: boolean
}

export function ActivityFeed({ events, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-surface-100 animate-pulse rounded" />
        ))}
      </div>
    )
  }
  if (events.length === 0) {
    return (
      <div className="text-sm text-foreground-light py-8 text-center">
        No activity yet — waiting for first signup.
      </div>
    )
  }
  return (
    <div>
      <div className="text-sm text-foreground-light mb-3">
        Most recent {events.length} events — see audit log for full history (coming soon)
      </div>
      <ul className="divide-y divide-border">
        {events.map((e) => {
          const Icon = ICONS[e.type]
          return (
            <li key={`${e.type}-${e.id}`} className="py-2">
              <Link
                href={eventHref(e)}
                className="flex items-center gap-3 hover:bg-surface-100 rounded px-2 py-1"
              >
                <Icon className="h-4 w-4 text-foreground-light" />
                <span className="flex-1 text-sm truncate">{e.label}</span>
                <LocalTimestamp iso={e.created_at} className="text-xs text-foreground-light" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
