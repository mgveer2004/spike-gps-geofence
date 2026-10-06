import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExitDebugPanel } from '@/components/exit-debug-panel';
import { ExitModal } from '@/components/exit-modal';
import { DORMANT_SILENCE_MS } from '@/geofence/config';
import { useVisitTracker } from '@/hooks/use-visit-tracker';
import type { ExitAnswer, Stop, VisitStatus } from '@/types/geofence';

/** Banner badge look per status. DORMANT is amber: still on-site, but GPS has gone quiet. */
const STATUS_BADGES: Record<VisitStatus, { label: string; background: string; text: string }> = {
  PLANNED: { label: 'PLANNED', background: '#E5E7EB', text: '#374151' },
  ARRIVED: { label: 'ARRIVED', background: '#D1FAE5', text: '#065F46' },
  DORMANT: { label: 'GPS SILENT / ON-SITE', background: '#FDE68A', text: '#92400E' },
  AWAITING_FORM: { label: 'AWAITING FORM', background: '#DBEAFE', text: '#1E40AF' },
};

export type VisitResult = {
  stop: Stop;
  answer: ExitAnswer;
  /** Epoch ms of the GPS fix that confirmed the exit. */
  exitTimestamp: number;
};

type Props = {
  target: Stop;
  /** Called when the MR submits the exit form. Reject to keep the modal open (e.g. save failed). */
  onSubmit: (result: VisitResult) => Promise<void>;
};

/** Map + live status for ONE target doctor. Mount with key={target.id}. */
export function ActiveNavigation({ target, onSubmit }: Props) {
  const { machine, gpsError } = useVisitTracker(target);
  const [submitting, setSubmitting] = useState(false);

  const badge = STATUS_BADGES[machine.status];
  const distanceText = machine.distanceM === null ? '--' : Math.round(machine.distanceM).toString();
  const accuracy = machine.lastFix?.accuracy;
  const accuracyText = accuracy === null || accuracy === undefined ? '--' : `${Math.round(accuracy)} m`;

  async function handleSubmit(answer: ExitAnswer) {
    if (submitting || machine.exitTimestamp === null) return;
    setSubmitting(true);
    try {
      await onSubmit({ stop: target, answer, exitTimestamp: machine.exitTimestamp });
      // On success the parent switches target and this component unmounts.
    } catch (e) {
      setSubmitting(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error while saving the visit.');
    }
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        googleRenderer="LEGACY"
        loadingBackgroundColor="#E8EEF4"
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: target.latitude,
          longitude: target.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        }}>
        <Marker
          coordinate={{ latitude: target.latitude, longitude: target.longitude }}
          title={target.doctor_name}
          description={`Geofence ${target.geofence_radius_m} m`}
        />
        <Circle
          center={{ latitude: target.latitude, longitude: target.longitude }}
          radius={target.geofence_radius_m}
          strokeWidth={2}
          strokeColor="rgba(10,124,255,0.9)"
          fillColor="rgba(10,124,255,0.2)"
        />
      </MapView>

      <SafeAreaView style={styles.bannerWrap} edges={['top']} pointerEvents="none">
        <View style={styles.banner}>
          <View style={styles.statusRow}>
            <Text style={styles.bannerStatusLabel}>Status:</Text>
            <View style={[styles.badge, { backgroundColor: badge.background }]}>
              <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
            </View>
          </View>
          {machine.status === 'DORMANT' ? (
            <Text style={styles.dormantHint}>
              No accurate GPS for {Math.round(DORMANT_SILENCE_MS / 1000)} s. Still counted as on-site; it
              resumes automatically when a good fix arrives.
            </Text>
          ) : null}
          <Text style={styles.bannerDistance}>Distance: {distanceText} meters</Text>
          <Text style={styles.bannerTarget}>Target: {target.doctor_name}</Text>
          <Text style={styles.debug}>
            GPS accuracy: {accuracyText} | fixes: {machine.fixCount}
          </Text>
          {gpsError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Location tracking problem</Text>
              <Text style={styles.error}>{gpsError}</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <ExitDebugPanel machine={machine} />

      <ExitModal
        visible={machine.status === 'AWAITING_FORM'}
        doctorName={target.doctor_name}
        submitting={submitting}
        onSubmit={(answer) => void handleSubmit(answer)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 },
  banner: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    gap: 2,
    marginTop: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bannerStatusLabel: { fontSize: 18, fontWeight: '800', color: '#111' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 14, fontWeight: '800' },
  dormantHint: { fontSize: 12, color: '#92400E' },
  bannerDistance: { fontSize: 16, color: '#111' },
  bannerTarget: { fontSize: 13, color: '#666' },
  debug: { fontSize: 12, color: '#444', fontFamily: 'monospace' },
  errorBox: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FDE8EA',
    borderWidth: 1,
    borderColor: '#B00020',
  },
  errorTitle: { fontSize: 12, fontWeight: '800', color: '#B00020' },
  error: { fontSize: 12, color: '#B00020' },
});
