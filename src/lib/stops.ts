import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Stop } from '@/types/geofence';

/** Fetches the dummy route stops. Throws an Error with a readable message on failure. */
export async function fetchStops(): Promise<Stop[]> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart Expo.',
    );
  }

  const { data, error } = await supabase
    .from('test_route_stops')
    .select('id, doctor_name, latitude, longitude, geofence_radius_m')
    .order('doctor_name', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Could not load doctors from Supabase.');
  }

  // Postgres `numeric` can arrive as a string, so convert explicitly.
  return (data ?? []).map((row) => ({
    id: String(row.id),
    doctor_name: String(row.doctor_name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    geofence_radius_m: Number(row.geofence_radius_m ?? 50),
  }));
}
