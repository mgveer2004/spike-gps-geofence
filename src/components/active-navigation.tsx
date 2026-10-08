import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DivertButton } from '@/components/divert-button';
import { DivertModal } from '@/components/divert-modal';
import { ExitDebugPanel } from '@/components/exit-debug-panel';
import { ExitModal } from '@/components/exit-modal';
import { DORMANT_SILENCE_MS } from '@/geofence/config';
import { useVisitTracker } from '@/hooks/use-visit-tracker';
import type { DivertReason, DivertSnapshot, ExitAnswer, Stop, VisitStatus } from '@/types/geofence';

/** Status badge look per status. DORMANT is amber: still on-site, but GPS has gone quiet. */
const STATUS_BADGES: Record<VisitStatus, { label: string; background: string; text: string }> = {
  PLANNED: { label: 'PLANNED', background: '#EFE6CC', text: '#5B4A1E' },
  ARRIVED: { label: 'ARRIVED', background: '#D1FAE5', text: '#065F46' },
  DORMANT: { label: 'GPS SILENT / ON-SITE', background: '#FCD97D', text: '#8A4B08' },
  AWAITING_FORM: { label: 'AWAITING FORM', background: '#DBEAFE', text: '#1E40AF' },
};

export type VisitResult = {
  stop: Stop;
  answer: ExitAnswer;
  /** Epoch ms of the GPS fix that confirmed the exit. */
  exitTimestamp: number;
};

export type DivertResult = {
  stop: Stop;
  /** Frozen at the moment Divert was tapped (context, distance evidence, arrival time). */
  snapshot: DivertSnapshot;
  reason: DivertReason;
  /** Raw note text; the save step trims it and enforces it for REMOTE. */
  note: string;
};

type Props = {
  target: Stop;
  /** Called when the MR submits the exit form. Reject to keep the modal open (e.g. save failed). */
  onSubmit: (result: VisitResult) => Promise<void>;
  /** Called when the MR submits the Divert form. Reject to keep the modal open (e.g. save failed). */
  onDivert: (result: DivertResult) => Promise<void>;
};

