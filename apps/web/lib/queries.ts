"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  apiFetch,
  API_URL,
  refreshSession,
  sha256,
  uploadWithProgress,
} from "./api";
import { useAuthStore } from "./auth-store";
import type {
  Appeal,
  CaseAction,
  CaseEvent,
  CaseRecord,
  CaseResponse,
  Claim,
  Contradiction,
  Deadline,
  Evidence,
  EvidenceBlock,
  GraphResponse,
  Notification,
  Paginated,
  ProceduralClaim,
  Procedure,
  ProcedureVersion,
  Readiness,
  RequirementMatch,
  SourceSnapshot,
  TimelineEvent,
  User,
} from "./types";

export function useCases(filters?: {
  status?: string;
  institutionId?: string;
}) {
  const params = new URLSearchParams({ limit: "50" });
  if (filters?.status) params.set("status", filters.status);
  if (filters?.institutionId)
    params.set("institutionId", filters.institutionId);
  return useQuery({
    queryKey: ["cases", filters],
    queryFn: () =>
      apiFetch<Paginated<CaseRecord>>(`/cases?${params.toString()}`),
  });
}

export function useCase(caseId: string) {
  return useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiFetch<CaseRecord>(`/cases/${caseId}`),
    enabled: Boolean(caseId),
  });
}
export function useEvents(caseId: string) {
  return useQuery({
    queryKey: ["events", caseId],
    queryFn: () =>
      apiFetch<Paginated<CaseEvent>>(`/cases/${caseId}/events?limit=100`),
    enabled: Boolean(caseId),
    refetchInterval: 30_000,
  });
}
export function useEvidence(caseId: string) {
  return useQuery({
    queryKey: ["evidence", caseId],
    queryFn: () =>
      apiFetch<Paginated<Evidence>>(`/cases/${caseId}/evidence?limit=100`),
    enabled: Boolean(caseId),
  });
}
export function useEvidenceDetail(caseId: string, evidenceId: string) {
  return useQuery({
    queryKey: ["evidence", caseId, evidenceId],
    queryFn: () =>
      apiFetch<Evidence>(`/cases/${caseId}/evidence/${evidenceId}`),
    enabled: Boolean(caseId && evidenceId),
  });
}
export function useEvidenceBlocks(caseId: string, evidenceId: string) {
  return useQuery({
    queryKey: ["blocks", caseId, evidenceId],
    queryFn: () =>
      apiFetch<EvidenceBlock[]>(
        `/cases/${caseId}/evidence/${evidenceId}/blocks`,
      ),
    enabled: Boolean(caseId && evidenceId),
  });
}
export function useProcedure(caseId: string) {
  return useQuery({
    queryKey: ["procedure", caseId],
    queryFn: () =>
      apiFetch<{
        procedure: Procedure | null;
        version: ProcedureVersion | null;
        claims: ProceduralClaim[];
        sources: SourceSnapshot[];
      }>(`/cases/${caseId}/procedure`),
    enabled: Boolean(caseId),
  });
}
export function useProcedureSources(caseId: string) {
  return useQuery({
    queryKey: ["procedure-sources", caseId],
    queryFn: () =>
      apiFetch<SourceSnapshot[]>(`/cases/${caseId}/procedure/sources`),
    enabled: Boolean(caseId),
  });
}
export function useProcedureClaims(caseId: string) {
  return useQuery({
    queryKey: ["procedure-claims", caseId],
    queryFn: () =>
      apiFetch<ProceduralClaim[]>(`/cases/${caseId}/procedure/claims`),
    enabled: Boolean(caseId),
  });
}
export function useClaims(caseId: string) {
  return useQuery({
    queryKey: ["claims", caseId],
    queryFn: () => apiFetch<Claim[]>(`/cases/${caseId}/claims`),
    enabled: Boolean(caseId),
  });
}
export function useTimeline(caseId: string) {
  return useQuery({
    queryKey: ["timeline", caseId],
    queryFn: () => apiFetch<TimelineEvent[]>(`/cases/${caseId}/timeline`),
    enabled: Boolean(caseId),
  });
}
export function useRequirements(caseId: string) {
  return useQuery({
    queryKey: ["requirements", caseId],
    queryFn: () =>
      apiFetch<RequirementMatch[]>(`/cases/${caseId}/requirements`),
    enabled: Boolean(caseId),
  });
}
export function useContradictions(caseId: string) {
  return useQuery({
    queryKey: ["contradictions", caseId],
    queryFn: () => apiFetch<Contradiction[]>(`/cases/${caseId}/contradictions`),
    enabled: Boolean(caseId),
  });
}
export function useGraph(caseId: string) {
  return useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => apiFetch<GraphResponse>(`/cases/${caseId}/graph`),
    enabled: Boolean(caseId),
  });
}
export function useAnalysis(caseId: string) {
  return useQuery({
    queryKey: ["analysis", caseId],
    queryFn: () =>
      apiFetch<{
        analysis: Record<string, unknown> | null;
        contradictionCount: number;
        openCriticalGapCount: number;
        readiness: Readiness | null;
      }>(`/cases/${caseId}/analysis`),
    enabled: Boolean(caseId),
  });
}
export function useAppeals(caseId: string) {
  return useQuery({
    queryKey: ["appeals", caseId],
    queryFn: () => apiFetch<Appeal[]>(`/cases/${caseId}/appeals`),
    enabled: Boolean(caseId),
  });
}
export function useResponses(caseId: string) {
  return useQuery({
    queryKey: ["responses", caseId],
    queryFn: () => apiFetch<CaseResponse[]>(`/cases/${caseId}/responses`),
    enabled: Boolean(caseId),
  });
}
export function useDeadlines(caseId: string) {
  return useQuery({
    queryKey: ["deadlines", caseId],
    queryFn: () => apiFetch<Deadline[]>(`/cases/${caseId}/deadlines`),
    enabled: Boolean(caseId),
  });
}
export function useNotifications(unread = false) {
  return useQuery({
    queryKey: ["notifications", unread],
    queryFn: () =>
      apiFetch<Notification[]>(`/notifications?unread=${String(unread)}`),
  });
}
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ user: User }>("/auth/me"),
    enabled: useAuthStore.getState().status === "authenticated",
  });
}

