import { Check, Mail } from 'lucide-react'
import Link from 'next/link'
import { Button, Separator } from 'ui'

import { NO_PROJECT_MARKER } from './SupportForm.utils'
import { useProjectDetailQuery } from '@/data/projects/project-detail-query'
import { useProfile } from '@/lib/profile'

interface SuccessProps {
  sentCategory?: string
  selectedProject?: string
}

export const Success = ({ selectedProject = NO_PROJECT_MARKER }: SuccessProps) => {
  const { profile } = useProfile()
  const respondToEmail = profile?.primary_email ?? 'your email'

  const { data: project } = useProjectDetailQuery(
    { ref: selectedProject },
    { enabled: selectedProject !== NO_PROJECT_MARKER }
  )
  const projectName = project ? project.name : 'No specific project'

  return (
    <div className="mt-10 max-w-[620px] flex flex-col items-center space-y-4">
      <div className="relative">
        <Mail strokeWidth={1.5} size={60} className="text-brand" />
        <div className="h-6 w-6 rounded-full bg-brand absolute bottom-1 -right-1.5 flex items-center justify-center">
          <Check strokeWidth={4} size={16} className="text-contrast" />
        </div>
      </div>
      <div className="flex items-center flex-col space-y-2 text-center p-4">
        <h3 className="text-xl">Support request sent</h3>

        <p className="text-sm text-foreground-light text-balance">
          {selectedProject !== NO_PROJECT_MARKER && (
            <>
              Your ticket has been logged for the project{' '}
              <span className="text-foreground font-medium">{projectName}</span> with project ID:{' '}
              <span className="text-foreground font-medium">{selectedProject}</span>.
            </>
          )}{' '}
          We will reach out to you at{' '}
          <span className="text-foreground font-medium">{respondToEmail}</span>.
        </p>
      </div>
      <div className="!mt-10 w-full">
        <Separator />
      </div>
      <div className="w-full pb-4 px-4 flex items-center justify-end">
        <Button asChild type="default">
          <Link href="/">Finish</Link>
        </Button>
      </div>
    </div>
  )
}
