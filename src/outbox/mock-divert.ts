import * as Crypto from 'expo-crypto';

import type { DivertContext, DivertReason, DivertSnapshot } from '@/types/geofence';
import type { DivertOutboxRow } from '@/types/outbox';

/**
 * Which context each reason belongs to. Typed as a full Record so adding a reason to `DivertReason`
 * fails the typecheck until it is classified here. Used to reject a reason that does not match the
 * context frozen at tap time.
 */
export const REASON_CONTEXT: Record<DivertReason, DivertContext> = {
  LONG_QUEUE: 'ON_SITE',
  DOCTOR_IN_SURGERY: 'ON_SITE',
  CLINIC_CLOSED: 'ON_SITE',
  CALLED_AHEAD_CANCELED: 'REMOTE',
  VEHICLE_BREAKDOWN: 'REMOTE',
};

export type DivertInput = {
  doctorId: string;
  doctorName: string;
  /** Frozen at the moment Divert was tapped. */
  snapshot: DivertSnapshot;
  reason: DivertReason;
  /** Raw note text; trimmed here. Mandatory for REMOTE. */
  note: string;
};

/**
 * Builds the `VISIT_DIVERT` row. Pure apart from the optional `now` / `clientUuid` defaults, so it can be
 * tested by injecting both.
 *
 * - Distance, fix time and fix accuracy come from the snapshot (taken at the TAP), never recomputed.
 * - Duration on site is `now - arrivedAt`, computed at submit. Always null for REMOTE.
 * - Throws on anything that would weaken the anti-abuse evidence (REMOTE with no note, no distance,
 *   reason that does not match the context). Callers treat a throw as "keep the modal open".
 */
export function buildDivertRow(
  input: DivertInput,
  now: number = Date.now(),
  clientUuid: string = Crypto.randomUUID(),
): DivertOutboxRow {
  const { snapshot, reason } = input;

  if (REASON_CONTEXT[reason] !== snapshot.context) {
    throw new Error(`Reason ${reason} is not valid for a ${snapshot.context} divert.`);
  }

  const note = input.note.trim();
  if (snapshot.context === 'REMOTE' && note.length === 0) {
    throw new Error('A note is required when diverting from outside the clinic.');
  }

  if (snapshot.distanceM === null || snapshot.fixTimestamp === null) {
    throw new Error('No GPS distance was captured yet, so the divert cannot be recorded.');
  }

  const onSite = snapshot.context === 'ON_SITE';
  if (onSite && snapshot.arrivedAt === null) {
    throw new Error('On-site divert is missing its arrival time.');
  }
  // REMOTE never records arrival data, even if a caller passed some.
  const arrivedAt = onSite ? snapshot.arrivedAt : null;

  return {
    client_uuid: clientUuid,
    payload_type: 'VISIT_DIVERT',
    sync_status: 'PENDING',
    created_at: now,
    visit_data: {
      doctor_id: input.doctorId,
      doctor_name: input.doctorName,
      outcome: 'PENDING_REVISIT',
      context: snapshot.context,
      reason,
      note: note.length > 0 ? note : null,
      distance_from_clinic_m: snapshot.distanceM,
      fix_timestamp: new Date(snapshot.fixTimestamp).toISOString(),
      fix_accuracy_m: snapshot.fixAccuracyM,
      arrived_at: arrivedAt === null ? null : new Date(arrivedAt).toISOString(),
      diverted_at: new Date(now).toISOString(),
      duration_on_site_ms: arrivedAt === null ? null : Math.max(0, now - arrivedAt),
    },
  };
}

/** In-memory stand-in for `local_sync_outbox` while divert is mocked. Lost on app restart by design. */
const mockDivertOutbox: DivertOutboxRow[] = [];

/**
 * MOCK of "save the divert to the local outbox first". Builds the row, keeps it in memory, logs it and
 * resolves with it. Rejects (like a real failed SQLite write would) when the input is invalid.
 * No SQLite write and no Supabase push happen here.
 * TODO: replace the body with a real SQLite insert (as `enqueueVisit` does) when divert is un-mocked.
 */
export async function saveDivertMock(input: DivertInput): Promise<DivertOutboxRow> {
  const row = buildDivertRow(input);
  mockDivertOutbox.push(row);
  console.log('[mock-divert] saved to in-memory outbox:', JSON.stringify(row, null, 2));
  return row;
}

/** Read-only copy of the mocked rows, newest last (debug / tests). */
export function getMockDivertOutbox(): readonly DivertOutboxRow[] {
  return [...mockDivertOutbox];
}
