import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExitAnswer } from '@/types/geofence';

const OPTIONS: { value: ExitAnswer; label: string }[] = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO_MISSED', label: 'No (Missed)' },
  { value: 'WILL_COME_BACK', label: 'I will come back' },
];

type Props = {
  visible: boolean;
  doctorName: string;
  submitting: boolean;
  onSubmit: (answer: ExitAnswer) => void;
};

/** Shown automatically when the Exit-Confirmation Protocol confirms the MR has left. Cannot be dismissed without submitting. */
export function ExitModal({ visible, doctorName, submitting, onSubmit }: Props) {
  const [selected, setSelected] = useState<ExitAnswer | null>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Geofence Exit Confirmed. Did you meet the doctor?</Text>
          <Text style={styles.subtitle}>{doctorName}</Text>

          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelected(opt.value)}>
                <View style={[styles.radio, isSelected && styles.radioSelected]} />
                <Text style={styles.optionText}>{opt.label}</Text>
              </Pressable>
            );
          })}

          <Pressable
            style={[styles.submit, (!selected || submitting) && styles.disabled]}
            disabled={!selected || submitting}
            onPress={() => selected && onSubmit(selected)}>
            <Text style={styles.submitText}>{submitting ? 'Saving...' : 'Submit'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', backgroundColor: '#FFF', borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D0D4DA',
    borderRadius: 12,
    padding: 14,
  },
  optionSelected: { borderColor: '#0A7CFF', backgroundColor: '#EAF3FF' },
  optionText: { fontSize: 16, color: '#111' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9AA0A8' },
  radioSelected: { borderColor: '#0A7CFF', backgroundColor: '#0A7CFF' },
  submit: { backgroundColor: '#0A7CFF', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
