-- Frequency Atlas v0.3: private per-user vault + private screenshot bucket.
-- Run in the Supabase SQL Editor in a dedicated Supabase project.
-- This migration is independent of the experimental normalized v0.2 schema.

create table if not exists public.atlas_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.atlas_vaults enable row level security;

drop policy if exists "atlas_vaults_read_own" on public.atlas_vaults;
create policy "atlas_vaults_read_own" on public.atlas_vaults
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "atlas_vaults_insert_own" on public.atlas_vaults;
create policy "atlas_vaults_insert_own" on public.atlas_vaults
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "atlas_vaults_update_own" on public.atlas_vaults;
create policy "atlas_vaults_update_own" on public.atlas_vaults
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.atlas_vaults from anon;
grant select, insert, update on public.atlas_vaults to authenticated;

-- Serialize updates so that a stale browser tab cannot overwrite newer edits.
-- Only metadata goes in JSONB; screenshot bytes go in private Storage.
create or replace function public.save_atlas_vault(
  expected_revision bigint,
  next_records jsonb
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_revision bigint;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if next_records is null or jsonb_typeof(next_records) <> 'array'
     or jsonb_array_length(next_records) > 10000
     or octet_length(next_records::text) > 15 * 1024 * 1024 then
    raise exception 'INVALID_VAULT_SIZE' using errcode = '22023';
  end if;

  insert into public.atlas_vaults (user_id) values (current_user_id)
    on conflict (user_id) do nothing;
  select revision into current_revision
    from public.atlas_vaults where user_id = current_user_id for update;
  if current_revision is distinct from expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  update public.atlas_vaults
    set records = next_records, revision = revision + 1, updated_at = now()
    where user_id = current_user_id
    returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.save_atlas_vault(bigint,jsonb) from public, anon;
grant execute on function public.save_atlas_vault(bigint,jsonb) to authenticated;

-- Strictly private bucket. Storage enforces a 10 MB/file limit and MIME allowlist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atlas-screenshots', 'atlas-screenshots', false, 10485760,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path prefix MUST equal the authenticated user ID.
-- owner_id prevents accessing an object someone else uploaded into a matching path.
drop policy if exists "atlas_storage_select_own" on storage.objects;
create policy "atlas_storage_select_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'atlas-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );
drop policy if exists "atlas_storage_insert_own" on storage.objects;
create policy "atlas_storage_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'atlas-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "atlas_storage_delete_own" on storage.objects;
create policy "atlas_storage_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'atlas-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );
