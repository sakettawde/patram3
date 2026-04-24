import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import { ApiError, unwrap } from "#/lib/api-error";
import { qk } from "#/lib/query-keys";

export type MeResponse = {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; slug: string; createdAt: string; updatedAt: string };
  role: "owner" | "editor" | "viewer";
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => unwrap<MeResponse>(await api.me.$get()),
    staleTime: Infinity,
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch("/auth/sign-in/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.documents });
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email: string; password: string }) => {
      const res = await fetch("/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.documents });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new ApiError(res.status, null);
      try {
        return await res.json();
      } catch {
        return {};
      }
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}
