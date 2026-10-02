# DRAVYA — SPIKE UI & APP FLOW

This document defines the exact User Interface flow for the `spike-gps-geofence` isolated test. Do not build tabs, navigation drawers, or settings screens.

## Screen 1: The Route List (State 1 & 2)
- **UI:** A simple list showing the 2 dummy doctors fetched from the Supabase `test_route_stops` table.
- **Action:** A prominent "Start Navigation" button at the bottom.
- **Rule:** GPS tracking does NOT start until this button is pressed.

## Screen 2: Active Navigation & Map (State 3 & 4)
- **UI:** The screen transitions to show a Google Map (`react-native-maps`).
  - Render the MR's current live location as a blue dot.
  - Render the active target Doctor as a pin with a 50m translucent circle around it.
  - Show a status text at the top: `Status: PLANNED` and `Distance: X meters`.
- **Action (Entry):** When the Haversine distance drops below 50m, update the UI text to `Status: ARRIVED`.

## The Exit & Failsafe Modal (State 5 & 6)
- **Action (Exit):** When the background rolling window (the Exit-Confirmation Protocol) confirms the MR is >50m away...
- **UI:** Automatically pop up a Modal over the map.
  - **Text:** "Geofence Exit Confirmed. Did you meet the doctor?"
  - **Options:** 
    1. "Yes"
    2. "No (Missed)"
    3. "I will come back"
- **Submit Action:** 
  - When the user selects an option and clicks Submit, save this result to the offline SQLite/AsyncStorage outbox (do not push to Supabase yet).
  - Dismiss the modal.
  - Automatically set Doctor 2 as the new active target and switch the status back to `PLANNED`.