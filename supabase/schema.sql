-- Nuctify Supabase schema. Idempotent: paste into the Supabase SQL editor and run (safe to re-run).
-- Jam uses Realtime broadcast/presence only (no table). Requires Realtime enabled (default).

create extension if not exists pgcrypto;

-- ============ Cloud sync (existing) ============
create table if not exists public.user_data (
  user_id    uuid not null references auth.users on delete cascade,
  data_key   text not null,
  data_value text,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_key)
);
alter table public.user_data enable row level security;
drop policy if exists "user_data owner" on public.user_data;
create policy "user_data owner" on public.user_data for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ Shared (read-only link) playlists (existing) ============
create table if not exists public.shared_playlists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tracks      jsonb not null default '[]',
  author_name text,
  created_at  timestamptz not null default now()
);
alter table public.shared_playlists enable row level security;
drop policy if exists "shared_playlists read" on public.shared_playlists;
create policy "shared_playlists read" on public.shared_playlists for select to anon, authenticated using (true);
drop policy if exists "shared_playlists insert" on public.shared_playlists;
create policy "shared_playlists insert" on public.shared_playlists for insert to anon, authenticated with check (true);

-- ============ Blend ============
create table if not exists public.taste_profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url   text,
  top_artists  jsonb not null default '[]',
  top_tracks   jsonb not null default '[]',
  updated_at   timestamptz not null default now()
);

create table if not exists public.blends (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  user_a     uuid not null default auth.uid() references auth.users on delete cascade,
  user_b     uuid references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  constraint blends_distinct_users check (user_b is null or user_a <> user_b)
);
create index if not exists blends_user_a_idx on public.blends (user_a);
create index if not exists blends_user_b_idx on public.blends (user_b);

alter table public.taste_profiles enable row level security;
alter table public.blends enable row level security;

-- Profiles: own row, or rows of users you share a (joined) blend with.
drop policy if exists "taste read own or blended" on public.taste_profiles;
create policy "taste read own or blended" on public.taste_profiles for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.blends b where b.user_b is not null and (
      (b.user_a = auth.uid() and b.user_b = taste_profiles.user_id) or
      (b.user_b = auth.uid() and b.user_a = taste_profiles.user_id))));
drop policy if exists "taste insert own" on public.taste_profiles;
create policy "taste insert own" on public.taste_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "taste update own" on public.taste_profiles;
create policy "taste update own" on public.taste_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "taste delete own" on public.taste_profiles;
create policy "taste delete own" on public.taste_profiles for delete to authenticated using (user_id = auth.uid());

drop policy if exists "blends read members" on public.blends;
create policy "blends read members" on public.blends for select to authenticated using (auth.uid() in (user_a, user_b));
drop policy if exists "blends create invite" on public.blends;
create policy "blends create invite" on public.blends for insert to authenticated with check (user_a = auth.uid() and user_b is null);
drop policy if exists "blends delete members" on public.blends;
create policy "blends delete members" on public.blends for delete to authenticated using (auth.uid() in (user_a, user_b));

-- Accept a blend invite (invites are not readable by non-members, hence security definer).
create or replace function public.join_blend(p_code text)
returns public.blends language plpgsql security definer set search_path = public as $$
declare r public.blends;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update public.blends set user_b = auth.uid()
    where code = upper(p_code) and user_b is null and user_a <> auth.uid()
    returning * into r;
  if r.id is null then
    select * into r from public.blends where code = upper(p_code) and auth.uid() in (user_a, user_b);
  end if;
  if r.id is null then raise exception 'Blend invite not found or already used'; end if;
  return r;
end $$;

-- ============ Collaborative playlists ============
create table if not exists public.collab_playlists (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  tracks     jsonb not null default '[]',   -- [{ track, addedBy: {id, name}, addedAt }]
  updated_at timestamptz not null default now()
);
create table if not exists public.collab_members (
  playlist_id  uuid not null references public.collab_playlists on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  display_name text,
  avatar_url   text,
  joined_at    timestamptz not null default now(),
  primary key (playlist_id, user_id)
);
create index if not exists collab_members_user_idx on public.collab_members (user_id);

alter table public.collab_playlists enable row level security;
alter table public.collab_members enable row level security;

create or replace function public.is_collab_member(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.collab_members where playlist_id = p_id and user_id = auth.uid());
$$;

drop policy if exists "collab read members" on public.collab_playlists;
create policy "collab read members" on public.collab_playlists for select to authenticated using (public.is_collab_member(id));
-- No direct UPDATE policy: track edits go through the atomic RPCs below.
drop policy if exists "collab rename members" on public.collab_playlists;
drop policy if exists "collab delete owner" on public.collab_playlists;
create policy "collab delete owner" on public.collab_playlists for delete to authenticated using (owner = auth.uid());

