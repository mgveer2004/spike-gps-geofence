/** All tunable numbers of the geofence spike live here, in one place. */

/** Fixes older than this (ms) when they arrive are treated as stale cache and ignored. */
export const MAX_FIX_AGE_MS = 15_000;

/** Exit protocol: how many of the latest fixes are kept in the rolling window (allowed range 5 to 10). */
export const EXIT_WINDOW_SIZE = 7;

/** Exit protocol: fixes with accuracy worse (larger) than this many meters are discarded. */
export const EXIT_MAX_ACCURACY_M = 20;

/**
 * Exit protocol: minimum number of VALID fixes that must be in the window before a vote is allowed.
 * Prevents firing an exit from 1 or 2 lucky fixes. Must be <= EXIT_WINDOW_SIZE.
 */
export const EXIT_MIN_VALID_FIXES = 5;
