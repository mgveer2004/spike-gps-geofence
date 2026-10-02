import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { OutboxRow, PayloadType, SyncStatus, VisitData } from '@/types/outbox';

/** Raw shape of a row as stored in SQLite (visit_data is a JSON string). */
type StoredRow = {
  client_uuid: string;
  payload_type: string;
  visit_data: string;
  sync_status: string;
  created_at: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('dravya_spike.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_sync_outbox (
      client_uuid  TEXT PRIMARY KEY NOT NULL,
      payload_type TEXT NOT NULL,
      visit_data   TEXT NOT NULL,
      sync_status  TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'SYNCED')),
      created_at   INTEGER NOT NULL
    );
  `);
  return db;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((e) => {
      dbPromise = null; // allow a retry next time
      throw e;
    });
  }
  return dbPromise;
}

function fromStored(row: StoredRow): OutboxRow {
  return {
    client_uuid: row.client_uuid,
    payload_type: row.payload_type as PayloadType,
    visit_data: JSON.parse(row.visit_data) as VisitData,
    sync_status: row.sync_status as SyncStatus,
    created_at: row.created_at,
  };
}

/**
 * RULE 3: the visit is ALWAYS written to the local outbox first, as PENDING.
 * Returns the saved row. Throws if the local write fails.
 */
export async function enqueueVisit(visitData: VisitData): Promise<OutboxRow> {
  const db = await getDb();
  const row: OutboxRow = {
    client_uuid: Crypto.randomUUID(),
    payload_type: 'GEOFENCE_EXIT_FORM',
    visit_data: visitData,
    sync_status: 'PENDING',
    created_at: Date.now(),
  };
  await db.runAsync(
    'INSERT INTO local_sync_outbox (client_uuid, payload_type, visit_data, sync_status, created_at) VALUES (?, ?, ?, ?, ?)',
    row.client_uuid,
    row.payload_type,
    JSON.stringify(row.visit_data),
    row.sync_status,
    row.created_at,
  );
  return row;
}

/** All outbox rows, newest first. */
export async function listOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StoredRow>('SELECT * FROM local_sync_outbox ORDER BY created_at DESC');
  return rows.map(fromStored);
}

/** Only PENDING rows, oldest first (replay order). */
export async function listPending(): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StoredRow>(
    "SELECT * FROM local_sync_outbox WHERE sync_status = 'PENDING' ORDER BY created_at ASC",
  );
  return rows.map(fromStored);
}

export async function markSynced(clientUuids: string[]): Promise<void> {
  if (clientUuids.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of clientUuids) {
      await db.runAsync("UPDATE local_sync_outbox SET sync_status = 'SYNCED' WHERE client_uuid = ?", id);
    }
  });
}
