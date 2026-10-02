import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export type PermissionStatus = 'checking' | 'granted' | 'denied';

/**
 * Asks for FOREGROUND ("While Using") location permission when the screen using it mounts.
 * Never asks for background permission (spike rule).
 */
export function useForegroundPermission() {
  const [status, setStatus] = useState<PermissionStatus>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync()
      .then((res) => {
        if (cancelled) return;
        setCanAskAgain(res.canAskAgain);
        setStatus(res.granted ? 'granted' : 'denied');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // If permission was denied and the user fixes it in system Settings, re-check when they return.
  useEffect(() => {
    if (status !== 'denied') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setAttempt((a) => a + 1);
    });
    return () => sub.remove();
  }, [status]);

  const retry = useCallback(() => {
    setStatus('checking');
    setAttempt((a) => a + 1);
  }, []);

  return { status, canAskAgain, retry };
}
