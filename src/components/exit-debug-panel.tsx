import { StyleSheet, Text, View } from 'react-native';

import { EXIT_MIN_VALID_FIXES } from '@/geofence/config';
import { summarizeVote } from '@/geofence/state-machine';
import type { MachineState } from '@/geofence/state-machine';

/** Shows WHY the exit protocol decided what it decided. Only relevant while ARRIVED / AWAITING_FORM. */
export function ExitDebugPanel({ machine }: { machine: MachineState }) {
  if (machine.status === 'PLANNED') return null;

  const vote = summarizeVote(machine.window);
  // Newest first, so the latest fix is at the top.
  const rows = [...machine.recent].reverse();

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.header}>
        Exit vote: {vote.outsideCount} outside / {vote.insideCount} inside of {vote.validCount} valid
      </Text>
      <Text style={styles.subHeader}>
        Needs a majority outside and at least {EXIT_MIN_VALID_FIXES} valid fixes
      </Text>
      {rows.length === 0 ? <Text style={styles.row}>Waiting for fixes...</Text> : null}
      {rows.map((e, i) => (
        <Text key={`${e.fix.timestamp}-${i}`} style={[styles.row, !e.accepted && styles.discarded]}>
          {e.outside ? 'OUT' : 'IN '} {Math.round(e.distanceM).toString().padStart(4)} m | acc{' '}
          {e.fix.accuracy === null ? '--' : Math.round(e.fix.accuracy)} m | {e.accepted ? 'kept' : 'DISCARDED'}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 10,
    gap: 1,
  },
  header: { fontSize: 13, fontWeight: '700', color: '#111' },
  subHeader: { fontSize: 11, color: '#666', marginBottom: 4 },
  row: { fontSize: 12, color: '#222', fontFamily: 'monospace' },
  discarded: { color: '#B00020' },
});
