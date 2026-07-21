import { useMemo } from 'react'

import { useIsPgDeltaDiffEnabled } from '@/components/interfaces/App/FeaturePreview/FeaturePreviewContext'
import { useBranchDiffQuery } from '@/data/branches/branch-diff-query'
import { useMigrationsQuery } from '@/data/database/migrations-query'

interface UseBranchMergeDiffProps {
  currentBranchRef?: string
  parentProjectRef?: string
  currentBranchConnectionString?: string
  parentBranchConnectionString?: string
  currentBranchCreatedAt?: string
}

export interface BranchMergeDiffResult {
  // Database diff
  diffContent: string | undefined
  isDatabaseDiffLoading: boolean
  isDatabaseDiffRefetching: boolean
  databaseDiffError: any
  refetchDatabaseDiff: () => void

  // Migrations
  currentBranchMigrations: any[] | undefined
  mainBranchMigrations: any[] | undefined
  refetchCurrentBranchMigrations: () => void
  refetchMainBranchMigrations: () => void

  // Branch state
  isBranchOutOfDateMigrations: boolean
  isBranchOutOfDateOverall: boolean
  missingMigrationsCount: number

  // Combined states
  isLoading: boolean
  hasChanges: boolean
}

export const useBranchMergeDiff = ({
  currentBranchRef,
  parentProjectRef,
  currentBranchConnectionString,
  parentBranchConnectionString,
  currentBranchCreatedAt,
}: UseBranchMergeDiffProps): BranchMergeDiffResult => {
  const pgDeltaDiffEnabled = useIsPgDeltaDiffEnabled()

  // Get database diff
  const {
    data: diffContent,
    isPending: isDatabaseDiffLoading,
    isRefetching: isDatabaseDiffRefetching,
    error: databaseDiffError,
    refetch: refetchDatabaseDiff,
  } = useBranchDiffQuery(
    {
      branchRef: currentBranchRef || '',
      projectRef: parentProjectRef || '',
      pgdelta: pgDeltaDiffEnabled,
    },
    {
      enabled: !!currentBranchRef && !!parentProjectRef,
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
      staleTime: 0,
    }
  )

  // Get migrations for both current branch and main branch
  const { data: currentBranchMigrations, refetch: refetchCurrentBranchMigrations } =
    useMigrationsQuery(
      {
        projectRef: currentBranchRef,
        connectionString: currentBranchConnectionString,
      },
      {
        enabled: !!currentBranchRef,
        staleTime: 3000,
      }
    )

  const { data: mainBranchMigrations, refetch: refetchMainBranchMigrations } = useMigrationsQuery(
    {
      projectRef: parentProjectRef,
      connectionString: parentBranchConnectionString,
    },
    {
      enabled: !!parentProjectRef,
      staleTime: 3000,
    }
  )

  // Check if current branch is out of date with main branch (migrations)
  const isBranchOutOfDateMigrations = useMemo(() => {
    if (!currentBranchMigrations || !mainBranchMigrations) return false

    // Get the latest migration version from main branch
    const latestMainMigration = mainBranchMigrations[0] // migrations are ordered by version desc
    if (!latestMainMigration) return false

    // Check if current branch has this latest migration
    const hasLatestMigration = currentBranchMigrations.some(
      (migration) => migration.version === latestMainMigration.version
    )

    return !hasLatestMigration
  }, [currentBranchMigrations, mainBranchMigrations])

  // Overall out-of-date check (migrations only — no Deno runtime in Agentic Platform)
  const isBranchOutOfDateOverall = isBranchOutOfDateMigrations

  // Get the count of migrations that the branch is missing
  const missingMigrationsCount = useMemo(() => {
    if (!currentBranchMigrations || !mainBranchMigrations || !isBranchOutOfDateMigrations) return 0

    const currentVersions = new Set(currentBranchMigrations.map((m) => m.version))
    return mainBranchMigrations.filter((m) => !currentVersions.has(m.version)).length
  }, [currentBranchMigrations, mainBranchMigrations, isBranchOutOfDateMigrations])

  // Check if there are any changes (database)
  const hasChanges = useMemo(() => {
    return !!diffContent && diffContent.trim() !== ''
  }, [diffContent])

  const isLoading = isDatabaseDiffLoading

  return {
    // Database diff
    diffContent,
    isDatabaseDiffLoading,
    isDatabaseDiffRefetching,
    databaseDiffError,
    refetchDatabaseDiff,

    // Migrations
    currentBranchMigrations,
    mainBranchMigrations,
    refetchCurrentBranchMigrations,
    refetchMainBranchMigrations,

    // Branch state
    isBranchOutOfDateMigrations,
    isBranchOutOfDateOverall,
    missingMigrationsCount,

    // Combined states
    isLoading,
    hasChanges,
  }
}
