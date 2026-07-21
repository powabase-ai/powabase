"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "common";
import { copilotApi, hasAiAuth } from "@/lib/ai-api";
import { copilotKeys } from "./copilot-query";
import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";

export function useCreateCopilotSessionMutation() {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflowId: string) => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      return copilotApi.createSession(token!, ref as string, workflowId);
    },
    onSuccess: (_, workflowId) => {
      queryClient.invalidateQueries({ queryKey: copilotKeys.session(workflowId) });
    },
  });
}

export function useDeleteCopilotSessionMutation() {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, workflowId }: { sessionId: string; workflowId: string }) => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      return copilotApi.deleteSession(token!, ref as string, sessionId);
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: copilotKeys.session(workflowId) });
    },
  });
}

export function useSaveCopilotSnapshotMutation() {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();

  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      preSnapshot,
    }: {
      sessionId: string;
      messageId: string;
      preSnapshot: { nodes: unknown[]; edges: unknown[] };
    }) => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      return copilotApi.saveSnapshot(
        token!, ref as string,
        sessionId, messageId, preSnapshot
      );
    },
  });
}

export function useSetCopilotModelMutation() {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (model: string) => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      return copilotApi.setModel(token!, ref as string, model);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copilotKeys.model((ref as string) ?? "") });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: copilotKeys.model((ref as string) ?? "") });
    },
  });
}
