-- DRAVYA SPIKE - one-time database setup
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query > Run.
--
-- Creates:
--   1) test_route_stops        — dummy doctors the phone reads
--   2) test_visit_submissions  — where the phone pushes offline-saved visit forms
--
-- IMPORTANT: replace the latitude/longitude values in the INSERT below with REAL
-- places near you (get them from Google Maps: long-press a spot, tap the numbers
-- shown at the top to copy "latitude, longitude").

create table if not exists public.test_route_stops (
  id uuid primary key default gen_random_uuid(),
  doctor_name text not null,
  latitude numeric not null,
  longitude numeric not null,
  geofence_radius_m numeric not null default 50
);

-- Spike-only: allow the public anon key to READ the dummy table.
alter table public.test_route_stops enable row level security;

drop policy if exists "spike anon read stops" on public.test_route_stops;
create policy "spike anon read stops"
  on public.test_route_stops
  for select
  to anon
  using (true);

-- Dummy data (only inserts if the table is empty, so re-running is safe).
insert into public.test_route_stops (doctor_name, latitude, longitude, geofence_radius_m)
select v.doctor_name, v.latitude, v.longitude, v.geofence_radius_m
from (
  values
    ('Dr. Test One', 12.971600, 77.594600, 50),   -- TODO: replace with a real spot
    ('Dr. Test Two', 12.972600, 77.595600, 50)    -- TODO: replace with a real spot
) as v(doctor_name, latitude, longitude, geofence_radius_m)
where not exists (select 1 from public.test_route_stops);

-- -----------------------------------------------------------------------------
-- Offline-sync destination. `client_uuid` is generated ON THE PHONE and is the
-- primary key, so pushing the same record twice can never create a duplicate.
-- -----------------------------------------------------------------------------
create table if not exists public.test_visit_submissions (
  client_uuid uuid primary key,
  payload_type text not null,
  visit_data jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.test_visit_submissions enable row level security;

drop policy if exists "spike anon insert submissions" on public.test_visit_submissions;
create policy "spike anon insert submissions"
  on public.test_visit_submissions
  for insert
  to anon
  with check (true);

drop policy if exists "spike anon read submissions" on public.test_visit_submissions;
create policy "spike anon read submissions"
  on public.test_visit_submissions
  for select
  to anon
  using (true);
