import type { ExitAnswer } from './geofence';

export type SyncStatus = 'PENDING' | 'SYNCED';

export type PayloadType = 'GEOFENCE_EXIT_FORM';

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
