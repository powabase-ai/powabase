import { projectApi } from '../ai-api'

export interface CustomTool {
  id: string
  name: string
  description: string | null
  type: string
  input_schema: Record<string, unknown> | null
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ToolRule {
  field: string
  operator: string
  value: string
  action: string
  message: string
}

export const toolsApi = {
  list: (token: string, ref: string) =>
    projectApi<{ tools: CustomTool[] }>(token, ref, '/tools'),

  create: (
    token: string,
    ref: string,
    data: {
      name: string
      description?: string
      type: string
      input_schema?: Record<string, unknown>
      config: Record<string, unknown>
    }
  ) => projectApi<CustomTool>(token, ref, '/tools', { method: 'POST', body: data }),

  get: (token: string, ref: string, toolId: string) =>
    projectApi<CustomTool>(token, ref, `/tools/${toolId}`),

  update: (
    token: string,
    ref: string,
    toolId: string,
    data: Partial<{
      name: string
      description: string
      input_schema: Record<string, unknown>
      config: Record<string, unknown>
    }>
  ) => projectApi<CustomTool>(token, ref, `/tools/${toolId}`, { method: 'PUT', body: data }),

  delete: (token: string, ref: string, toolId: string) =>
    projectApi<void>(token, ref, `/tools/${toolId}`, { method: 'DELETE' }),
}
