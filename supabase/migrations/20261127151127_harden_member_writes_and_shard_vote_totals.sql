set local lock_timeout = '5s';
-- Protect moderation fields while preserving the existing administrator workflows.
create or replace function private.guard_member_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  profile_status text;
  incoming jsonb := to_jsonb(new);
  previous jsonb;
  expected_status text;
begin
  if current_user not in ('anon', 'authenticated') or public.is_siseon_admin() then
    return new;
  end if;
  if TG_OP = 'UPDATE' then previous := to_jsonb(old); end if;
  if TG_TABLE_NAME = 'member_profiles' then
    if (TG_OP = 'INSERT' and (new.status <> 'active' or new.trust_level <> 'member'))
       or (TG_OP = 'UPDATE' and (new.status, new.trust_level) is distinct from (old.status, old.trust_level)) then
      raise exception using errcode = '42501', message = '운영자만 계정 상태를 변경할 수 있습니다.';
    end if;
    return new;
  end if;
  select status into profile_status from public.member_profiles where user_id = auth.uid();
  if profile_status is null or profile_status = 'suspended' then
    raise exception using errcode = '42501', message = '현재 계정으로는 참여할 수 없습니다.';
  end if;
  if incoming ? 'status' then
    expected_status := case when TG_TABLE_NAME = 'topic_suggestions' then 'pending' else 'published' end;
    if (TG_OP = 'INSERT' and incoming->>'status' is distinct from expected_status)
       or (TG_OP = 'UPDATE' and incoming->>'status' is distinct from previous->>'status') then
      raise exception using errcode = '42501', message = '운영자만 게시 상태를 변경할 수 있습니다.';
    end if;
  end if;
  if TG_OP = 'UPDATE' and
     (incoming->'id', incoming->'author_id', incoming->'topic_id', incoming->'post_id', incoming->'created_at')
       is distinct from (previous->'id', previous->'author_id', previous->'topic_id', previous->'post_id', previous->'created_at') then
    raise exception using errcode = '42501', message = '작성자, 원래 게시 위치 및 작성 시각은 변경할 수 없습니다.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['member_profiles','issue_posts','issue_comments','open_talk_posts','open_talk_comments','topic_suggestions','topic_suggestion_interests'] loop
    execute format('create trigger guard_member_writes before insert or update on public.%I for each row execute function private.guard_member_writes()', t);
  end loop;
end;
$$;
create trigger guard_member_vote before insert on public.topic_votes
for each row execute function private.guard_member_writes();

-- Prevent public forms from setting internal fields and cap submissions per hour.
create table private.public_form_windows (
  form_name text not null,
  identity text not null,
  hour_start timestamptz not null,
  submissions integer not null,
  primary key (form_name, identity, hour_start)
);
alter table private.public_form_windows enable row level security;

create function private.guard_public_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := to_jsonb(new);
  actor uuid := auth.uid();
  attempts integer;
  max_submissions integer := case when actor is null then 60 else 12 end;
begin
  if current_setting('role', true) not in ('anon','authenticated') then return new; end if;
  if payload->>'status' is distinct from 'pending' or coalesce(payload->>'admin_note','') <> ''
     or payload->>'reviewed_at' is not null or payload->>'reviewed_by' is not null or payload->>'answered_at' is not null then
    raise exception using errcode='42501', message='접수 상태는 운영자만 변경할 수 있습니다.';
  end if;
  if TG_TABLE_NAME = 'user_reports' then
    if length(btrim(new.reason)) not between 1 and 200 or length(new.details) > 4000 then
      raise exception using errcode='22023', message='신고 사유와 내용을 확인해 주세요.';
    end if;
  elsif length(btrim(new.title)) not between 1 and 200 or length(btrim(new.message)) not between 1 and 4000 then
    raise exception using errcode='22023', message='문의 제목과 내용을 확인해 주세요.';
  end if;
  new.created_at := now();
  insert into private.public_form_windows as limits values
    (TG_TABLE_NAME, coalesce(actor::text, 'public'), date_trunc('hour', now()), 1)
  on conflict (form_name, identity, hour_start) do update
    set submissions = limits.submissions + 1 where limits.submissions < max_submissions
  returning submissions into attempts;
  if attempts is null then
    raise sqlstate 'PT429' using message='접수 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  return new;
end;
$$;

