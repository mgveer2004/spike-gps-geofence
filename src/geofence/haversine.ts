const EARTH_RADIUS_M = 6_371_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in METERS between two lat/lng points.
 * Plain JavaScript Haversine formula. Runs fully on-device, no network or Google APIs.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  // Clamp guards against tiny floating point overshoot above 1.
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_M * c;
}
