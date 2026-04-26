import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
    console.log("[save-debug] send entered", {
      userId,
      docId,
      pending: pending.current,
    });
    if (!userId || !docId) return;
    if (Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    inflight.current += 1;
    setState("saving");
    try {
      console.log("[save-debug] about to fetch", { userId, docId, patch });
      try {
        const row = await documentsApi.update(userId, docId, patch);
        console.log("[save-debug] fetch succeeded", { rowId: row.id });
        qc.setQueryData<DocumentRow[]>(docsKey(userId), (prev) =>
          (prev ?? []).map((d) => (d.id === row.id ? row : d)),
        );
      } catch (err) {
        console.error("[save-debug] send caught error", err);
        throw err;
      }
    } finally {
      inflight.current -= 1;
      const stillBusy = timer.current !== null || inflight.current > 0;
      setState(stillBusy ? "saving" : "idle");
    }
  }, [qc, userId, docId]);

  const schedule = useCallback(
    (patch: DocPatch) => {
      console.log("[save-debug] schedule called", {
        userId,
        docId,
        patchKeys: Object.keys(patch),
      });
      if (!userId || !docId) return;
      pending.current = { ...pending.current, ...patch };
      setState("saving");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        console.log("[save-debug] 2s timer fired, calling send");
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

  // When docId or userId changes, flush any pending patch against the
  // previous identity *before* the next render's `send` closure rebinds.
  // The cleanup captures the `send` from the render that set this effect,
  // so it sends with the previous (docId, userId).
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      void send();
    },
    [docId, userId, send],
  );

  const subscribe = useCallback((cb: () => void) => {
    subscribers.current.add(cb);
    return () => subscribers.current.delete(cb);
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  // Memoize the returned object so consumers can safely use `[updater]` as
  // an effect dep without re-firing every render. The functions inside are
  // already stable useCallbacks; we just preserve identity at this layer too.
  return useMemo(
    () => ({ schedule, flush, getState, subscribe }),
    [schedule, flush, getState, subscribe],
  );
}
