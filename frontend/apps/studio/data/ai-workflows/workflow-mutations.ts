import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'common'

import { workflowKeys } from './keys'
import { blockRegistry } from './block-registry'
import { useSessionAccessTokenQuery } from '@/data/auth/session-access-token-query'
import { hasAiAuth } from '@/lib/ai-api'
import { workflowsApi, type WorkflowDetail, type WorkflowBlock, type WorkflowEdge } from '@/lib/ai-api/workflows-api'

export function useCreateWorkflowMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.create(token!, ref, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
    },
  })
}

export function useDeleteWorkflowMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.delete(token!, ref, workflowId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.all })
    },
  })
}

export function useSaveGraphMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      workflowId,
      graph,
    }: {
      workflowId: string
      graph: { blocks: unknown[]; edges: unknown[] }
    }) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.saveGraph(token!, ref, workflowId, graph)
    },
    onSuccess: (_, variables) => {
      if (ref) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(ref, variables.workflowId),
        })
      }
    },
  })
}

export function useExecuteWorkflowMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      workflowId,
      variables,
    }: {
      workflowId: string
      variables?: Record<string, unknown>
    }) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.execute(token!, ref, workflowId, variables)
    },
    onSuccess: (_, variables) => {
      if (ref) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.executions(ref, variables.workflowId),
        })
      }
    },
  })
}

export function useDeployWorkflowMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workflowId, deploy }: { workflowId: string; deploy: boolean }) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return deploy ? workflowsApi.deploy(token!, ref, workflowId) : workflowsApi.undeploy(token!, ref, workflowId)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
      if (ref) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(ref, variables.workflowId),
        })
      }
    },
  })
}

export function useUpdateWorkflowMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      workflowId,
      data,
    }: {
      workflowId: string
      data: { name?: string; description?: string }
    }) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.update(token!, ref, workflowId, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() })
      if (ref) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(ref, variables.workflowId),
        })
      }
    },
  })
}

export function useArmWebhookMutation() {
  const { ref } = useParams()
  const { data: token } = useSessionAccessTokenQuery()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (workflowId: string) => {
      if (!hasAiAuth(token) || !ref) throw new Error('Missing authentication or project ref')
      return workflowsApi.arm(token!, ref, workflowId)
    },
    onSuccess: (_, workflowId) => {
      if (ref) {
        queryClient.invalidateQueries({
          queryKey: workflowKeys.detail(ref, workflowId),
        })
      }
    },
  })
}
export function exportWorkflowAsJson(workflow: WorkflowDetail): void {
  const exported = {
    name: workflow.name,
    description: workflow.description,
    version: workflow.version,
    variables: workflow.variables ?? {},
    blocks: (workflow.blocks ?? []).map((b) => ({
      id: b.id,
      type: b.type,
      name: b.name,
      position: b.position,
      config: b.config,
      enabled: b.enabled,
    })),
    edges: (workflow.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      condition: e.condition,
    })),
  };

  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${workflow.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateWorkflowJson(
  data: unknown
):
  | { valid: true; blocks: WorkflowBlock[]; edges: WorkflowEdge[] }
  | { valid: false; error: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, error: "Invalid JSON: expected an object" };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.blocks)) {
    return { valid: false, error: "Missing or invalid 'blocks' array" };
  }
  if (!Array.isArray(obj.edges)) {
    return { valid: false, error: "Missing or invalid 'edges' array" };
  }

  const blockIds = new Set<string>();

  for (let i = 0; i < obj.blocks.length; i++) {
    const block = obj.blocks[i] as Record<string, unknown>;
    if (!block || typeof block !== "object") {
      return { valid: false, error: `Block ${i}: not an object` };
    }
    if (typeof block.id !== "string" || !block.id) {
      return { valid: false, error: `Block ${i}: missing or invalid 'id'` };
    }
    if (typeof block.type !== "string" || !block.type) {
      return { valid: false, error: `Block ${i}: missing or invalid 'type'` };
    }
    if (!(block.type in blockRegistry)) {
      return { valid: false, error: `Block ${i}: unknown block type '${block.type}'` };
    }
    if (
      !block.position ||
      typeof block.position !== "object" ||
      typeof (block.position as Record<string, unknown>).x !== "number" ||
      typeof (block.position as Record<string, unknown>).y !== "number"
    ) {
      return { valid: false, error: `Block ${i}: missing or invalid 'position' (need x, y numbers)` };
    }
    blockIds.add(block.id);
  }

  for (let i = 0; i < obj.edges.length; i++) {
    const edge = obj.edges[i] as Record<string, unknown>;
    if (!edge || typeof edge !== "object") {
      return { valid: false, error: `Edge ${i}: not an object` };
    }
    if (typeof edge.source !== "string" || !edge.source) {
      return { valid: false, error: `Edge ${i}: missing or invalid 'source'` };
    }
    if (typeof edge.target !== "string" || !edge.target) {
      return { valid: false, error: `Edge ${i}: missing or invalid 'target'` };
    }
    if (!blockIds.has(edge.source)) {
      return { valid: false, error: `Edge ${i}: source '${edge.source}' not found in blocks` };
    }
    if (!blockIds.has(edge.target)) {
      return { valid: false, error: `Edge ${i}: target '${edge.target}' not found in blocks` };
    }
  }

  return {
    valid: true,
    blocks: obj.blocks as WorkflowBlock[],
    edges: obj.edges as WorkflowEdge[],
  };
}
