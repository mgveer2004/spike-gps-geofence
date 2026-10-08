import { StyleSheet, Text, View } from 'react-native';

import { EXIT_MIN_VALID_FIXES, EXIT_WINDOW_SIZE } from '@/geofence/config';
import { summarizeVote } from '@/geofence/state-machine';
import type { MachineState } from '@/geofence/state-machine';

/** Epoch ms -> local HH:MM:SS, or '--' when there is no timestamp. */
function clock(timestamp: number | null): string {
  if (timestamp === null) return '--';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Shows WHY the geofence logic decided what it decided.
 * Only relevant once the MR is on-site: ARRIVED / DORMANT / AWAITING_FORM.
 * While a divert is open the vote is frozen (see `MachineState.diverting`); say so, so a window that
 * stops moving is not mistaken for a stuck exit.
 */
export function ExitDebugPanel({ machine }: { machine: MachineState }) {
  if (machine.status === 'PLANNED') return null;

  const vote = summarizeVote(machine.window);
  // Newest first, so the latest fix is at the top.
  const rows = [...machine.recent].reverse();
  const dormant = machine.status === 'DORMANT';

  return (
    <View
      style={[styles.panel, dormant && styles.panelDormant, machine.diverting && styles.panelPaused]}
      pointerEvents="none">
      {machine.diverting ? (
        <Text style={styles.paused}>
          VOTE PAUSED: Divert is open, so new fixes are not counted. The window below is frozen.
        </Text>
      ) : null}
      <Text style={styles.header}>
        Exit vote: {vote.outsideCount} outside / {vote.insideCount} inside of {vote.validCount} valid
      </Text>
      <Text style={styles.subHeader}>
        Needs a majority outside and at least {EXIT_MIN_VALID_FIXES} valid fixes
      </Text>
      <Text style={styles.stat}>
        Window: {machine.window.length}/{EXIT_WINDOW_SIZE} valid | exit confirmed:{' '}
        {vote.exitConfirmed ? 'YES' : 'no'}
      </Text>
      <Text style={styles.stat}>Last accepted fix: {clock(machine.lastAcceptedFixTimestamp)}</Text>
      <Text style={[styles.stat, dormant && styles.statDormant]}>
        Dormant since: {clock(machine.dormantSince)}
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
  // Positioned by the parent (top of the map area), so it never fights the bottom status card.
  panel: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 10,
    gap: 1,
  },
  panelDormant: { backgroundColor: 'rgba(254,243,199,0.97)' },
  panelPaused: { backgroundColor: 'rgba(255,237,213,0.97)' },
  paused: { fontSize: 12, fontWeight: '800', color: '#9A3412', marginBottom: 4 },
  header: { fontSize: 13, fontWeight: '700', color: '#111' },
  subHeader: { fontSize: 11, color: '#666', marginBottom: 4 },
  stat: { fontSize: 12, color: '#222', fontFamily: 'monospace' },
  statDormant: { color: '#92400E', fontWeight: '700' },
  row: { fontSize: 12, color: '#222', fontFamily: 'monospace' },
  discarded: { color: '#B00020' },
});
