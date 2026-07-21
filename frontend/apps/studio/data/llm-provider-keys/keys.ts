export const llmProviderKeysKeys = {
  list: (ref?: string) => ['llm-provider-keys', ref, 'list'] as const,
  platformSupported: (ref?: string) => ['llm-provider-keys', ref, 'platform-supported'] as const,
}
