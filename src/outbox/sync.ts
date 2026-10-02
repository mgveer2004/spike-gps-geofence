import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listPending, markSynced } from '@/outbox/outbox';

export type SyncResult = {
  /** How many PENDING rows we tried to push. */
  attempted: number;
  /** How many were confirmed by Supabase and marked SYNCED locally. */
  synced: number;
  /** Readable error, or null if everything worked. */
  error: string | null;
};

const SYNC_TIMEOUT_MS = 10_000;

let inFlight: Promise<SyncResult> | null = null;

async function runSync(): Promise<SyncResult> {
  let pending;
  try {
    pending = await listPending();
  } catch (e) {
    return { attempted: 0, synced: 0, error: e instanceof Error ? e.message : 'Could not read local outbox.' };
  }
  if (pending.length === 0) return { attempted: 0, synced: 0, error: null };

  if (!isSupabaseConfigured) {
    return { attempted: pending.length, synced: 0, error: 'Supabase is not configured.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    // Idempotent: client_uuid is the primary key and duplicates are ignored, so replays are safe.
    const { error } = await supabase
      .from('test_visit_submissions')
      .upsert(
        pending.map((r) => ({
          client_uuid: r.client_uuid,
          payload_type: r.payload_type,
          visit_data: r.visit_data,
        })),
        { onConflict: 'client_uuid', ignoreDuplicates: true },
      )
      .abortSignal(controller.signal);

    if (error) {
      return { attempted: pending.length, synced: 0, error: error.message || 'Supabase rejected the upload.' };
    }

    // Only after Supabase confirmed do we flip the local rows to SYNCED.
    await markSynced(pending.map((r) => r.client_uuid));
    return { attempted: pending.length, synced: pending.length, error: null };
  } catch (e) {
    const aborted = controller.signal.aborted;
    return {
      attempted: pending.length,
      synced: 0,
      error: aborted ? 'Timed out. Will retry.' : e instanceof Error ? e.message : 'Network error.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pushes every PENDING outbox row to Supabase, then marks them SYNCED locally.
 * Never throws. If a sync is already running, returns that same run (no overlapping uploads).
 */
export function syncPending(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
