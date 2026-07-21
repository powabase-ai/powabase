// Query keys for the observability dashboards. Keep these distinct from
// billing/usage keys so invalidation does not cross-contaminate.

export const observabilityKeys = {
  // Per-project (reads ai.* via PostgREST on each project)
  projectHealth: (projectRef: string | undefined, range: string) =>
    ['observability', 'project', projectRef, 'health', range] as const,
  projectAgentRuns: (projectRef: string | undefined, range: string) =>
    ['observability', 'project', projectRef, 'agent-runs', range] as const,
  projectExtraction: (projectRef: string | undefined, range: string) =>
    ['observability', 'project', projectRef, 'extraction', range] as const,
  projectTokens: (
    projectRef: string | undefined,
    range: string,
    filters: string,
    groupBy: string,
  ) => ['observability', 'project', projectRef, 'tokens', range, filters, groupBy] as const,
  projectToolCalls: (projectRef: string | undefined, range: string, filters: string) =>
    ['observability', 'project', projectRef, 'tool-calls', range, filters] as const,
  projectFilterOptions: (projectRef: string | undefined) =>
    ['observability', 'project', projectRef, 'filter-options'] as const,
  projectWorkflows: (projectRef: string | undefined, range: string) =>
    ['observability', 'project', projectRef, 'workflows', range] as const,

  // Org-level (reads the new /organizations/<slug>/stats endpoint)
  orgStats: (slug: string | undefined, range: string, metric: string) =>
    ['observability', 'org', slug, 'stats', metric, range] as const,

  // Platform-level (same endpoint, scope=platform)
  platformStats: (range: string, metric: string) =>
    ['observability', 'platform', 'stats', metric, range] as const,

  // Prometheus proxy (admin only)
  prom: (query: string, range: string) =>
    ['observability', 'prom', query, range] as const,
}
