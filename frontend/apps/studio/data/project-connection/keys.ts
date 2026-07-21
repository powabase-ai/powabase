export const connectionKeys = {
  all: ['project-connection'] as const,
  info: (ref: string | undefined) =>
    [...connectionKeys.all, 'info', ref] as const,
}
