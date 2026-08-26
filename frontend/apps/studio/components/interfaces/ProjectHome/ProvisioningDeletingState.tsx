import { Loader2 } from 'lucide-react'

import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'

/**
 * The project home while the platform is tearing the project down. Only ever
 * seen on a page that was already open, or on a reload during teardown — the
 * lists hide a project being deleted. The detail poll keeps running until the
 * platform answers 404, which the layout turns into a redirect.
 */
export const ProvisioningDeletingState = () => {
  const { data: project } = useSelectedProjectQuery()

  return (
    <div className="flex flex-col gap-4 pb-16" data-testid="provisioning-deleting-state">
      <h1 className="text-3xl text-foreground">{project?.name ?? 'Project'}</h1>
      <p className="flex items-center gap-2 text-sm text-foreground-light" role="status">
        <Loader2 className="animate-spin" size={14} aria-hidden="true" />
        This project is being deleted. You'll be taken back to your organizations when it is gone.
      </p>
    </div>
  )
}
