# DRAVYA — SPIKE-SPECIFIC TRD (Geofence & Offline Sync)

**Status:** Isolated Technical Spike
**Goal:** Validate the physical foreground GPS tracking, Haversine proximity math, the Exit-Confirmation Protocol, and the offline outbox pattern. 
**Rule:** Do NOT implement Express.js, Next.js, or complex RBAC. This is a frontend-heavy mobile prototype connecting directly to a dummy Supabase table.

## 1. Mobile Application Stack (The Client)
- **Framework:** React Native via Expo (Latest LTS / SDK 57)
- **Language:** TypeScript
- **UI Components:** Standard React Native components. No need for complex UI libraries for this spike. Keep the UI clean, readable, and focused on debugging.
- **Mapping:** `react-native-maps` (using Google Maps provider). Used strictly for rendering the blue dot (MR) and target pins (Clinics).
- **Location Sensor:** `expo-location`. 
  - **Constraint:** Use FOREGROUND polling ONLY (`watchPositionAsync`). Do NOT use `startLocationUpdatesAsync` or Expo TaskManager background tasks for this spike.

## 2. Database & Data Fetching (The Dummy Backend)
- **Database Provider:** Supabase (PostgreSQL)
- **Client Library:** `@supabase/supabase-js`
- **Connection Method:** The Expo app will connect DIRECTLY to Supabase using the `anon` key. (Note: In the final production app, this will route through an Express API, but for this spike, direct connection is authorized).
- **Dummy Table:** `test_route_stops` (id, doctor_name, latitude, longitude, geofence_radius_m).

## 3. Distance Math & Geofence Engine
- **No Paid APIs:** NEVER call Google Geocoding or Google Distance Matrix APIs.
- **Math Engine:** Calculate distance between the MR's live coordinates and the target clinic using the **Haversine formula** executed locally in standard JavaScript/TypeScript.
- **Geofence Radius:** Target is 50 meters (or driven by `geofence_radius_m` from the database).

## 4. The Geofence State Machine & Exit Protocol
State transitions must flow strictly as: `PLANNED` → `ARRIVED` → `AWAITING_FORM`.

- **Entry (PLANNED → ARRIVED):** 
  - Fires immediately on the first `watchPositionAsync` fix that is < 50m from the target.
- **Exit (ARRIVED → AWAITING_FORM):** 
  - **The GPS Exit-Confirmation Protocol:** Must run entirely on-device. Maintain a rolling array of the last 5 to 10 GPS fixes.
  - **Accuracy Filter:** Ignore/discard any fix where `accuracy` is > 20 meters.
  - **Majority Vote:** Trigger the exit ONLY if a *majority* of the valid fixes in the array are > 50m away from the target. Unanimous agreement is not required.
  - **Reset:** If the majority swings back to < 50m before firing, silently stay in `ARRIVED`.

## 5. Offline-First Sync (The Outbox Pattern)
- **Local Storage:** Use `expo-sqlite` (or `AsyncStorage` if simpler for the spike) to simulate the local outbox.
- **Flow:** When the state hits `AWAITING_FORM` and a dummy form is submitted, the record MUST be written to the local storage first with `sync_status: 'PENDING'`. 
- **Sync:** A separate background hook or button should periodically check the local storage and push any `PENDING` records to Supabase, then mark them as `SYNCED` locally.

## 6. What NOT to Build
- Do not build a Login / Authentication screen.
- Do not build complex Role-Based Access Control (RBAC).
- Do not write any Express server code or Drizzle ORM schemas.