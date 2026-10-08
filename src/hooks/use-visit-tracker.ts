import * as Location from 'expo-location';
import { useCallback, useEffect, useReducer, useState } from 'react';

import {
  DORMANT_CHECK_INTERVAL_MS,
  LOCATION_DISTANCE_INTERVAL_M,
  LOCATION_TIME_INTERVAL_MS,
  MAX_FIX_AGE_MS,
} from '@/geofence/config';
import {
  createInitialState,
  reduceCancelDivert,
  reduceFix,
  reduceStartDivert,
  reduceTick,
} from '@/geofence/state-machine';
import type { GeofenceTarget, MachineState } from '@/geofence/state-machine';
import type { GpsFix, Stop } from '@/types/geofence';

type Action =
  | { type: 'FIX'; fix: GpsFix; target: GeofenceTarget }
  | { type: 'TICK'; now: number }
  | { type: 'START_DIVERT' }
  | { type: 'CANCEL_DIVERT' };

function reducer(state: MachineState, action: Action): MachineState {
  switch (action.type) {
    case 'FIX':
      return reduceFix(state, action.fix, action.target);
    case 'TICK':
      return reduceTick(state, action.now);
    case 'START_DIVERT':
      return reduceStartDivert(state);
    case 'CANCEL_DIVERT':
      return reduceCancelDivert(state);
  }
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
 *   Pacing is a 5 s Android time interval plus a small distance interval, never continuous polling.
 * - Feeds every fresh fix into the pure geofence state machine.
 * - Runs a lightweight clock tick so the state machine can detect GPS silence (ARRIVED -> DORMANT)
 *   from timestamps. A DORMANT status wakes up by itself when the next fix arrives.
 * - Exposes `startDivert` / `cancelDivert`. While a divert is open the reducer freezes the exit vote and the
 *   silence clock; the GPS subscription itself keeps running so the live distance stays fresh.
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
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_TIME_INTERVAL_MS, // Android: at most one update per 5 s
        distanceInterval: LOCATION_DISTANCE_INTERVAL_M, // iOS (and Android): minimum movement in meters
      },
      (loc) => {
        // Ignore stale cached positions the OS may hand us first.
        if (Date.now() - loc.timestamp > MAX_FIX_AGE_MS) return;
        setGpsError(null); // fixes are flowing again, so any earlier runtime error is resolved
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

  // Silence detection: silence means no fixes, so a fix callback can never notice it. A plain
  // interval hands the current time to the state machine, which compares it with the last fix's
  // timestamp. If JS timers are paused (e.g. app backgrounded), the next tick after resume still
  // sees the full gap because the decision is timestamp-based, not tick-count-based.
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), DORMANT_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Same dispatch queue as the GPS callback, so any fix delivered after startDivert() already sees the freeze.
  const startDivert = useCallback(() => dispatch({ type: 'START_DIVERT' }), []);
  const cancelDivert = useCallback(() => dispatch({ type: 'CANCEL_DIVERT' }), []);

  return { machine, gpsError, startDivert, cancelDivert };
}