drop policy if exists "collab members read" on public.collab_members;
create policy "collab members read" on public.collab_members for select to authenticated using (public.is_collab_member(playlist_id));
drop policy if exists "collab members leave" on public.collab_members;
create policy "collab members leave" on public.collab_members for delete to authenticated using (user_id = auth.uid());

create or replace function public.create_collab(p_code text, p_name text, p_tracks jsonb, p_display_name text, p_avatar text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.collab_playlists (code, name, owner, tracks)
    values (upper(p_code), left(p_name, 200), auth.uid(), coalesce(p_tracks, '[]'::jsonb)) returning id into v_id;
  insert into public.collab_members (playlist_id, user_id, display_name, avatar_url)
    values (v_id, auth.uid(), p_display_name, p_avatar);
  return v_id;
end $$;

create or replace function public.join_collab(p_code text, p_display_name text, p_avatar text)
returns public.collab_playlists language plpgsql security definer set search_path = public as $$
declare r public.collab_playlists;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into r from public.collab_playlists where code = upper(p_code);
  if r.id is null then raise exception 'Collaborative playlist not found'; end if;
  insert into public.collab_members (playlist_id, user_id, display_name, avatar_url)
    values (r.id, auth.uid(), p_display_name, p_avatar)
    on conflict (playlist_id, user_id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return r;
end $$;

-- Invite preview (name/owner/count only) for people who haven't joined yet.
create or replace function public.preview_collab(p_code text)
returns table (name text, owner_name text, track_count int) language sql stable security definer set search_path = public as $$
  select c.name, m.display_name, jsonb_array_length(c.tracks)
  from public.collab_playlists c left join public.collab_members m on m.playlist_id = c.id and m.user_id = c.owner
  where c.code = upper(p_code);
$$;

-- Atomic add: appends entries whose track id isn't present yet (row lock => no lost updates). Returns new tracks.
create or replace function public.collab_add_tracks(p_id uuid, p_entries jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_name text;
begin
  if not public.is_collab_member(p_id) then raise exception 'Not a member'; end if;
  select display_name into v_name from public.collab_members where playlist_id = p_id and user_id = auth.uid();
  update public.collab_playlists c set
    tracks = c.tracks || coalesce((
      select jsonb_agg(jsonb_set(e, '{addedBy}', jsonb_build_object('id', auth.uid()::text, 'name', coalesce(v_name, e->'addedBy'->>'name', '')))
        order by o)
      from jsonb_array_elements(p_entries) with ordinality as a(e, o)
      where e->'track'->>'id' is not null
        and not exists (select 1 from jsonb_array_elements(p_entries) with ordinality as d(e2, o2)
                        where o2 < o and e2->'track'->>'id' = e->'track'->>'id')
        and not exists (select 1 from jsonb_array_elements(c.tracks) t where t->'track'->>'id' = e->'track'->>'id')
    ), '[]'::jsonb),
    updated_at = now()
  where c.id = p_id returning c.tracks into v;
  return v;
end $$;

create or replace function public.collab_remove_tracks(p_id uuid, p_track_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_collab_member(p_id) then raise exception 'Not a member'; end if;
  update public.collab_playlists c set
    tracks = coalesce((
      select jsonb_agg(t order by o) from jsonb_array_elements(c.tracks) with ordinality as a(t, o)
      where not (t->'track'->>'id' = any (p_track_ids))
    ), '[]'::jsonb),
    updated_at = now()
  where c.id = p_id returning c.tracks into v;
  return v;
end $$;

-- Leave; if the owner leaves, the playlist is deleted for everyone (members keep local copies).
create or replace function public.leave_collab(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.collab_playlists where id = p_id and owner = auth.uid()) then
    delete from public.collab_playlists where id = p_id;
  else
    delete from public.collab_members where playlist_id = p_id and user_id = auth.uid();
  end if;
end $$;

revoke all on function public.join_blend(text), public.create_collab(text, text, jsonb, text, text), public.join_collab(text, text, text),
  public.preview_collab(text), public.collab_add_tracks(uuid, jsonb), public.collab_remove_tracks(uuid, text[]), public.leave_collab(uuid),
  public.is_collab_member(uuid) from public, anon;
grant execute on function public.join_blend(text), public.create_collab(text, text, jsonb, text, text), public.join_collab(text, text, text),
  public.preview_collab(text), public.collab_add_tracks(uuid, jsonb), public.collab_remove_tracks(uuid, text[]), public.leave_collab(uuid),
  public.is_collab_member(uuid) to authenticated;

-- ============ Realtime ============
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'collab_playlists') then
    alter publication supabase_realtime add table public.collab_playlists;
  end if;
end $$;
