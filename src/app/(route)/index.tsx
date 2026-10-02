import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OutboxPanel } from '../../components/outbox-panel';
import { useRoute } from '../../state/route-context';
import type { Stop } from '../../types/geofence';

function StopRow({ stop, index }: { stop: Stop; index: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {index + 1}. {stop.doctor_name}
      </Text>
      <Text style={styles.cardMeta}>
        Lat {stop.latitude.toFixed(5)}, Lng {stop.longitude.toFixed(5)}
      </Text>
      <Text style={styles.cardMeta}>Geofence radius: {stop.geofence_radius_m} m</Text>
    </View>
  );
}

export default function RouteListScreen() {
  const { stops, loading, error, reload } = useRoute();
  const canStart = stops.length > 0 && !loading;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {error ? (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Could not load doctors</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void reload()}>
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
          </View>
          <OutboxPanel />
        </ScrollView>
      ) : loading && stops.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>Loading doctors from Supabase...</Text>
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(s) => s.id}
          renderItem={({ item, index }) => <StopRow stop={item} index={index} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
          ListEmptyComponent={
            <Text style={styles.hint}>No doctors found. Did you run supabase/setup.sql?</Text>
          }
          ListFooterComponent={<OutboxPanel />}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, !canStart && styles.disabled]}
          disabled={!canStart}
          onPress={() => router.push('/navigate')}>
          <Text style={styles.primaryButtonText}>Start Navigation</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  listContent: { padding: 16, gap: 12, flexGrow: 1 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  cardMeta: { fontSize: 14, color: '#555' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  hint: { fontSize: 14, color: '#666', textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#B00020' },
  errorText: { fontSize: 14, color: '#444', textAlign: 'center' },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#CCC', backgroundColor: '#FFF' },
  primaryButton: { backgroundColor: '#0A7CFF', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: '#0A7CFF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  secondaryButtonText: { color: '#0A7CFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
