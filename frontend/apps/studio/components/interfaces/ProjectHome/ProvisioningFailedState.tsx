import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useParams } from 'common'
import { toast } from 'sonner'
import { Alert_Shadcn_, AlertDescription_Shadcn_, AlertTitle_Shadcn_, CriticalIcon } from 'ui'

import { DeleteProjectButton } from '@/components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectButton'
import { SupportLink } from '@/components/interfaces/Support/SupportLink'
import { ButtonTooltip } from '@/components/ui/ButtonTooltip'
import { useProjectProvisioningRetryMutation } from '@/data/projects/project-provisioning-retry-mutation'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import { getFailedTitle } from './ProvisioningState.utils'

/**
 * The project home when the last set-up attempt failed: which phase broke,
 * the platform's safe error string, Retry (when the platform marks the
 * attempt retryable and the member may update the project — the same
 * permission the settings page's Delete uses), Delete, and support.
 */
export const ProvisioningFailedState = ({ degraded = false }: { degraded?: boolean }) => {
  const { ref } = useParams()
  const { data: project } = useSelectedProjectQuery()
  const retry = useProjectProvisioningRetryMutation()
  const { can: canUpdateProject } = useAsyncCheckPermissions(PermissionAction.UPDATE, 'projects', {
    resource: { project_id: project?.id },
  })

  const provisioning = project?.provisioning ?? null
  const canRetry = provisioning?.retryable === true

  return (
    <div className="flex flex-col gap-8 pb-16" data-testid="provisioning-failed-state">
      <h1 className="text-3xl text-foreground">{project?.name ?? 'Project'}</h1>

      <Alert_Shadcn_ variant="destructive">
        <CriticalIcon />
        <AlertTitle_Shadcn_>{getFailedTitle(provisioning?.phase)}</AlertTitle_Shadcn_>
        <AlertDescription_Shadcn_ className="flex flex-col gap-3">
          {provisioning?.error ? (
            <p data-testid="provisioning-error">{provisioning.error}</p>
          ) : null}
          <p>
            {canRetry
              ? 'You can retry the set-up, or delete the project and start over.'
              : 'This set-up cannot be retried; delete the project and start over.'}{' '}
            If it keeps failing, <SupportLink>contact support</SupportLink>.
          </p>
          {degraded ? <p role="status">We can't reach the platform right now — retrying.</p> : null}
          <div className="flex items-center gap-2">
            <ButtonTooltip
              type="primary"
              loading={retry.isPending}
              disabled={!ref || !canRetry || !canUpdateProject}
              onClick={() =>
                ref &&
                retry.mutate(
                  { ref },
                  {
                    // 409 means the project already moved on; the refetch the
                    // mutation triggers shows the real state — no message.
                    onError: (e) => {
                      if (e.code !== 409) toast.error(`Retry failed: ${e.message}`)
                    },
                  }
                )
              }
              tooltip={{
                content: {
                  side: 'bottom',
                  text: !canUpdateProject
                    ? "You need additional permissions to retry this project's setup"
                    : undefined,
                },
              }}
            >
              Retry setup
            </ButtonTooltip>
            <DeleteProjectButton type="default" />
          </div>
        </AlertDescription_Shadcn_>
      </Alert_Shadcn_>
    </div>
  )
}