/** Map + live status for ONE target doctor. Mount with key={target.id}. */
export function ActiveNavigation({ target, onSubmit, onDivert }: Props) {
  const { machine, gpsError, startDivert, cancelDivert } = useVisitTracker(target);
  const [submitting, setSubmitting] = useState(false);
  // Non-null exactly while the Divert modal is open. It is the frozen copy of what we knew at the tap.
  const [divertSnapshot, setDivertSnapshot] = useState<DivertSnapshot | null>(null);
  const [divertSubmitting, setDivertSubmitting] = useState(false);

  const badge = STATUS_BADGES[machine.status];
  const distanceText = machine.distanceM === null ? '--' : `${Math.round(machine.distanceM)} m`;
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

  function handleDivertPress() {
    // Already on the exit path (the button is hidden there too), or a divert is already open.
    if (machine.status === 'AWAITING_FORM' || divertSnapshot !== null) return;

    // Classify ONCE, right now. DORMANT is still on-site. The reason list never re-evaluates afterwards.
    const onSite = machine.status === 'ARRIVED' || machine.status === 'DORMANT';
    const snapshot: DivertSnapshot = {
      context: onSite ? 'ON_SITE' : 'REMOTE',
      distanceM: machine.distanceM,
      fixTimestamp: machine.lastFix?.timestamp ?? null,
      fixAccuracyM: machine.lastFix?.accuracy ?? null,
      arrivedAt: onSite ? machine.arrivedAt : null,
    };

    // Freeze the exit vote first, in the same tap, before the modal can even render. After this, the
    // machine refuses every status change until the divert is cancelled or the screen unmounts.
    startDivert();
    setDivertSnapshot(snapshot);
  }

  function handleDivertCancel() {
    if (divertSubmitting) return;
    setDivertSnapshot(null);
    cancelDivert(); // resumes the vote with the window exactly as it was at the tap
  }

  async function handleDivertSubmit(reason: DivertReason, note: string) {
    if (divertSubmitting || divertSnapshot === null) return;
    setDivertSubmitting(true);
    try {
      await onDivert({ stop: target, snapshot: divertSnapshot, reason, note });
      // On success the parent moves to the next doctor and this component unmounts. The freeze is
      // deliberately NOT lifted: this tracker is finished with.
    } catch (e) {
      setDivertSubmitting(false);
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error while saving the divert.');
    }
  }

  return (
    <View style={styles.container}>
      {/*
        Map area: takes all the space above the status card. The map is a layer inside it, and the
        debug panel and Divert button float over the map. Because the card sits BELOW this area (not on
        top of the map), Google's logo / legal text is never covered and the Divert button always
        rides just above the card's top-right corner, however tall the card gets.
      */}
      <View style={styles.mapArea}>
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

        {/* Debug overlay now lives at the top of the map; the right gap keeps the native location button usable. */}
        <SafeAreaView style={styles.debugWrap} edges={['top']} pointerEvents="none">
          <ExitDebugPanel machine={machine} />
        </SafeAreaView>

        <DivertButton status={machine.status} onPress={handleDivertPress} />
      </View>

      {/* Bottom status card (Google Maps style bottom sheet). Its safe-area padding keeps text off the home indicator. */}
      <SafeAreaView style={styles.card} edges={['bottom']}>
        <View style={styles.cardHandle} />

        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>HEADING TO</Text>
            <Text style={styles.doctorName} numberOfLines={1}>
              {target.doctor_name}
            </Text>
          </View>
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

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Distance</Text>
            <Text style={styles.statValueLarge}>{distanceText}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>GPS accuracy</Text>
            <Text style={styles.statValue}>{accuracyText}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Fixes</Text>
            <Text style={styles.statValue}>{machine.fixCount}</Text>
          </View>
        </View>

        {gpsError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Location tracking problem</Text>
            <Text style={styles.error}>{gpsError}</Text>
          </View>
        ) : null}
      </SafeAreaView>

      {divertSnapshot ? (
        <DivertModal
          doctorName={target.doctor_name}
          snapshot={divertSnapshot}
          submitting={divertSubmitting}
          onSubmit={(reason, note) => void handleDivertSubmit(reason, note)}
          onCancel={handleDivertCancel}
        />
      ) : null}

      {/* Stays status-driven. The reducer never enters AWAITING_FORM during a divert, so this cannot stack on the Divert modal. */}
      <ExitModal
        visible={machine.status === 'AWAITING_FORM'}
        doctorName={target.doctor_name}
        submitting={submitting}
        onSubmit={(answer) => void handleSubmit(answer)}
      />
    </View>
  );
}

// Warm cream & amber palette for the status card.
const CREAM = '#FFF8E7';
const AMBER_BORDER = '#F2D98A';
const INK = '#3B2F0B';
const INK_SOFT = '#7A6A3A';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  mapArea: { flex: 1 },
  debugWrap: { position: 'absolute', top: 0, left: 12, right: 68, paddingTop: 8 },

  card: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 3,
    borderTopColor: '#F5B301',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  cardHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AMBER_BORDER,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: INK_SOFT },
  doctorName: { fontSize: 20, fontWeight: '800', color: INK },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, flexShrink: 1 },
  badgeText: { fontSize: 12, fontWeight: '800' },

  dormantHint: {
    fontSize: 12,
    color: '#8A4B08',
    backgroundColor: '#FFF1C2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF6',
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    borderRadius: 16,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: AMBER_BORDER },
  statLabel: { fontSize: 11, fontWeight: '600', color: INK_SOFT },
  statValueLarge: { fontSize: 22, fontWeight: '800', color: INK },
  statValue: { fontSize: 16, fontWeight: '700', color: INK },

  errorBox: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FDE8EA',
    borderWidth: 1,
    borderColor: '#B00020',
  },
  errorTitle: { fontSize: 12, fontWeight: '800', color: '#B00020' },
  error: { fontSize: 12, color: '#B00020' },
});
