export const workflowKeys = {
  all: ['ai-workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (ref: string | undefined) => [...workflowKeys.lists(), ref] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (ref: string | undefined, id: string) => [...workflowKeys.details(), ref, id] as const,
  executions: (ref: string | undefined, id: string) =>
    [...workflowKeys.all, 'executions', ref, id] as const,
  blockLogs: (ref: string | undefined, executionId: string) =>
    [...workflowKeys.all, 'blockLogs', ref, executionId] as const,
}
