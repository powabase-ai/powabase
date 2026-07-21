export const settingsKeys = {
  all: ['settings'] as const,
  list: (ref: string | undefined) => [...settingsKeys.all, 'list', ref] as const,
}
