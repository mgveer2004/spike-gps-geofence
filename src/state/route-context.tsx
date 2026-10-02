import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchStops } from '@/lib/stops';
import type { Stop } from '@/types/geofence';

type RouteContextValue = {
  stops: Stop[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Runs the fetch. State is only updated after the network call finishes.
  const load = useCallback(async () => {
    try {
      const rows = await fetchStops();
      setStops(rows);
      setError(null);
    } catch (e) {
      setStops([]);
      setError(e instanceof Error ? e.message : 'Unknown error while loading doctors.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Used by pull-to-refresh and Retry.
  const reload = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  // First load (`loading` already starts as true). State is set inside promise callbacks only.
  useEffect(() => {
    let cancelled = false;
    fetchStops()
      .then((rows) => {
        if (cancelled) return;
        setStops(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStops([]);
        setError(e instanceof Error ? e.message : 'Unknown error while loading doctors.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ stops, loading, error, reload }), [stops, loading, error, reload]);

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used inside <RouteProvider>');
  return ctx;
}