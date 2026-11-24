begin;

alter table public.topic_candidates
  add column if not exists scheduled_for timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists expires_at timestamptz;

-- Existing approved topics were already public before this lifecycle was added.
-- Preserve them and give each a 30-calendar-day Seoul-time end date.
update public.topic_candidates
set published_at = coalesce(published_at, decided_at, created_at),
    expires_at = coalesce(
      expires_at,
      date_trunc('day', (coalesce(decided_at, created_at) at time zone 'Asia/Seoul') + interval '30 days') at time zone 'Asia/Seoul'
    )
where status = 'approved';

update public.topic_candidates
set archived_at = coalesce(archived_at, decided_at, created_at)
where status = 'archived' and archived_at is null;

create index if not exists topic_candidates_lifecycle_due_idx
  on public.topic_candidates(status, scheduled_for, expires_at);

create table if not exists public.topic_schedule_runs (
  slot_key text primary key,
  status text not null check (status in ('running', 'completed', 'skipped', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  attempts integer not null default 1,
  result jsonb not null default '{}'::jsonb,
  error_message text
);

alter table public.topic_schedule_runs enable row level security;
revoke all on public.topic_schedule_runs from anon, authenticated;
grant all on public.topic_schedule_runs to service_role;

create or replace function public.claim_topic_schedule_run(p_slot_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed_key text;
begin
  insert into public.topic_schedule_runs(slot_key, status, started_at, attempts)
  values (p_slot_key, 'running', now(), 1)
  on conflict (slot_key) do update
    set status = 'running', started_at = now(), finished_at = null,
        attempts = topic_schedule_runs.attempts + 1, error_message = null
    where (
        (topic_schedule_runs.status = 'failed'
          and topic_schedule_runs.attempts < 3
          and topic_schedule_runs.started_at < now() - interval '10 minutes')
        or (topic_schedule_runs.status = 'skipped'
          and topic_schedule_runs.attempts < 10
          and topic_schedule_runs.started_at < now() - interval '1 minute')
      )
  returning slot_key into claimed_key;
  return claimed_key is not null;
end;
$$;

revoke all on function public.claim_topic_schedule_run(text) from public, anon, authenticated;
grant execute on function public.claim_topic_schedule_run(text) to service_role;

create or replace function public.admin_approve_topic(
  p_topic_id uuid,
  p_actor uuid,
  p_first_publish_day date,
  p_note text default '',
  p_automatic boolean default false
)
returns table(id uuid, batch_id text, title text, category text, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.topic_candidates%rowtype;
  publish_day date := p_first_publish_day;
  publish_time timestamptz;
  slot_found boolean := false;
  audit_action text := case when p_automatic then 'topic_auto_approved' else 'topic_admin_approved' end;
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then
    raise exception 'admin_required';
  end if;
  perform pg_advisory_xact_lock(hashtext('siseon:topic-approval'));
  select * into candidate from public.topic_candidates where topic_candidates.id = p_topic_id and status = 'pending' for update;
  if not found then raise exception 'pending_topic_not_found'; end if;

  if exists (
    select 1 from public.topic_candidates existing
    where existing.id <> candidate.id
      and existing.status in ('approved', 'archived')
      and lower(regexp_replace(existing.title, '[[:space:][:punct:]]', '', 'g'))
          = lower(regexp_replace(candidate.title, '[[:space:][:punct:]]', '', 'g'))
  ) then
    raise exception 'duplicate_topic';
  end if;

  for attempt in 1..370 loop
    if not exists (
      select 1 from public.topic_candidates existing
      where existing.status = 'approved'
        and (
          (existing.scheduled_for >= (publish_day::timestamp at time zone 'Asia/Seoul')
            and existing.scheduled_for < ((publish_day + 1)::timestamp at time zone 'Asia/Seoul'))
          or (existing.published_at >= (publish_day::timestamp at time zone 'Asia/Seoul')
            and existing.published_at < ((publish_day + 1)::timestamp at time zone 'Asia/Seoul'))
        )
    ) then exit; end if;
    publish_day := publish_day + 1;
  end loop;
  slot_found := not exists (
    select 1 from public.topic_candidates existing
    where existing.status = 'approved'
      and (
        (existing.scheduled_for >= (publish_day::timestamp at time zone 'Asia/Seoul')
          and existing.scheduled_for < ((publish_day + 1)::timestamp at time zone 'Asia/Seoul'))
        or (existing.published_at >= (publish_day::timestamp at time zone 'Asia/Seoul')
          and existing.published_at < ((publish_day + 1)::timestamp at time zone 'Asia/Seoul'))
      )
  );
  if not slot_found then raise exception 'no_publication_slot_available'; end if;
  publish_time := (publish_day::timestamp + time '07:00') at time zone 'Asia/Seoul';

  update public.topic_candidates
    set status = 'approved', decided_at = now(), scheduled_for = publish_time,
        decision_note = left(coalesce(p_note, ''), 1000), updated_at = now()
    where topic_candidates.id = candidate.id;
  update public.topic_candidates
    set status = 'not_selected', decided_at = now(), decision_note = '같은 묶음에서 다른 후보가 승인됨', updated_at = now()
    where topic_candidates.batch_id = candidate.batch_id and status = 'pending' and topic_candidates.id <> candidate.id;
  insert into public.content_audit(action, content_id, actor, details)
    values (audit_action, candidate.id, p_actor, jsonb_build_object('title', candidate.title, 'category', candidate.category, 'scheduled_for', publish_time, 'note', left(coalesce(p_note, ''), 1000)));
  return query select candidate.id, candidate.batch_id, candidate.title, candidate.category, publish_time;
end;
$$;

revoke all on function public.admin_approve_topic(uuid, uuid, date, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_approve_topic(uuid, uuid, date, text, boolean) to service_role;

commit;
