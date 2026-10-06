/** All tunable numbers of the geofence spike live here, in one place. */

/** Fixes older than this (ms) when they arrive are treated as stale cache and ignored. */
export const MAX_FIX_AGE_MS = 15_000;

/**
 * GPS subscription: Android minimum time between updates (ms). Ignored by iOS.
 * We deliberately do NOT use `distanceInterval: 0` (continuous polling): it drains the MR's battery.
 */
export const LOCATION_TIME_INTERVAL_MS = 5_000;

/**
 * GPS subscription: minimum movement in meters before an update is delivered (the iOS pacing knob,
 * also honoured by Android). Must stay above 0 for the battery reasons above.
 */
export const LOCATION_DISTANCE_INTERVAL_M = 1;

/** Exit protocol: how many of the latest fixes are kept in the rolling window (allowed range 5 to 10). */
export const EXIT_WINDOW_SIZE = 7;

/** Exit protocol: fixes with accuracy worse (larger) than this many meters are discarded. */
export const EXIT_MAX_ACCURACY_M = 20;

/**
 * Exit protocol: minimum number of VALID fixes that must be in the window before a vote is allowed.
 * Prevents firing an exit from 1 or 2 lucky fixes. Must be <= EXIT_WINDOW_SIZE.
 */
export const EXIT_MIN_VALID_FIXES = 5;

/**
 * DORMANT (basement survival): while ARRIVED, if no usable fix has arrived for this long (ms),
 * the status becomes DORMANT. Measured by timestamps (now - last fix timestamp), never by a counter.
 * Six times the Android time interval, so ordinary gaps between fixes never trigger it.
 */
export const DORMANT_SILENCE_MS = 30_000;

/**
 * How often (ms) the tracker checks the clock for silence. Fixes cannot trigger this check
 * themselves because silence means no fixes are arriving.
 */
export const DORMANT_CHECK_INTERVAL_MS = 5_000;
