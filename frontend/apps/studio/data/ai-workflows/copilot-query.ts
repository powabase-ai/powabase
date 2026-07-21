"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "common";
import { copilotApi, hasAiAuth } from "@/lib/ai-api";
import { useSessionAccessTokenQuery } from "@/data/auth/session-access-token-query";

export const copilotKeys = {
  all: ["copilot"] as const,
  session: (workflowId: string) => [...copilotKeys.all, "session", workflowId] as const,
  messages: (sessionId: string) => [...copilotKeys.all, "messages", sessionId] as const,
  model: (ref: string) => [...copilotKeys.all, "model", ref] as const,
};

export function useCopilotSessionQuery(workflowId: string) {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();

  return useQuery({
    queryKey: copilotKeys.session(workflowId),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      // Self-host: token is legitimately '' | null | undefined here — hasAiAuth
      // (not a type predicate) already proved that's OK; the proxy injects the
      // real credential. `!` matches the same non-null-assertion pattern
      // pages/project/[ref]/agents/index.tsx uses for the same reason.
      return copilotApi.getSession(token!, ref as string, workflowId);
    },
    enabled: hasAiAuth(token) && !!ref && !!workflowId,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });
}

export function useCopilotMessagesQuery(sessionId: string | null) {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();

  return useQuery({
    queryKey: copilotKeys.messages(sessionId ?? ""),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref || !sessionId) throw new Error("Missing authentication or project ref");
      return copilotApi.getMessages(token!, ref as string, sessionId);
    },
    enabled: hasAiAuth(token) && !!ref && !!sessionId,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
}

export function useCopilotModelQuery() {
  const { ref } = useParams();
  const { data: token } = useSessionAccessTokenQuery();

  return useQuery({
    queryKey: copilotKeys.model((ref as string) ?? ""),
    queryFn: async () => {
      if (!hasAiAuth(token) || !ref) throw new Error("Missing authentication or project ref");
      return copilotApi.getModel(token!, ref as string);
    },
    enabled: hasAiAuth(token) && !!ref,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
}
