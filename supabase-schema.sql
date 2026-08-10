create schema if not exists private;

create table if not exists private.vocab_sync_records (
  sync_id text primary key check (length(sync_id) = 64),
  payload jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  created_at timestamptz not null default now()
);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.vocab_sync_records from public, anon, authenticated;

create or replace function public.get_vocab_sync(p_sync_id text)
returns table(payload jsonb, updated_at bigint)
language sql
security definer
set search_path = private, pg_temp
as $$
  select record.payload, record.updated_at
  from private.vocab_sync_records as record
  where record.sync_id = p_sync_id
  limit 1;
$$;

create or replace function public.upsert_vocab_sync(p_sync_id text, p_payload jsonb)
returns table(updated_at bigint)
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  server_updated_at bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  insert into private.vocab_sync_records(sync_id, payload, updated_at)
  values (p_sync_id, p_payload, server_updated_at)
  on conflict (sync_id) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at;

  return query select server_updated_at;
end;
$$;

revoke all on function public.get_vocab_sync(text) from public;
revoke all on function public.upsert_vocab_sync(text, jsonb) from public;
grant execute on function public.get_vocab_sync(text) to anon, authenticated;
grant execute on function public.upsert_vocab_sync(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
