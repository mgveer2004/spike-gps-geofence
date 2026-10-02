import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { VisitResult } from '../../components/active-navigation';
import { ActiveNavigation } from '../../components/active-navigation';
import { OutboxPanel } from '../../components/outbox-panel';
import { useForegroundPermission } from '../../hooks/use-foreground-permission';
import { useOutbox } from '../../state/outbox-context';
import { useRoute } from '../../state/route-context';

function goToRouteList() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/' as Href);
}

export default function NavigateScreen() {
  const { stops, loading } = useRoute();
  const { saveVisit } = useOutbox();
  const permission = useForegroundPermission();

  // Index of the doctor we are currently heading to. Moves to the next doctor after each submitted form.
  const [activeIndex, setActiveIndex] = useState(0);
  const target = stops[activeIndex];

  useEffect(() => {
    if (!loading && stops.length === 0) {
      goToRouteList();
    }
  }, [loading, stops.length]);

  async function handleVisitSubmitted(result: VisitResult) {
    // RULE 3: save to the local outbox FIRST (as PENDING). This throws if the local save fails,
    // which keeps the form open. The network push happens afterwards, in the background.
    await saveVisit({
      doctor_id: result.stop.id,
      doctor_name: result.stop.doctor_name,
      exit_timestamp: new Date(result.exitTimestamp).toISOString(),
      form_answer: result.answer,
    });
    setActiveIndex((i) => i + 1);
  }

  if (loading && stops.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.body}>Loading doctors...</Text>
      </View>
    );
  }

  if (stops.length > 0 && activeIndex >= stops.length) {
    return (
      <ScrollView contentContainerStyle={styles.completeContent}>
        <Text style={styles.title}>Route complete</Text>
        <Text style={styles.body}>All {stops.length} doctors have been visited.</Text>
        <Pressable style={styles.button} onPress={goToRouteList}>
          <Text style={styles.buttonText}>Back to route</Text>
        </Pressable>
        <OutboxPanel />
      </ScrollView>
    );
  }

  if (!target) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.body}>Returning to route list...</Text>
      </View>
    );
  }

  if (permission.status === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.body}>Waiting for location permission...</Text>
      </View>
    );
  }

  if (permission.status === 'denied') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Location permission needed</Text>
        <Text style={styles.body}>
          Dravya needs your location while the app is open to detect when you arrive at a doctor.
        </Text>
        {permission.canAskAgain ? (
          <Pressable style={styles.button} onPress={permission.retry}>
            <Text style={styles.buttonText}>Allow location</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.body}>
              Permission was denied. Enable Location for this app in your phone Settings, then come back.
            </Text>
            <Pressable style={styles.button} onPress={() => void Linking.openSettings()}>
              <Text style={styles.buttonText}>Open Settings</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return <ActiveNavigation key={target.id} target={target} onSubmit={handleVisitSubmitted} />;
}

const styles = StyleSheet.create({
  completeContent: { padding: 24, gap: 14, alignItems: 'stretch' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  body: { fontSize: 15, color: '#555', textAlign: 'center' },
  button: { backgroundColor: '#0A7CFF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
