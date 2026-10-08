import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DivertReason, DivertSnapshot } from '@/types/geofence';

const ON_SITE_OPTIONS: { value: DivertReason; label: string }[] = [
  { value: 'LONG_QUEUE', label: 'Long queue' },
  { value: 'DOCTOR_IN_SURGERY', label: 'Doctor in surgery' },
  { value: 'CLINIC_CLOSED', label: 'Clinic closed' },
];

const REMOTE_OPTIONS: { value: DivertReason; label: string }[] = [
  { value: 'CALLED_AHEAD_CANCELED', label: 'Called ahead - canceled' },
  { value: 'VEHICLE_BREAKDOWN', label: 'Vehicle breakdown' },
];

type Props = {
  doctorName: string;
  /**
   * Frozen at the exact moment Divert was tapped. The reason list and the distance shown here come from
   * this, never from live GPS, so a later fix cannot swap the list or change the evidence.
   */
  snapshot: DivertSnapshot;
  submitting: boolean;
  onSubmit: (reason: DivertReason, note: string) => void;
  /** Close without submitting. The parent resumes the paused exit vote. */
  onCancel: () => void;
};

/**
 * Context-Aware Divert form. Mount it only while a divert is open (so its draft resets every time).
 * - ON_SITE (ARRIVED / DORMANT): Long queue, Doctor in surgery, Clinic closed. Note optional.
 * - REMOTE (PLANNED): Called ahead, Vehicle breakdown. Note MANDATORY: Submit stays disabled until
 *   the trimmed note is non-empty.
 * Submit is also disabled without a captured GPS distance, because a remote skip with no distance
 * would be the exploit with its evidence deleted.
 */
export function DivertModal({ doctorName, snapshot, submitting, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState<DivertReason | null>(null);
  const [note, setNote] = useState('');

  const remote = snapshot.context === 'REMOTE';
  const options = remote ? REMOTE_OPTIONS : ON_SITE_OPTIONS;
  const noteMissing = remote && note.trim().length === 0;
  const distanceMissing = snapshot.distanceM === null;
  const canSubmit = reason !== null && !noteMissing && !distanceMissing && !submitting;

  let hint: string | null = null;
  if (distanceMissing) hint = 'Waiting for a GPS fix. Close this and try again in a moment.';
  else if (reason === null) hint = 'Pick a reason to continue.';
  else if (noteMissing) hint = 'A note is required when you are not at the clinic.';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) onCancel();
      }}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{remote ? 'Divert - not at the clinic' : 'Divert - on site'}</Text>
            <Text style={styles.subtitle}>{doctorName}</Text>
            <Text style={styles.evidence}>
              {snapshot.distanceM === null
                ? 'Distance from clinic: waiting for GPS'
                : `Distance from clinic: ${Math.round(snapshot.distanceM)} m (recorded now)`}
            </Text>

            {options.map((opt) => {
              const isSelected = reason === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  disabled={submitting}
                  onPress={() => setReason(opt.value)}>
                  <View style={[styles.radio, isSelected && styles.radioSelected]} />
                  <Text style={styles.optionText}>{opt.label}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.noteLabel}>{remote ? 'Note (required)' : 'Note (optional)'}</Text>
            <TextInput
              style={[styles.noteInput, remote && noteMissing && styles.noteInputMissing]}
              value={note}
              onChangeText={setNote}
              editable={!submitting}
              multiline
              placeholder={remote ? 'e.g. Spoke to receptionist Ramesh' : 'Add details if helpful'}
              placeholderTextColor="#9AA0A8"
              textAlignVertical="top"
            />

            {hint ? <Text style={styles.hint}>{hint}</Text> : null}

            <Pressable
              style={[styles.submit, !canSubmit && styles.disabled]}
              disabled={!canSubmit}
              onPress={() => reason && onSubmit(reason, note.trim())}>
              <Text style={styles.submitText}>{submitting ? 'Saving...' : 'Submit'}</Text>
            </Pressable>
            <Pressable
              style={[styles.cancel, submitting && styles.disabled]}
              disabled={submitting}
              onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 16 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#666' },
  evidence: { fontSize: 12, color: '#444', fontFamily: 'monospace', marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D0D4DA',
    borderRadius: 12,
    padding: 14,
  },
  optionSelected: { borderColor: '#C2410C', backgroundColor: '#FFF1E8' },
  optionText: { fontSize: 16, color: '#111' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9AA0A8' },
  radioSelected: { borderColor: '#C2410C', backgroundColor: '#C2410C' },
  noteLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 4 },
  noteInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#D0D4DA',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111',
  },
  noteInputMissing: { borderColor: '#C2410C' },
  hint: { fontSize: 12, color: '#9A3412' },
  submit: { backgroundColor: '#C2410C', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cancel: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#D0D4DA' },
  cancelText: { color: '#333', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
