import * as Location from 'expo-location';
import { useEffect, useReducer, useState } from 'react';

import { MAX_FIX_AGE_MS } from '@/geofence/config';
import { createInitialState, reduceFix } from '@/geofence/state-machine';
import type { GeofenceTarget, MachineState } from '@/geofence/state-machine';
import type { GpsFix, Stop } from '@/types/geofence';

type Action = { type: 'FIX'; fix: GpsFix; target: GeofenceTarget };

function reducer(state: MachineState, action: Action): MachineState {
  return reduceFix(state, action.fix, action.target);
}

function toFix(loc: Location.LocationObject): GpsFix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? null,
    timestamp: loc.timestamp,
  };
}

/**
 * Foreground GPS tracking for ONE target doctor.
 * - Subscribes with `watchPositionAsync` on mount, unsubscribes on unmount (no background tasks).
 * - Feeds every fresh fix into the pure geofence state machine.
 * Mount it with `key={stop.id}` so a new target starts from a clean PLANNED state.
 */
export function useVisitTracker(stop: Stop) {
  const [machine, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const { latitude, longitude, geofence_radius_m } = stop;

  useEffect(() => {
    const target: GeofenceTarget = { latitude, longitude, radiusM: geofence_radius_m };
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000, // Android: at most one update per second
        distanceInterval: 1, // iOS: update when moved at least 1 m
      },
      (loc) => {
        // Ignore stale cached positions the OS may hand us first.
        if (Date.now() - loc.timestamp > MAX_FIX_AGE_MS) return;
        dispatch({ type: 'FIX', fix: toFix(loc), target });
      },
      (reason) => setGpsError(reason),
    )
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      .catch((e: unknown) => {
        if (!cancelled) setGpsError(e instanceof Error ? e.message : 'Could not start GPS.');
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [latitude, longitude, geofence_radius_m]);

  return { machine, gpsError };
}
