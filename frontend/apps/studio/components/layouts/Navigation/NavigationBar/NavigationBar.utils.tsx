import { Auth, Database, Realtime, SqlEditor, Storage, TableEditor } from 'icons'
import { Blocks, BookOpen, Bot, Code, FileText, GitBranch, Play, Server, Settings } from 'lucide-react'

import { ICON_SIZE, ICON_STROKE_WIDTH } from '@/components/interfaces/Sidebar'
import type { Route } from '@/components/ui/ui.types'
import { EditorIndexPageLink } from '@/data/prefetchers/project.$ref.editor'
import type { Project } from '@/data/projects/project-detail-query'
import { IS_PLATFORM, PROJECT_STATUS } from '@/lib/constants'

interface RouteContext {
  ref?: string
  isProjectActive: boolean
  isProjectBuilding: boolean
  buildingUrl: string
}

interface ProductFeatures {
  auth?: boolean
  storage?: boolean
  realtime?: boolean
  authOverviewPage?: boolean
}

interface OtherFeatures {
  isPlatform?: boolean
  showReports?: boolean
}

interface SettingsFeatures {
  isPlatform?: boolean
}

function getRouteContext(ref?: string, project?: Project): RouteContext {
  return {
    ref,
    isProjectActive: project?.status === PROJECT_STATUS.ACTIVE_HEALTHY,
    isProjectBuilding: project?.status === PROJECT_STATUS.COMING_UP,
    buildingUrl: `/project/${ref}`,
  }
}

export const generateToolRoutes = (ref?: string, project?: Project): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)

  return [
    {
      key: 'editor',
      label: 'Table Editor',
      disabled: !isProjectActive,
      icon: <TableEditor size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/editor`),
      linkElement: <EditorIndexPageLink projectRef={ref} />,
    },
    {
      key: 'sql',
      label: 'SQL Editor',
      disabled: !isProjectActive,
      icon: <SqlEditor size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/sql`),
    },
  ]
}

export const generateProductRoutes = (
  ref?: string,
  project?: Project,
  features?: ProductFeatures
): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)

  const authEnabled = features?.auth ?? true
  const storageEnabled = features?.storage ?? true
  const realtimeEnabled = features?.realtime ?? true
  const authOverviewPageEnabled = features?.authOverviewPage ?? false

  return [
    {
      key: 'database',
      label: 'Database',
      disabled: !isProjectActive,
      icon: <Database size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link:
        ref &&
        (isProjectBuilding
          ? buildingUrl
          : isProjectActive
            ? `/project/${ref}/database/schemas`
            : `/project/${ref}/database/backups/scheduled`),
    },
    ...(authEnabled
      ? [
          {
            key: 'auth',
            label: 'Authentication',
            disabled: !isProjectActive,
            icon: <Auth size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
            link:
              ref &&
              (isProjectBuilding
                ? buildingUrl
                : authOverviewPageEnabled
                  ? `/project/${ref}/auth/overview`
                  : `/project/${ref}/auth/users`),
          },
        ]
      : []),
    ...(storageEnabled
      ? [
          {
            key: 'storage',
            label: 'Storage',
            disabled: !isProjectActive,
            icon: <Storage size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
            link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/storage/files`),
          },
        ]
      : []),
    ...(realtimeEnabled
      ? [
          {
            key: 'realtime',
            label: 'Realtime',
            disabled: !isProjectActive,
            icon: <Realtime size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
            link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/realtime/inspector`),
          },
        ]
      : []),
  ]
}

export const generateDataRoutes = (ref?: string, project?: Project): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)

  return [
    {
      key: 'sources',
      label: 'Sources',
      disabled: !isProjectActive,
      icon: <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/sources`),
    },
    {
      key: 'knowledge-bases',
      label: 'Knowledge Bases',
      disabled: !isProjectActive,
      icon: <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/knowledge-bases`),
    },
  ]
}

export const generateAIRoutes = (ref?: string, project?: Project): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)

  return [
    {
      key: 'agents',
      label: 'Agents',
      disabled: !isProjectActive,
      icon: <Bot size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/agents`),
    },
    {
      key: 'orchestrations',
      label: 'Orchestrations',
      disabled: !isProjectActive,
      icon: <Blocks size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/orchestrations`),
    },
    {
      key: 'runs',
      label: 'Runs',
      disabled: !isProjectActive,
      icon: <Play size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/runs`),
    },
  ]
}

export const generateWorkflowRoutes = (ref?: string, project?: Project): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)

  return [
    {
      key: 'workflows',
      label: 'Workflows',
      disabled: !isProjectActive,
      icon: <GitBranch size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref && (isProjectBuilding ? buildingUrl : `/project/${ref}/workflows`),
    },
  ]
}

export const generateOtherRoutes = (
  ref?: string,
  project?: Project,
  features?: OtherFeatures
): Route[] => {
  return [
    // Advisors / Logs: deleted outright (source trees, orphaned layouts/interfaces, and every
    // inbound link from live code removed together) — neither is a stub anymore, there's
    // nothing left to route to. Never emitted here.
    // Integrations (Bucket-2): never emitted here, not gated — but not deleted. Neither prod
    // (infra/helm/project-stack) nor the OSS data-plane (templates/supabase-project) runs a
    // backend for it, and pages/project/[ref]/integrations/** is a dead RedirectToProject stub
    // in both builds — retained (not deleted) so inbound links from live code don't 404; see
    // nav-no-cloud-only-corpses.spec.ts.
  ]
}

export const generateSettingsRoutes = (ref?: string, project?: Project, features?: SettingsFeatures): Route[] => {
  const { isProjectActive, isProjectBuilding, buildingUrl } = getRouteContext(ref, project)
  const isPlatform = features?.isPlatform ?? IS_PLATFORM

  return [
    {
      key: 'api-docs',
      label: 'API Docs',
      disabled: false,
      icon: <Code size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: 'https://docs.powabase.ai/concepts/platform-overview',
      linkElement: <a target="_blank" rel="noreferrer" />,
    },
    {
      key: 'settings',
      label: 'Project Settings',
      icon: <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link:
        ref &&
        (isPlatform ? `/project/${ref}/settings/general` : `/project/${ref}/settings/log-drains`),
      disabled: false,
    },
    {
      key: 'infrastructure',
      label: 'Infrastructure',
      icon: <Server size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} />,
      link: ref ? `/project/${ref}/infrastructure` : undefined,
      disabled: false,
    },
  ]
}
