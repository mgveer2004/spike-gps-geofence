-- DRAVYA SPIKE - Phase 5 setup (also included at the bottom of setup.sql)
-- If you already ran the full setup.sql, you do NOT need to run this file.
-- Run once in: Supabase Dashboard > SQL Editor > New query > Run.
--
-- Where the app pushes offline-saved visit forms.
-- `client_uuid` is generated ON THE PHONE and is the primary key, so pushing the same
-- record twice can never create a duplicate (idempotent replay).

create table if not exists public.test_visit_submissions (
  client_uuid uuid primary key,
  payload_type text not null,
  visit_data jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.test_visit_submissions enable row level security;

-- Spike-only: the public anon key may INSERT and READ (no login in this spike).
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
