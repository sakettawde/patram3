import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "#/lib/api";
import { USER_ID_STORAGE_KEY, type User } from "./types";

function readStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_ID_STORAGE_KEY);
}

export function useStoredUserId() {
  const [userId, setUserId] = useState<string | null>(() => readStoredUserId());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === USER_ID_STORAGE_KEY) setUserId(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = (id: string | null) => {
    if (id) window.localStorage.setItem(USER_ID_STORAGE_KEY, id);
    else window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    setUserId(id);
  };

  return [userId, set] as const;
}

export function useCurrentUserQuery(userId: string | null) {
  return useQuery<User, ApiError>({
    queryKey: ["currentUser", userId],
    queryFn: () => api.get<User>(`/users/${userId}`),
    enabled: !!userId,
    retry: (count, err) => err.status !== 404 && count < 2,
    staleTime: Infinity,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<User, ApiError, { name: string }>({
    mutationFn: (input) => api.post<User>("/users", input),
    onSuccess: (user) => {
      qc.setQueryData(["currentUser", user.id], user);
    },
  });
}
