import {
  Bot,
  Database,
  FileText,
  Lock,
  Network,
  SquareTerminal,
  Table,
  Workflow,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Alert_Shadcn_,
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Badge,
  Button,
  WarningIcon,
} from 'ui'

import { ScaffoldContainer, ScaffoldSection } from '@/components/layouts/Scaffold'
import { COMPUTE_TIERS, ComputeTierId } from '@/data/billing/compute-tiers.display'
import { useProjectResumeMutation } from '@/data/projects/project-resume-mutation'
import { useIsBillingUiEnabled } from '@/hooks/misc/useIsBillingUiEnabled'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { OverviewStats } from './OverviewStats'

export const ProjectHome = () => {
  const { data: project } = useSelectedProjectQuery()
  const { data: organization } = useSelectedOrganizationQuery()

  // Powabase compute-tier (B2), gated on the single per-org billing-UI switch.
  // Mounted here (IS_PLATFORM=true overview) AND in interfaces/Home/Home.tsx
  // (IS_PLATFORM=false) — pages/project/[ref] picks one per build mode.
  const showComputeTier = useIsBillingUiEnabled(organization)
  const computeSizeId = ((project as { compute_size_id?: ComputeTierId } | undefined)
    ?.compute_size_id ?? 'nano') as ComputeTierId
  const computeTierName = COMPUTE_TIERS.find((t) => t.id === computeSizeId)?.displayName

  const resume = useProjectResumeMutation()

  const ref = project?.ref
  const basePath = ref ? `/project/${ref}` : ''

  const quickLinks = [
    {
      title: 'Sources',
      description: 'Upload and manage document sources',
      href: `${basePath}/sources`,
      icon: FileText,
    },
    {
      title: 'Knowledge Bases',
      description: 'Create and manage knowledge bases',
      href: `${basePath}/knowledge-bases`,
      icon: Network,
    },
    {
      title: 'Agents',
      description: 'Create and manage AI agents',
      href: `${basePath}/agents`,
      icon: Bot,
    },
    {
      title: 'Workflows',
      description: 'Build multi-step AI workflows',
      href: `${basePath}/workflows`,
      icon: Workflow,
    },
    {
      title: 'Table Editor',
      description: 'Create and manage database tables',
      href: `${basePath}/editor`,
      icon: Table,
    },
    {
      title: 'SQL Editor',
      description: 'Write and execute SQL queries',
      href: `${basePath}/sql/new`,
      icon: SquareTerminal,
    },
    {
      title: 'Database',
      description: 'Manage schemas and database objects',
      href: `${basePath}/database/schemas`,
      icon: Database,
    },
    {
      title: 'Authentication',
      description: 'Manage users and auth settings',
      href: `${basePath}/auth/users`,
      icon: Lock,
    },
  ]

  return (
    <ScaffoldContainer size="large">
      <ScaffoldSection isFullWidth>
        <div className="flex flex-col gap-8 pb-16">
          {showComputeTier && project?.state === 'paused' && (
            <Alert_Shadcn_ variant="warning">
              <WarningIcon />
              <AlertTitle_Shadcn_>This project is paused</AlertTitle_Shadcn_>
              <AlertDescription_Shadcn_ className="flex flex-col gap-2">
                {(project as any).pause_cause === 'auto_grace_exhausted'
                  ? 'Paused automatically because your wallet grace zone was exhausted. Top up, then resume.'
                  : 'This project was paused. Resume it to bring it back online.'}
                <Button
                  type="default"
                  loading={resume.isPending}
                  onClick={() =>
                    resume.mutate(
                      { ref: project!.ref },
                      { onError: (e) => toast.error(e.message) }
                    )
                  }
                >
                  Resume project
                </Button>
              </AlertDescription_Shadcn_>
            </Alert_Shadcn_>
          )}
          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-col md:flex-row md:items-center gap-x-3 gap-y-2">
              <h1 className="text-3xl text-foreground">{project?.name ?? 'Project'}</h1>
              {showComputeTier && (
                <div className="flex items-center gap-x-2">
                  <Badge>{computeTierName}</Badge>
                  {/* Compute resize moved to the dedicated Infrastructure tab. */}
                  <Button asChild type="default" size="tiny">
                    <Link href={`${basePath}/infrastructure`}>Manage compute</Link>
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm text-foreground-light">
              {organization?.name ?? '—'} / {(project as any)?.slug ?? ref ?? '—'}
            </p>
          </div>

          {/* Project Details */}
          <div className="border rounded-lg p-6 bg-surface-100">
            <h2 className="text-base font-medium mb-4">Project Details</h2>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <dt className="text-xs text-foreground-lighter">Project Ref</dt>
                <dd className="text-sm text-foreground font-mono mt-0.5">{ref ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-lighter">Organization</dt>
                <dd className="text-sm text-foreground mt-0.5">{organization?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-lighter">Created</dt>
                <dd className="text-sm text-foreground mt-0.5">
                  {(project as any)?.created_at
                    ? new Date((project as any).created_at).toLocaleDateString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-lighter">Status</dt>
                <dd className="text-sm text-foreground mt-0.5">{project?.status ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Observability overview — compact version of /observability */}
          {ref && <OverviewStats projectRef={ref} />}

          {/* Quick Links */}
          <div>
            <h2 className="text-base font-medium mb-4">Quick Links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col gap-3 p-5 border rounded-lg bg-surface-100 hover:border-foreground-muted transition group"
                  >
                    <div className="w-10 h-10 rounded-md bg-brand-200 flex items-center justify-center text-brand-600 group-hover:bg-brand-300 transition">
                      <Icon size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{link.title}</h3>
                      <p className="text-xs text-foreground-lighter mt-0.5">{link.description}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </ScaffoldSection>
    </ScaffoldContainer>
  )
}