create trigger guard_public_form before insert on public.user_reports for each row execute function private.guard_public_form();
create trigger guard_public_form before insert on public.user_inquiries for each row execute function private.guard_public_form();
create trigger guard_public_form before insert on public.partnership_inquiries for each row execute function private.guard_public_form();
select cron.schedule('siseon-public-form-window-cleanup', '23 * * * *',
  $$delete from private.public_form_windows where hour_start < now() - interval '1 day'$$);

revoke execute on function public.get_topic_vote_results(uuid) from public, anon;
grant execute on function public.get_topic_vote_results(uuid) to authenticated;

-- Maintain transactional, sharded counters so result reads do not scan ballots.
lock table public.topic_votes in share row exclusive mode;
create table private.topic_vote_totals (
  topic_id uuid not null,
  choice text not null,
  shard smallint not null,
  vote_count bigint not null check (vote_count >= 0),
  primary key (topic_id, choice, shard)
);
alter table private.topic_vote_totals enable row level security;

insert into private.topic_vote_totals
select topic_id, choice, (get_byte(uuid_send(id), 15) % 32)::smallint, count(*)
from public.topic_votes group by 1,2,3;

create function private.sync_topic_vote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_shard smallint;
begin
  if TG_OP = 'UPDATE' and (old.id, old.topic_id, old.choice) is not distinct from (new.id, new.topic_id, new.choice) then
    return null;
  end if;
  if TG_OP <> 'INSERT' then
    old_shard := (get_byte(uuid_send(old.id), 15) % 32)::smallint;
    update private.topic_vote_totals set vote_count=vote_count-1
      where topic_id=old.topic_id and choice=old.choice and shard=old_shard;
    delete from private.topic_vote_totals
      where topic_id=old.topic_id and choice=old.choice and shard=old_shard and vote_count=0;
  end if;
  if TG_OP <> 'DELETE' then
    insert into private.topic_vote_totals as totals values
      (new.topic_id, new.choice, (get_byte(uuid_send(new.id), 15) % 32)::smallint, 1)
    on conflict (topic_id, choice, shard) do update set vote_count=totals.vote_count+1;
  end if;
  return null;
end;
$$;
create trigger sync_topic_vote_totals after insert or delete or update of id, topic_id, choice on public.topic_votes
for each row execute function private.sync_topic_vote_totals();

create or replace function public.get_topic_vote_results(p_topic_id uuid)
returns table(choice text, vote_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or (
    not exists(select 1 from public.topic_votes v where v.topic_id=p_topic_id and v.user_id=auth.uid())
    and not public.is_topic_archived(p_topic_id)
  ) then
    raise exception 'vote_required';
  end if;
  return query select v.choice, sum(v.vote_count)::bigint
    from private.topic_vote_totals v where v.topic_id=p_topic_id group by v.choice;
end;
$$;

create or replace function public.get_archived_share_results(p_topics uuid[])
returns table(topic_id uuid, choice text, vote_count bigint)
language sql stable security definer set search_path = ''
as $$
  select t.id, v.choice, sum(v.vote_count)::bigint
  from public.topic_candidates t join private.topic_vote_totals v on v.topic_id=t.id
  where t.id in (select unnest(p_topics) limit 100)
    and t.status='archived' and t.published_at is not null
  group by t.id, v.choice
$$;

create or replace function public.record_site_visit(visitor uuid, origin_channel text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.site_daily_visitors (visit_day,visitor_id,source)
  select (now() at time zone 'Asia/Seoul')::date, visitor,
     case when origin_channel in ('direct','google','naver','daum','facebook','instagram','threads','kakao','other')
          then origin_channel else 'other' end
  where visitor is not null
  on conflict (visit_day,visitor_id) do nothing
$$;

revoke execute on function private.guard_member_writes(), private.guard_public_form(), private.sync_topic_vote_totals() from public, anon, authenticated;

do $$
begin
  if exists (
    (select topic_id, choice, count(*) as total from public.topic_votes group by 1,2
     except select topic_id, choice, sum(vote_count)::bigint from private.topic_vote_totals group by 1,2)
    union all
    (select topic_id, choice, sum(vote_count)::bigint from private.topic_vote_totals group by 1,2
     except select topic_id, choice, count(*) from public.topic_votes group by 1,2)
  ) then raise exception 'Vote counter backfill diverged from recorded ballots'; end if;
end;
$$;
