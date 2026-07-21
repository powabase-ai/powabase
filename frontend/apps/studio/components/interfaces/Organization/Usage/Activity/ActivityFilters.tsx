import { useState } from 'react'
import {
  Button,
  Command_Shadcn_,
  CommandEmpty_Shadcn_,
  CommandGroup_Shadcn_,
  CommandInput_Shadcn_,
  CommandItem_Shadcn_,
  CommandList_Shadcn_,
  Popover_Shadcn_,
  PopoverContent_Shadcn_,
  PopoverTrigger_Shadcn_,
} from 'ui'

import { usePricingQuery } from '@/data/credits/pricing-query'
import {
  useOrgProjectsInfiniteQuery,
  type OrgProject,
} from '@/data/projects/org-projects-infinite-query'

export type ActivityFiltersState = {
  start_date?: string
  end_date?: string
  action?: string
  project_id?: string
  ref_id_substring?: string
}

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
] as const

export function ActivityFilters({
  orgSlug,
  filters,
  onChange,
}: {
  orgSlug: string
  filters: ActivityFiltersState
  onChange: (next: ActivityFiltersState) => void
}) {
  const { data: pricing } = usePricingQuery()

  // Flatten all pages from the infinite query into a flat project list.
  // The Powabase CP returns an internal UUID as `id` on each row alongside
  // the human-readable `ref` slug (see build_project_list_item in the
  // control-plane platform_helpers.py); the OrgProject augmentation in
  // org-projects-infinite-query.ts encodes that. The ledger's project_id
  // filter expects a UUID, so we send `id`, not `ref`. Rows without an id
  // are dropped from the filter — the BE always populates it, so this is
  // defensive against an unexpected response shape rather than an expected
  // case.
  const { data: projectsData } = useOrgProjectsInfiniteQuery({ slug: orgSlug })
  const allProjects = (projectsData?.pages.flatMap((p) => p.projects) ?? []) as OrgProject[]
  const projects = allProjects.filter(
    (p): p is OrgProject & { id: string } => typeof p.id === 'string'
  )

  return (
    <div className="flex flex-wrap gap-3 items-center mb-4">
      <DatePresetDropdown
        current={filters.start_date}
        onChange={(days) => {
          if (days === null) {
            onChange({ ...filters, start_date: undefined, end_date: undefined })
          } else {
            const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
            onChange({ ...filters, start_date: start, end_date: undefined })
          }
        }}
      />

      <ActionFilter
        value={filters.action}
        actions={pricing?.pricing.map((r) => r.action) ?? []}
        onChange={(action) => onChange({ ...filters, action })}
      />

      <ProjectFilter
        value={filters.project_id}
        projects={projects.map((p) => ({ id: p.id, ref: p.ref, name: p.name }))}
        onChange={(project_id) => onChange({ ...filters, project_id })}
      />

      <input
        data-testid="activity-runid-search"
        type="text"
        placeholder="Run ID search (e.g. run_abc123)"
        value={filters.ref_id_substring ?? ''}
        onChange={(e) => onChange({ ...filters, ref_id_substring: e.target.value || undefined })}
        className="px-3 py-1 border border-default rounded text-xs bg-surface-100 text-foreground placeholder:text-foreground-muted"
      />
    </div>
  )
}

function DatePresetDropdown({
  current,
  onChange,
}: {
  current?: string
  onChange: (days: number | null) => void
}) {
  const [open, setOpen] = useState(false)

  const label = (() => {
    if (!current) return 'All time'
    const elapsedMs = Date.now() - new Date(current).getTime()
    const tolerance = 60 * 60 * 1000 // 1 hour
    for (const p of DATE_PRESETS) {
      if (p.days === null) continue
      const presetMs = p.days * 24 * 60 * 60 * 1000
      if (Math.abs(elapsedMs - presetMs) < tolerance) return p.label
    }
    return 'Custom date'
  })()

  return (
    <Popover_Shadcn_ open={open} onOpenChange={setOpen}>
      <PopoverTrigger_Shadcn_ asChild>
        <Button type="default" size="tiny">
          {label}
        </Button>
      </PopoverTrigger_Shadcn_>
      <PopoverContent_Shadcn_ className="p-1 w-40" align="start">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              onChange(p.days)
              setOpen(false)
            }}
            className="block w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-200 text-foreground"
          >
            {p.label}
          </button>
        ))}
      </PopoverContent_Shadcn_>
    </Popover_Shadcn_>
  )
}

function ActionFilter({
  value,
  actions,
  onChange,
}: {
  value?: string
  actions: string[]
  onChange: (action: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover_Shadcn_ open={open} onOpenChange={setOpen}>
      <PopoverTrigger_Shadcn_ asChild>
        <Button
          type="default"
          size="tiny"
          data-testid="activity-action-filter"
        >
          {value ?? 'All actions'}
        </Button>
      </PopoverTrigger_Shadcn_>
      <PopoverContent_Shadcn_ className="p-0 w-52" align="start">
        <Command_Shadcn_>
          <CommandInput_Shadcn_ placeholder="Search actions..." />
          <CommandList_Shadcn_>
            <CommandEmpty_Shadcn_>No actions found</CommandEmpty_Shadcn_>
            <CommandGroup_Shadcn_>
              <CommandItem_Shadcn_
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                All
              </CommandItem_Shadcn_>
              {actions.map((action) => (
                <CommandItem_Shadcn_
                  key={action}
                  onSelect={() => {
                    onChange(action)
                    setOpen(false)
                  }}
                >
                  {action}
                </CommandItem_Shadcn_>
              ))}
            </CommandGroup_Shadcn_>
          </CommandList_Shadcn_>
        </Command_Shadcn_>
      </PopoverContent_Shadcn_>
    </Popover_Shadcn_>
  )
}

function ProjectFilter({
  value,
  projects,
  onChange,
}: {
  // `value` is the project UUID — what gets sent to the ledger's project_id
  // filter. The UI shows the human-readable name (with ref as a subtitle).
  value?: string
  projects: { id: string; ref: string; name: string }[]
  onChange: (project_id: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedName = value ? (projects.find((p) => p.id === value)?.name ?? value) : undefined
  return (
    <Popover_Shadcn_ open={open} onOpenChange={setOpen}>
      <PopoverTrigger_Shadcn_ asChild>
        <Button
          type="default"
          size="tiny"
          data-testid="activity-project-filter"
        >
          {selectedName ?? 'All projects'}
        </Button>
      </PopoverTrigger_Shadcn_>
      <PopoverContent_Shadcn_ className="p-0 w-56" align="start">
        <Command_Shadcn_>
          <CommandInput_Shadcn_ placeholder="Search projects..." />
          <CommandList_Shadcn_>
            <CommandEmpty_Shadcn_>No projects found</CommandEmpty_Shadcn_>
            <CommandGroup_Shadcn_>
              <CommandItem_Shadcn_
                onSelect={() => {
                  onChange(undefined)
                  setOpen(false)
                }}
              >
                All projects
              </CommandItem_Shadcn_>
              {projects.map((p) => (
                <CommandItem_Shadcn_
                  key={p.id}
                  onSelect={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  {p.name}
                </CommandItem_Shadcn_>
              ))}
            </CommandGroup_Shadcn_>
          </CommandList_Shadcn_>
        </Command_Shadcn_>
      </PopoverContent_Shadcn_>
    </Popover_Shadcn_>
  )
}
