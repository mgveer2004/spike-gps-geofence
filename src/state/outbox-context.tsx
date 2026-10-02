import NetInfo from '@react-native-community/netinfo';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { enqueueVisit, listOutbox } from '@/outbox/outbox';
import type { SyncResult } from '@/outbox/sync';
import { syncPending } from '@/outbox/sync';
import type { OutboxRow, VisitData } from '@/types/outbox';

const AUTO_SYNC_INTERVAL_MS = 30_000;

type OutboxContextValue = {
  rows: OutboxRow[];
  pendingCount: number;
  syncing: boolean;
  lastSync: SyncResult | null;
  storageError: string | null;
  /** Saves locally as PENDING first, then tries a background push. Throws only if the LOCAL save fails. */
  saveVisit: (visitData: VisitData) => Promise<void>;
  /** Pushes all PENDING rows to Supabase (also used by the "Sync Now" button). */
  syncNow: () => Promise<void>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

export function OutboxProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listOutbox());
      setStorageError(null);
    } catch (e) {
      setStorageError(e instanceof Error ? e.message : 'Could not read the local outbox.');
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncPending();
      setLastSync(result);
    } finally {
      await refresh();
      setSyncing(false);
    }
  }, [refresh]);

  const saveVisit = useCallback(
    async (visitData: VisitData) => {
      // 1) Local first. If this throws, the caller keeps the form open and nothing is lost.
      await enqueueVisit(visitData);
      await refresh();
      // 2) Only now try the network, without making the user wait for it.
      void syncNow();
    },
    [refresh, syncNow],
  );

  // Load whatever is already stored on the phone (survives app restarts), then try to sync it.
  useEffect(() => {
    let cancelled = false;
    listOutbox()
      .then((stored) => {
        if (cancelled) return;
        setRows(stored);
        void syncNow();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStorageError(e instanceof Error ? e.message : 'Could not read the local outbox.');
      });
    return () => {
      cancelled = true;
    };
  }, [syncNow]);

  // Retry when the phone regains internet, and every 30 s as a safety net.
  useEffect(() => {
    let wasOnline: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online && wasOnline === false) void syncNow();
      wasOnline = online;
    });
    const timer = setInterval(() => void syncNow(), AUTO_SYNC_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [syncNow]);

  const pendingCount = useMemo(() => rows.filter((r) => r.sync_status === 'PENDING').length, [rows]);

  const value = useMemo(
    () => ({ rows, pendingCount, syncing, lastSync, storageError, saveVisit, syncNow }),
    [rows, pendingCount, syncing, lastSync, storageError, saveVisit, syncNow],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext);
  if (!ctx) {
    // Fallback stub to prevent crashing on boot
    return {
      rows: [],
      pendingCount: 0,
      syncing: false,
      lastSync: null,
      storageError: 'Outbox context not initialized',
      saveVisit: async () => {},
      syncNow: async () => {},
    };
  }
  return ctx;
}

