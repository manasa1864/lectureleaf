-- LectureLeaf database. Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- Flow it supports:
--   sign up / sign in (Supabase Auth)  ->  profiles row is created automatically
--   Setup screen                        ->  user_settings (saved defaults) + jobs.settings (snapshot per lecture)
--   Processing                          ->  jobs (status / progress / step)
--   Results / Edit                      ->  job_frames (one row per captured frame: order, included, note)
--   Download PDF                        ->  jobs.pdf_path in the private storage bucket
--
-- The Python API writes with the service-role key (bypasses RLS). RLS below lets signed-in users
-- read their own data directly and edit the parts the UI owns (settings, frame include/note).

create extension if not exists pgcrypto;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a profile and a default settings row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

-- ───────────────────────── user_settings ─────────────────────────
-- The user's saved Setup-screen defaults. Keys match the API's Settings model.
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  settings   jsonb not null default '{
    "sensitivity": 50, "min_time_between": 30, "dupe_sensitivity": 70,
    "remove_dupes": true, "skip_transitions": true, "skip_low_quality": true,
    "page_density": "balanced", "max_pages": null,
    "pdf_style": "lecture", "pdf_page_size": "A4", "include_timestamps": true,
    "generate_key_points": true, "include_topic_headings": true, "detect_topics": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before this script ran.
insert into public.profiles (id, email, display_name)
  select id, email, split_part(email, '@', 1) from auth.users on conflict (id) do nothing;
insert into public.user_settings (user_id) select id from auth.users on conflict (user_id) do nothing;

-- ───────────────────────── jobs (one per processed lecture) ─────────────────────────
create table if not exists public.jobs (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  url         text not null,
  title       text,
  duration_s  integer,
  settings    jsonb not null default '{}'::jsonb,     -- snapshot of the settings used for this run
  status      text not null default 'queued',
  progress    integer not null default 0,              -- 0-100
  step        integer not null default 0,              -- index of the step on the Processing screen
  error       text,
  pdf_path    text,                                    -- storage path of the generated PDF
  summary     text,                                    -- AI summary of the lecture
  warning     text,                                    -- non-fatal problems (e.g. no transcript)
  transcript_path text,                                -- storage path of transcript.json
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint jobs_status_check check (status in ('queued', 'processing', 'done', 'error')),
  constraint jobs_progress_check check (progress between 0 and 100)
);

-- Frames used to live in a JSON column; they now have their own table.
alter table public.jobs drop column if exists frames;
alter table public.jobs add column if not exists updated_at timestamptz not null default now();
alter table public.jobs add column if not exists summary text;
alter table public.jobs add column if not exists warning text;
alter table public.jobs add column if not exists transcript_path text;

create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ───────────────────────── job_frames (captured moments) ─────────────────────────
create table if not exists public.job_frames (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  position     integer not null,                       -- 1-based order in the notes
  seconds      integer not null,                       -- timestamp in the lecture
  time_label   text not null,                          -- e.g. 12:43
  storage_path text not null,                          -- JPEG in the storage bucket
  included     boolean not null default true,          -- Results / Edit: keep or drop
  note         text,                                   -- Edit screen: user's own note
  heading      text,                                   -- AI topic heading for this moment
  key_points   jsonb not null default '[]'::jsonb,     -- AI key points from the transcript
  ocr_text     text,                                   -- text read off the frame itself
  created_at   timestamptz not null default now(),
  unique (job_id, position)
);

alter table public.job_frames add column if not exists heading text;
alter table public.job_frames add column if not exists ocr_text text;
alter table public.job_frames add column if not exists key_points jsonb not null default '[]'::jsonb;

create index if not exists job_frames_job_idx on public.job_frames (job_id, position);

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.jobs          enable row level security;
alter table public.job_frames    enable row level security;

drop policy if exists "users read own jobs"   on public.jobs;
drop policy if exists "profiles read own"     on public.profiles;
drop policy if exists "profiles update own"   on public.profiles;
drop policy if exists "settings read own"     on public.user_settings;
drop policy if exists "settings write own"    on public.user_settings;
drop policy if exists "jobs read own"         on public.jobs;
drop policy if exists "jobs delete own"       on public.jobs;
drop policy if exists "frames read own"       on public.job_frames;
drop policy if exists "frames update own"     on public.job_frames;

create policy "profiles read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "settings read own"   on public.user_settings for select using (auth.uid() = user_id);
create policy "settings write own"  on public.user_settings for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "jobs read own"       on public.jobs for select using (auth.uid() = user_id);
create policy "jobs delete own"     on public.jobs for delete using (auth.uid() = user_id);

create policy "frames read own"     on public.job_frames for select using (auth.uid() = user_id);
create policy "frames update own"   on public.job_frames for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────── storage ─────────────────────────
-- Private bucket; files live at <user_id>/<job_id>/frame_N.jpg and notes.pdf.
insert into storage.buckets (id, name, public) values ('lectureleaf', 'lectureleaf', false)
on conflict (id) do nothing;

drop policy if exists "users read own files"   on storage.objects;
drop policy if exists "users delete own files" on storage.objects;

create policy "users read own files" on storage.objects for select to authenticated
  using (bucket_id = 'lectureleaf' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'lectureleaf' and (storage.foldername(name))[1] = auth.uid()::text);
