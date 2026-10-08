/** A row of the remote Supabase table `test_route_stops`. */
export type Stop = {
  id: string;
  doctor_name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
};

/**
 * The visit lifecycle. Default is PLANNED.
 *
 * Main path: PLANNED -> ARRIVED -> AWAITING_FORM.
 * DORMANT is a client-side side state of ARRIVED: the MR is still considered on-site but GPS has gone
 * silent (e.g. basement). It is never persisted: it is not stored in the outbox or sent to Supabase.
 */
export type VisitStatus = 'PLANNED' | 'ARRIVED' | 'DORMANT' | 'AWAITING_FORM';

/** A single GPS reading, reduced to what the geofence logic needs. */
export type GpsFix = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters (null if the device did not report it). */
  accuracy: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
};

export type ExitAnswer = 'YES' | 'NO_MISSED' | 'WILL_COME_BACK';

// ---------- Context-Aware Divert ----------

/**
 * Where the MR is when they tap Divert. Decided ONCE at tap time and never re-evaluated while the
 * modal is open. DORMANT counts as ON_SITE (it is a sub-state of ARRIVED); DORMANT itself is never
 * part of any divert payload.
 */
export type DivertContext = 'ON_SITE' | 'REMOTE';

/** Reasons offered while the MR is inside the geofence (ARRIVED / DORMANT). */
export type OnSiteDivertReason = 'LONG_QUEUE' | 'DOCTOR_IN_SURGERY' | 'CLINIC_CLOSED';

/** Reasons offered while the MR is outside the geofence (PLANNED). A mandatory note is required. */
export type RemoteDivertReason = 'CALLED_AHEAD_CANCELED' | 'VEHICLE_BREAKDOWN';

export type DivertReason = OnSiteDivertReason | RemoteDivertReason;

/**
 * Everything the app knew at the exact moment Divert was tapped. The modal and the submit step use
 * these frozen values, never the live machine, so later GPS fixes cannot swap the reason list or
 * erase the distance evidence.
 */
export type DivertSnapshot = {
  context: DivertContext;
  /** Haversine distance to the clinic (m) at the tap. Null if no fix has arrived yet. */
  distanceM: number | null;
  /** Epoch ms of the fix that produced `distanceM`. Null if no fix has arrived yet. */
  fixTimestamp: number | null;
  /** Accuracy (m) of that fix, or null if unknown. */
  fixAccuracyM: number | null;
  /** Epoch ms of the PLANNED -> ARRIVED fix. Always null for REMOTE. */
  arrivedAt: number | null;
};
