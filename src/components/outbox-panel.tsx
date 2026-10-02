import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useOutbox } from '../state/outbox-context';

/** Debug view of the local outbox with a manual "Sync Now" button. */
export function OutboxPanel() {
  const { rows, pendingCount, syncing, lastSync, storageError, syncNow } = useOutbox();

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Local outbox (debug)</Text>
      <Text style={styles.summary}>
        {rows.length} saved on this phone | {pendingCount} PENDING | {rows.length - pendingCount} SYNCED
      </Text>

      <Pressable
        style={[styles.button, (syncing || pendingCount === 0) && styles.disabled]}
        disabled={syncing || pendingCount === 0}
        onPress={() => void syncNow()}>
        <Text style={styles.buttonText}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
      </Pressable>

      {lastSync ? (
        <Text style={[styles.status, lastSync.error ? styles.bad : styles.good]}>
          {lastSync.error
            ? `Last sync failed: ${lastSync.error}`
            : lastSync.attempted === 0
              ? 'Nothing to sync.'
              : `Last sync OK: ${lastSync.synced} record(s) pushed.`}
        </Text>
      ) : null}
      {storageError ? <Text style={[styles.status, styles.bad]}>Storage error: {storageError}</Text> : null}

      {rows.length === 0 ? <Text style={styles.empty}>No records yet.</Text> : null}
      {rows.map((r) => (
        <View key={r.client_uuid} style={styles.row}>
          <Text style={[styles.badge, r.sync_status === 'PENDING' ? styles.pending : styles.synced]}>
            {r.sync_status}
          </Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>
              {r.visit_data.doctor_name}: {r.visit_data.form_answer}
            </Text>
            <Text style={styles.rowMeta}>exit {r.visit_data.exit_timestamp}</Text>
            <Text style={styles.rowMeta}>id {r.client_uuid}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 8, marginTop: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  summary: { fontSize: 13, color: '#444' },
  button: { backgroundColor: '#0A7CFF', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.4 },
  status: { fontSize: 13 },
  good: { color: '#0B7A3B' },
  bad: { color: '#B00020' },
  empty: { fontSize: 13, color: '#777' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD', paddingTop: 8 },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  rowMeta: { fontSize: 11, color: '#666', fontFamily: 'monospace' },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  pending: { backgroundColor: '#FFF1CC', color: '#8A5A00' },
  synced: { backgroundColor: '#D9F5E3', color: '#0B7A3B' },
});
