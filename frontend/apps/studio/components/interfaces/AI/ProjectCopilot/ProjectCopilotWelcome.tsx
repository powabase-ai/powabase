import { Database, KeyRound, Plug, Sparkles } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogSection, DialogTitle } from 'ui'
import { GUIDE_SEQUENCES } from '@/components/interfaces/AI/GuideBubbles/guide-sequences'

const DOCS_CONNECTION = 'https://docs.powabase.ai/guides/auth-connection'
const INTEGRATIONS = 'https://powabase.ai/integrations/'

/** Quick-start chips that launch a guide sequence. */
const QUICK_STARTS: Array<{ id: string; label: string }> = [
  { id: 'connect', label: 'Connect a coding agent' },
  { id: 'add-sources', label: 'Add sources' },
  { id: 'create-knowledge-base', label: 'Create a knowledge base' },
  { id: 'create-agent', label: 'Create an agent' },
  { id: 'create-table', label: 'Create a table' },
]

/**
 * The connection-guide content shared by the empty-panel state and the
 * first-entry modal. Templated (no LLM call) — the very first thing a new user
 * sees is how to connect their coding agent / vibe-coding platform.
 *
 * NOTE: screenshots from the integrations + auth-connection docs are intended to
 * be bundled as static assets and embedded here; until those land we link out to
 * the docs so nothing renders broken.
 */
export const ProjectCopilotWelcomeBody = ({
  onStartGuide,
}: {
  onStartGuide: (sequenceId: string) => void
}) => {
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-1">
        <p className="text-sm text-foreground">
          👋 Welcome to your Powabase project. I&apos;m your Project Copilot — I can walk you
          through the app and answer questions from the docs.
        </p>
      </div>

      <div className="rounded-md border border-default p-3 flex flex-col gap-y-2">
        <div className="flex items-center gap-x-2">
          <Plug size={16} className="text-brand" />
          <p className="text-sm font-medium text-foreground">Connect your project</p>
        </div>
        <p className="text-sm text-foreground-light">
          Point your coding agent or vibe-coding platform at this project using its connection
          string and API keys.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="primary" size="tiny" icon={<KeyRound size={14} />} onClick={() => onStartGuide('connect')}>
            Show me how to connect
          </Button>
          <Button asChild type="default" size="tiny">
            <a href={DOCS_CONNECTION} target="_blank" rel="noopener noreferrer">
              Connection docs
            </a>
          </Button>
          <Button asChild type="text" size="tiny">
            <a href={INTEGRATIONS} target="_blank" rel="noopener noreferrer">
              Integrations
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        <p className="text-xs uppercase tracking-wide text-foreground-lighter">Quick starts</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_STARTS.filter((q) => GUIDE_SEQUENCES[q.id]).map((q) => (
            <Button
              key={q.id}
              type="default"
              size="tiny"
              icon={q.id === 'create-table' ? <Database size={14} /> : <Sparkles size={14} />}
              onClick={() => onStartGuide(q.id)}
            >
              {q.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-foreground-light">
        Or just ask me anything below — like “how do I add a source to a knowledge base?”
      </p>
    </div>
  )
}

/**
 * Centered first-entry welcome modal. Shows the connection guide, then docks
 * into the side panel when dismissed.
 */
export const ProjectCopilotWelcomeModal = ({
  open,
  onOpenChange,
  onStartGuide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartGuide: (sequenceId: string) => void
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="large" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-x-2">
            <Sparkles size={18} className="text-brand" />
            Welcome to your Powabase project
          </DialogTitle>
        </DialogHeader>
        <DialogSection>
          <ProjectCopilotWelcomeBody
            onStartGuide={(id) => {
              onOpenChange(false)
              onStartGuide(id)
            }}
          />
        </DialogSection>
      </DialogContent>
    </Dialog>
  )
}
