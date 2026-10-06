import type { GpsFix, VisitStatus } from '../types/geofence';
import {
  DORMANT_SILENCE_MS,
  EXIT_MAX_ACCURACY_M,
  EXIT_MIN_VALID_FIXES,
  EXIT_WINDOW_SIZE,
} from './config';
import { haversineMeters } from './haversine';

/** The doctor we are currently heading to / visiting. */
export type GeofenceTarget = {
  latitude: number;
  longitude: number;
  radiusM: number;
};

/** One fix seen while ARRIVED / DORMANT, with the verdict the protocol reached about it. */
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
  /** Latest usable fix, accurate or not (null until the first one). Used for the live distance display only. */
  lastFix: GpsFix | null;
  /**
   * Timestamp (epoch ms) of the latest fix that passed the accuracy filter, once on-site.
   * This, NOT lastFix, drives silence detection: weak 100 m cell-tower pings in a basement
   * keep arriving but must not keep the MR from going DORMANT. Null until ARRIVED.
   */
  lastAcceptedFixTimestamp: number | null;
  /** Haversine distance in meters from the latest fix to the target. */
  distanceM: number | null;
  /** Number of fixes processed so far (debug). */
  fixCount: number;
  /**
   * Exit-confirmation rolling window: ONLY fixes that passed the accuracy filter,
   * newest last, at most EXIT_WINDOW_SIZE long. Only used while ARRIVED / DORMANT.
   * It is kept untouched across a DORMANT spell: stale "inside" votes can only make an exit
   * harder, which is the safe direction against false exits.
   */
  window: FixLogEntry[];
  /** Debug log of the last 10 fixes seen while ARRIVED, including the discarded ones. */
  recent: FixLogEntry[];
  /** Timestamp (epoch ms) of the fix that confirmed the exit. Null until AWAITING_FORM. */
  exitTimestamp: number | null;
  /** Clock time (epoch ms) at which silence was detected. Non-null only while DORMANT. */
  dormantSince: number | null;
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
    lastAcceptedFixTimestamp: null,
    distanceM: null,
    fixCount: 0,
    window: [],
    recent: [],
    exitTimestamp: null,
    dormantSince: null,
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
 * Pure state machine step for a GPS fix. Feed it one fix, get the next state.
 *
 * RULE 1 (entry):  PLANNED -> ARRIVED on the first usable fix that is below the radius AND passes the
 *                  accuracy filter (a single inaccurate scatter jump must not fake an arrival).
 * RULE 2 (exit):   ARRIVED -> AWAITING_FORM when the majority vote over the rolling window says
 *                  the MR is more than the radius away. If the vote swings back inside, nothing happens
 *                  (the state silently stays ARRIVED).
 * DORMANT (wake):  an ACCEPTED (accurate) fix while DORMANT means real GPS is back. It is processed like
 *                  an ARRIVED fix (it joins the vote window, and may even confirm the exit); if the exit
 *                  is not confirmed, the status returns to ARRIVED. Inaccurate fixes do not wake the
 *                  machine, otherwise it would flap between ARRIVED and DORMANT on weak signals.
 * AWAITING_FORM is terminal for this target: the screen must be re-mounted for the next doctor.
 */
export function reduceFix(state: MachineState, fix: GpsFix, target: GeofenceTarget): MachineState {
  if (!isUsableFix(fix)) return state;

  const distanceM = haversineMeters(fix.latitude, fix.longitude, target.latitude, target.longitude);
  const next: MachineState = { ...state, lastFix: fix, distanceM, fixCount: state.fixCount + 1 };

  if (state.status === 'PLANNED') {
    if (distanceM < target.radiusM && passesAccuracyFilter(fix)) {
      return {
        ...next,
        status: 'ARRIVED',
        window: [],
        recent: [],
        lastAcceptedFixTimestamp: fix.timestamp,
        dormantSince: null,
      };
    }
    return next;
  }

  if (state.status === 'ARRIVED' || state.status === 'DORMANT') {
    const entry: FixLogEntry = {
      fix,
      distanceM,
      accepted: passesAccuracyFilter(fix),
      outside: distanceM > target.radiusM,
    };
    const recent = [...state.recent, entry].slice(-RECENT_LOG_SIZE);
    const window = entry.accepted ? [...state.window, entry].slice(-EXIT_WINDOW_SIZE) : state.window;
    const lastAcceptedFixTimestamp = entry.accepted ? fix.timestamp : state.lastAcceptedFixTimestamp;

    if (summarizeVote(window).exitConfirmed) {
      return {
        ...next,
        status: 'AWAITING_FORM',
        window,
        recent,
        lastAcceptedFixTimestamp,
        exitTimestamp: fix.timestamp,
        dormantSince: null,
      };
    }

    // Only an accepted fix proves GPS is really back, so only it wakes DORMANT.
    // An inaccurate fix leaves DORMANT (and its dormantSince) untouched; ARRIVED simply stays ARRIVED.
    if (state.status === 'DORMANT' && !entry.accepted) {
      return { ...next, window, recent, lastAcceptedFixTimestamp };
    }
    return { ...next, status: 'ARRIVED', window, recent, lastAcceptedFixTimestamp, dormantSince: null };
  }

  // AWAITING_FORM: keep the live distance updating, but never change status.
  return next;
}

/**
 * Pure state machine step for the passing of time (silence detection).
 *
 * ARRIVED -> DORMANT when no ACCEPTED (accurate) fix has arrived for DORMANT_SILENCE_MS, measured as
 * `now - lastAcceptedFixTimestamp`. Inaccurate fixes (e.g. 100 m cell-tower pings in a basement)
 * do not count as signal. Only ARRIVED can go dormant: PLANNED has nothing to protect,
 * and AWAITING_FORM is already past the visit. Returns the SAME state object when nothing changes,
 * so a periodic tick never causes a re-render.
 *
 * @param now Current epoch milliseconds (injected so the function stays pure and testable).
 */
export function reduceTick(state: MachineState, now: number): MachineState {
  if (state.status !== 'ARRIVED' || state.lastAcceptedFixTimestamp === null) return state;
  if (now - state.lastAcceptedFixTimestamp < DORMANT_SILENCE_MS) return state;
  return { ...state, status: 'DORMANT', dormantSince: now };
}
