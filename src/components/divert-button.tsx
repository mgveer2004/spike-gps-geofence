import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet } from 'react-native';

import type { VisitStatus } from '@/types/geofence';

const SIZE = 56;

type Props = {
  /** Live visit status. The button is hidden once the visit is already on the exit path. */
  status: VisitStatus;
  onPress: () => void;
};

/**
 * Always-visible circular Divert action (PLANNED, ARRIVED and DORMANT), icon only.
 * Hidden only in AWAITING_FORM: that visit is already on its way to the exit form.
 *
 * It positions itself in the bottom-right corner of its PARENT, so render it inside the map area that
 * sits directly above the status card: it then floats just above the card's top-right edge, like the
 * action buttons on the Google Maps bottom sheet.
 */
export function DivertButton({ status, onPress }: Props) {
  if (status === 'AWAITING_FORM') return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Divert this visit"
      hitSlop={8}
      onPress={onPress}>
      <MaterialIcons name="alt-route" size={28} color="#3B2F0B" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5B301',
    borderWidth: 2,
    borderColor: '#FFF8E7',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