export function useCreateCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<CaseRecord>("/cases", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cases"] }),
  });
}
export function useUpdateCase(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<CaseRecord>(`/cases/${caseId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["case", caseId] });
      void client.invalidateQueries({ queryKey: ["events", caseId] });
      void client.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}
export function useDeleteCase(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>(`/cases/${caseId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cases"] });
      void client.invalidateQueries({ queryKey: ["case", caseId] });
    },
  });
}
export function useDeleteEvidence(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) =>
      apiFetch<null>(`/cases/${caseId}/evidence/${evidenceId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["evidence", caseId] }),
  });
}
export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Notification>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
export function useGenerateAppeal(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requestedOutcome: string) =>
      apiFetch<Appeal>(`/cases/${caseId}/appeals/generate`, {
        method: "POST",
        body: JSON.stringify({ requestedOutcome }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["appeals", caseId] }),
  });
}
export function useCreateAction(caseId: string, appealId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<CaseAction>(`/cases/${caseId}/appeals/${appealId}/actions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["appeals", caseId] }),
  });
}
export function useActionMutation(
  caseId: string,
  action: "approve" | "execute" | "cancel",
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      apiFetch<CaseAction>(`/cases/${caseId}/actions/${actionId}/${action}`, {
        method: "POST",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["appeals", caseId] });
      void client.invalidateQueries({ queryKey: ["case", caseId] });
    },
  });
}

export async function createUploadIntent(
  caseId: string,
  file: File,
  kind: string,
  label?: string,
) {
  return apiFetch<{
    evidenceId: string;
    uploadUrl: string;
    fields: Record<string, string>;
    expiresAt: string;
    maxBytes: number;
  }>(`/cases/${caseId}/evidence/upload-intent`, {
    method: "POST",
    body: JSON.stringify({
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      kind,
      label: label || undefined,
    }),
  });
}
export async function uploadEvidence(
  caseId: string,
  file: File,
  kind: string,
  onProgress: (value: number) => void,
  label?: string,
) {
  const intent = await createUploadIntent(caseId, file, kind, label);
  await uploadWithProgress(intent.uploadUrl, intent.fields, file, onProgress);
  const digest = await sha256(file);
  return apiFetch<Evidence>(`/cases/${caseId}/evidence/complete`, {
    method: "POST",
    body: JSON.stringify({ evidenceId: intent.evidenceId, sha256: digest }),
  });
}

export function useCaseActivityStream(caseId: string) {
  const client = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);
  useEffect(() => {
    if (!caseId || !token) return;
    let stopped = false;
    let lastEventId = "";
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const connect = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(
          `${API_URL}/cases/${caseId}/events/stream`,
          {
            headers: {
              Authorization: `Bearer ${useAuthStore.getState().accessToken ?? token}`,
              ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
            },
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (response.status === 401) {
          try {
            const session = await refreshSession();
            useAuthStore
              .getState()
              .setSession(session.accessToken, session.user);
          } catch {
            /* the protected shell handles sign-out */
          }
          throw new Error("SSE authentication expired");
        }
        if (!response.ok || !response.body)
          throw new Error("Activity stream unavailable");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const eventId = frame.match(/^id:\s*(.+)$/m)?.[1];
            if (eventId) lastEventId = eventId;
            const data = frame.match(/^data:\s*(.+)$/m)?.[1];
            if (data) {
              void client.invalidateQueries({ queryKey: ["events", caseId] });
              void client.invalidateQueries({ queryKey: ["case", caseId] });
              void client.invalidateQueries({ queryKey: ["notifications"] });
            }
          }
        }
      } catch {
        /* reconnect uses persisted MongoDB events as the recovery source */
      }
      if (!stopped) reconnectTimer = setTimeout(() => void connect(), 5000);
    };
    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [caseId, client, token]);
}
