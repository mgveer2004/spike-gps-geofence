import type { GpsFix, VisitStatus } from '../types/geofence';
import { EXIT_MAX_ACCURACY_M, EXIT_MIN_VALID_FIXES, EXIT_WINDOW_SIZE } from './config';
import { haversineMeters } from './haversine';

/** The doctor we are currently heading to / visiting. */
export type GeofenceTarget = {
  latitude: number;
  longitude: number;
  radiusM: number;
};

/** One fix seen while ARRIVED, with the verdict the protocol reached about it. */
export type FixLogEntry = {
  fix: GpsFix;
  distanceM: number;
  /** True if the fix passed the accuracy filter (accuracy known and <= EXIT_MAX_ACCURACY_M). */
  accepted: boolean;
  /** True if the fix is farther than the radius from the target. */
  outside: boolean;
};

export type MachineState = {
  status: VisitStatus;
  /** Latest accepted fix (null until the first one). */
  lastFix: GpsFix | null;
  /** Haversine distance in meters from the latest fix to the target. */
  distanceM: number | null;
  /** Number of fixes processed so far (debug). */
  fixCount: number;
  /**
   * Exit-confirmation rolling window: ONLY fixes that passed the accuracy filter,
   * newest last, at most EXIT_WINDOW_SIZE long. Only used while ARRIVED.
   */
  window: FixLogEntry[];
  /** Debug log of the last 10 fixes seen while ARRIVED, including the discarded ones. */
  recent: FixLogEntry[];
  /** Timestamp (epoch ms) of the fix that confirmed the exit. Null until AWAITING_FORM. */
  exitTimestamp: number | null;
};

export type VoteSummary = {
  validCount: number;
  outsideCount: number;
  insideCount: number;
  /** True only if enough valid fixes exist AND strictly more than half are outside. */
  exitConfirmed: boolean;
};

const RECENT_LOG_SIZE = 10;

export function createInitialState(): MachineState {
  return {
    status: 'PLANNED',
    lastFix: null,
    distanceM: null,
    fixCount: 0,
    window: [],
    recent: [],
    exitTimestamp: null,
  };
}

/** A fix is usable if its coordinates are real numbers. */
export function isUsableFix(fix: GpsFix): boolean {
  return (
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Math.abs(fix.latitude) <= 90 &&
    Math.abs(fix.longitude) <= 180
  );
}

/** Accuracy filter: unknown accuracy or accuracy worse than the limit is discarded. */
export function passesAccuracyFilter(fix: GpsFix): boolean {
  return fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy <= EXIT_MAX_ACCURACY_M;
}

/**
 * Majority vote over the window (Rule 2).
 * - Needs at least EXIT_MIN_VALID_FIXES valid fixes before it may decide.
 * - Exit only if strictly MORE than half of the valid fixes are outside. Unanimity is not required.
 */
export function summarizeVote(window: FixLogEntry[]): VoteSummary {
  const validCount = window.length;
  const outsideCount = window.filter((e) => e.outside).length;
  const insideCount = validCount - outsideCount;
  const exitConfirmed = validCount >= EXIT_MIN_VALID_FIXES && outsideCount * 2 > validCount;
  return { validCount, outsideCount, insideCount, exitConfirmed };
}

/**
 * Pure state machine step. Feed it one GPS fix, get the next state.
 *
 * RULE 1 (entry):  PLANNED -> ARRIVED on the first usable fix whose distance is below the radius.
 * RULE 2 (exit):   ARRIVED -> AWAITING_FORM when the majority vote over the rolling window says
 *                  the MR is more than the radius away. If the vote swings back inside, nothing happens
 *                  (the state silently stays ARRIVED).
 * AWAITING_FORM is terminal for this target: the screen must be re-mounted for the next doctor.
 */
export function reduceFix(state: MachineState, fix: GpsFix, target: GeofenceTarget): MachineState {
  if (!isUsableFix(fix)) return state;

  const distanceM = haversineMeters(fix.latitude, fix.longitude, target.latitude, target.longitude);
  const next: MachineState = { ...state, lastFix: fix, distanceM, fixCount: state.fixCount + 1 };

  if (state.status === 'PLANNED') {
    return distanceM < target.radiusM ? { ...next, status: 'ARRIVED', window: [], recent: [] } : next;
  }

  if (state.status === 'ARRIVED') {
    const entry: FixLogEntry = {
      fix,
      distanceM,
      accepted: passesAccuracyFilter(fix),
      outside: distanceM > target.radiusM,
    };
    const recent = [...state.recent, entry].slice(-RECENT_LOG_SIZE);
    const window = entry.accepted ? [...state.window, entry].slice(-EXIT_WINDOW_SIZE) : state.window;

    if (summarizeVote(window).exitConfirmed) {
      return { ...next, status: 'AWAITING_FORM', window, recent, exitTimestamp: fix.timestamp };
    }
    return { ...next, window, recent };
  }

  // AWAITING_FORM: keep the live distance updating, but never change status.
  return next;
}
