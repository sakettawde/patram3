import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { documentsApi, type DocPatch, type DocumentRow } from "#/lib/documents-api";

const SAVE_DEBOUNCE_MS = 2000;

const docsKey = (userId: string | null) => ["documents", userId] as const;

export function useDocumentsQuery(userId: string | null) {
  return useQuery<DocumentRow[]>({
    queryKey: docsKey(userId),
    queryFn: () => documentsApi.list(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  });
}

export function useCreateDoc(userId: string | null) {
  const qc = useQueryClient();
  return useMutation<DocumentRow, Error, DocPatch>({
    mutationFn: (input) => {
      if (!userId) throw new Error("not_authed");
      return documentsApi.create(userId, input);
    },
    onSuccess: (row) => {
      qc.setQueryData<DocumentRow[]>(docsKey(userId), (prev) => [...(prev ?? []), row]);
    },
  });
}

export function useDeleteDoc(userId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => {
      if (!userId) throw new Error("not_authed");
      return documentsApi.remove(userId, id);
    },
    onSuccess: (_void, id) => {
      qc.setQueryData<DocumentRow[]>(docsKey(userId), (prev) =>
        (prev ?? []).filter((d) => d.id !== id),
      );
    },
  });
}

/**
 * Debounced PATCH for a single doc. Returns:
 *  - schedule(patch): merges into a pending patch, restarts the 2 s timer.
 *  - flush(): force-sends any pending patch immediately. Returns a Promise.
 *  - getState/subscribe: external store hooks for "Saving…" / "idle".
 */
export function useUpdateDoc(userId: string | null, docId: string | null) {
  const qc = useQueryClient();
  const pending = useRef<DocPatch>({});
  const timer = useRef<number | null>(null);
  const inflight = useRef(0);
  const stateRef = useRef<"idle" | "saving">("idle");
  const subscribers = useRef(new Set<() => void>());

  const notify = () => {
    for (const cb of subscribers.current) cb();
  };

  const setState = (s: "idle" | "saving") => {
    if (stateRef.current === s) return;
    stateRef.current = s;
    notify();
  };

  const send = useCallback(async () => {
    if (!userId || !docId) return;
    if (Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    inflight.current += 1;
    setState("saving");
    try {
      const row = await documentsApi.update(userId, docId, patch);
      qc.setQueryData<DocumentRow[]>(docsKey(userId), (prev) =>
        (prev ?? []).map((d) => (d.id === row.id ? row : d)),
      );
    } finally {
      inflight.current -= 1;
      const stillBusy = timer.current !== null || inflight.current > 0;
      setState(stillBusy ? "saving" : "idle");
    }
  }, [qc, userId, docId]);

  const schedule = useCallback(
    (patch: DocPatch) => {
      if (!userId || !docId) return;
      pending.current = { ...pending.current, ...patch };
      setState("saving");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        void send();
      }, SAVE_DEBOUNCE_MS);
    },
    [userId, docId, send],
  );

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    await send();
  }, [send]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const subscribe = useCallback((cb: () => void) => {
    subscribers.current.add(cb);
    return () => subscribers.current.delete(cb);
  }, []);

  return { schedule, flush, getState: () => stateRef.current, subscribe };
}
