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
  /**
   * Divert freeze gate. While true, the Divert modal is open and the machine refuses every status
   * change: fixes only refresh lastFix / distanceM / fixCount, the vote window and exitTimestamp are
   * untouched, and clock ticks are ignored. This is NOT a visit status (VisitStatus is unchanged); the
   * real status underneath decides which reasons the modal offers. Client-side only, never persisted.
   */
  diverting: boolean;
  /**
   * Timestamp (epoch ms) of the fix that caused PLANNED -> ARRIVED. Set once on arrival and never
   * overwritten (lastAcceptedFixTimestamp keeps moving and dormantSince is the silence clock, so
   * neither can answer "how long has the MR been on-site?"). Null until ARRIVED.
   */
  arrivedAt: number | null;
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
    diverting: false,
    arrivedAt: null,
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
 * DIVERT FREEZE:  while `diverting` is true the fix may only refresh lastFix / distanceM / fixCount.
 *                  No status change, no vote-window push, no exitTimestamp. This is what stops the
 *                  Exit modal from popping up on top of the Divert modal.
 */
export function reduceFix(state: MachineState, fix: GpsFix, target: GeofenceTarget): MachineState {
  if (!isUsableFix(fix)) return state;

  const distanceM = haversineMeters(fix.latitude, fix.longitude, target.latitude, target.longitude);
  const next: MachineState = { ...state, lastFix: fix, distanceM, fixCount: state.fixCount + 1 };

  // Freeze: the OS listener keeps delivering fixes (the live distance stays fresh), but the machine
  // must not decide anything while the MR is filling in the Divert modal.
  if (state.diverting) return next;

  if (state.status === 'PLANNED') {
    if (distanceM < target.radiusM && passesAccuracyFilter(fix)) {
      return {
        ...next,
        status: 'ARRIVED',
        window: [],
        recent: [],
        lastAcceptedFixTimestamp: fix.timestamp,
        dormantSince: null,
        arrivedAt: fix.timestamp,
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
 * While `diverting` is true ticks are ignored too, so an open Divert modal cannot flip the status.
 *
 * @param now Current epoch milliseconds (injected so the function stays pure and testable).
 */
export function reduceTick(state: MachineState, now: number): MachineState {
  if (state.diverting) return state;
  if (state.status !== 'ARRIVED' || state.lastAcceptedFixTimestamp === null) return state;
  if (now - state.lastAcceptedFixTimestamp < DORMANT_SILENCE_MS) return state;
  return { ...state, status: 'DORMANT', dormantSince: now };
}

/**
 * START_DIVERT: the MR tapped Divert. Raises the freeze gate. Must be applied BEFORE the modal opens so
 * the very next GPS callback already sees `diverting === true`.
 * Ignored (same object) when already diverting, or when the status is AWAITING_FORM: that visit is
 * already on the exit path and the Divert button is hidden there.
 */
export function reduceStartDivert(state: MachineState): MachineState {
  if (state.diverting || state.status === 'AWAITING_FORM') return state;
  return { ...state, diverting: true };
}

/**
 * CANCEL_DIVERT: the MR closed the Divert modal without submitting. Lowers the gate. The vote window was
 * never touched, so the next fix and tick simply continue under the normal rules.
 * Returns the SAME object when not diverting.
 */
export function reduceCancelDivert(state: MachineState): MachineState {
  if (!state.diverting) return state;
  return { ...state, diverting: false };
}
