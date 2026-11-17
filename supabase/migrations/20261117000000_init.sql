-- Riffly initial schema.
-- Design notes:
--  * Songs are private to their owner, so "favourite" is a column, not a join table.
--  * Chord segments are stored as JSONB on the analysis: they are always read and written
--    as a whole (~50–400 segments), so one row avoids hundreds of inserts per analysis.
--  * User corrections are rows keyed by (analysis_id, start_time) so they survive re-reads
--    and are merged over the machine estimate on the client.
--  * Every table has RLS; the API forwards the user's JWT so policies apply to it too.

create extension if not exists "pgcrypto";

-- Profiles mirror auth.users (email lives in auth.users; never duplicate credentials).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  preferred_instrument text not null default 'guitar',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create type public.analysis_status as enum ('uploaded', 'queued', 'processing', 'completed', 'failed');

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  artist text check (char_length(artist) <= 200),
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  audio_storage_path text not null,
  duration real,
  is_favourite boolean not null default false,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Retention: audio may be purged after inactivity while keeping the analysis.
  audio_deleted_at timestamptz
);
create index songs_user_created_idx on public.songs (user_id, created_at desc);
create index songs_user_favourite_idx on public.songs (user_id) where is_favourite;

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  status public.analysis_status not null default 'queued',
  error text,
  model_version text,
  detected_key text,
  key_confidence real,
  estimated_bpm real,
  bpm_confidence real,
  progression text[] not null default '{}',
  chord_segments jsonb not null default '[]'::jsonb,
  beats real[] not null default '{}',
  waveform real[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index analyses_song_created_idx on public.analyses (song_id, created_at desc);
create index analyses_active_idx on public.analyses (status) where status in ('queued', 'processing');

create table public.chord_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  start_time real not null check (start_time >= 0),
  original_label text not null,
  corrected_label text not null check (char_length(corrected_label) <= 16),
  created_at timestamptz not null default now(),
  unique (analysis_id, start_time)
);
create index chord_corrections_user_idx on public.chord_corrections (user_id);

create table public.saved_progressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  song_id uuid references public.songs (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  chords text[] not null check (array_length(chords, 1) between 1 and 64),
  created_at timestamptz not null default now()
);
create index saved_progressions_user_idx on public.saved_progressions (user_id, created_at desc);

create table public.tunings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  instrument text not null default 'guitar',
  tuning_name text not null check (char_length(tuning_name) between 1 and 60),
  -- Scientific pitch notation, lowest string first, e.g. {E2,A2,D3,G3,B3,E4}
  tuning_notes text[] not null check (array_length(tuning_notes, 1) between 1 and 12),
  created_at timestamptz not null default now()
);
create index tunings_user_idx on public.tunings (user_id);

-- updated_at maintenance
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger songs_touch before update on public.songs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.analyses enable row level security;
alter table public.chord_corrections enable row level security;
alter table public.saved_progressions enable row level security;
alter table public.tunings enable row level security;

create policy "own profile" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own songs" on public.songs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Users can read analyses of their songs; only the service role (analysis worker) writes.
create policy "read own analyses" on public.analyses for select using (
  exists (select 1 from public.songs s where s.id = song_id and s.user_id = (select auth.uid()))
);

create policy "own corrections" on public.chord_corrections
  for all using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.analyses a join public.songs s on s.id = a.song_id
      where a.id = analysis_id and s.user_id = (select auth.uid())
    )
  );

create policy "own progressions" on public.saved_progressions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own tunings" on public.tunings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- Storage
-- Private bucket; objects live under "<user_id>/<song_id>.<ext>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('songs', 'songs', false, 52428800, array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4'])
on conflict (id) do nothing;

create policy "read own audio" on storage.objects for select
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "upload own audio" on storage.objects for insert
  with check (bucket_id = 'songs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own audio" on storage.objects for delete
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = (select auth.uid())::text);
