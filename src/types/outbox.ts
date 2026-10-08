import type { DivertContext, DivertReason, ExitAnswer } from './geofence';

export type SyncStatus = 'PENDING' | 'SYNCED';

export type PayloadType = 'GEOFENCE_EXIT_FORM';

/** Payload type of the Context-Aware Divert row. Kept apart from `PayloadType` (the real outbox) while divert is mocked. */
export type DivertPayloadType = 'VISIT_DIVERT';

/** The JSON stored in `visit_data`. */
export type VisitData = {
  doctor_id: string;
  doctor_name: string;
  /** ISO-8601 time of the GPS fix that confirmed the geofence exit. */
  exit_timestamp: string;
  /** The dummy form answer. */
  form_answer: ExitAnswer;
};

/** One row of the local `local_sync_outbox` table. */
export type OutboxRow = {
  client_uuid: string;
  payload_type: PayloadType;
  visit_data: VisitData;
  sync_status: SyncStatus;
  /** Epoch ms when it was saved on the device. */
  created_at: number;
};

/** The JSON stored in `visit_data` of a `VISIT_DIVERT` row. Never contains DORMANT. */
export type DivertVisitData = {
  doctor_id: string;
  doctor_name: string;
  /** Outcome of the divert. This is the payload's outcome only, never a map status or a `test_route_stops` column. */
  outcome: 'PENDING_REVISIT';
  /** DORMANT is stored as ON_SITE. */
  context: DivertContext;
  reason: DivertReason;
  /** Trimmed. Required for REMOTE, optional for ON_SITE. */
  note: string | null;
  /** Haversine distance to the clinic at the moment Divert was TAPPED (not at submit). */
  distance_from_clinic_m: number;
  /** ISO-8601 time of the GPS fix that produced `distance_from_clinic_m`. */
  fix_timestamp: string;
  fix_accuracy_m: number | null;
  /** ISO-8601 time of the PLANNED -> ARRIVED fix. Null for REMOTE. */
  arrived_at: string | null;
  /** ISO-8601 time the divert was submitted. */
  diverted_at: string;
  /** diverted_at minus arrived_at, in ms. Null for REMOTE. */
  duration_on_site_ms: number | null;
};

/** One `local_sync_outbox`-shaped row for a divert. Mocked in memory for now (no SQLite, no Supabase). */
export type DivertOutboxRow = {
  client_uuid: string;
  payload_type: DivertPayloadType;
  visit_data: DivertVisitData;
  sync_status: SyncStatus;
  /** Epoch ms when it was saved on the device. */
  created_at: number;
};
