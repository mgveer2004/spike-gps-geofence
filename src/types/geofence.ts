/** A row of the remote Supabase table `test_route_stops`. */
export type Stop = {
  id: string;
  doctor_name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
};

/** The visit lifecycle. Default is PLANNED. */
export type VisitStatus = 'PLANNED' | 'ARRIVED' | 'AWAITING_FORM';

/** A single GPS reading, reduced to what the geofence logic needs. */
export type GpsFix = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters (null if the device did not report it). */
  accuracy: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
};

export type ExitAnswer = 'YES' | 'NO_MISSED' | 'WILL_COME_BACK';
