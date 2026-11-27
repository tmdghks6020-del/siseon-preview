set local lock_timeout = '5s';

create table private.beta_bot_roster (nickname text primary key);
alter table private.beta_bot_roster enable row level security;
insert into private.beta_bot_roster
select stem || ending || ' AI'
from unnest(array['시선','여울','노을','초록','나래','구름','별빛','새벽','물결','바람']) stem
cross join unnest(array['봄','온','결','길','숲','빛','달','담','별','솔']) ending;

alter table private.beta_bot_activity drop constraint beta_bot_activity_nickname_check;
alter table private.beta_bot_activity drop constraint beta_bot_activity_event_run_day_key;
alter table private.beta_bot_activity
  add foreign key (nickname) references private.beta_bot_roster(nickname),
  add unique (nickname,event,run_day);
create index beta_bot_vote_lookup on private.beta_bot_activity(target_id, detail) where event='vote';

create table private.beta_bot_runs (run_day date primary key);
alter table private.beta_bot_runs enable row level security;
insert into private.beta_bot_runs select distinct run_day from private.beta_bot_activity;
create table private.beta_bot_stop (stopped_at timestamptz primary key default now());
alter table private.beta_bot_stop enable row level security;

create function private.check_beta_member_limit()
returns void
language plpgsql security definer set search_path=''
as $$
begin
  perform pg_advisory_xact_lock(20261127, 152);
  if not exists (select 1 from private.beta_bot_stop) and
     exists (select 1 from public.member_profiles offset 999 limit 1) then
    insert into private.beta_bot_stop default values;
  end if;
end;
$$;
create function private.stop_beta_bots_at_member_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.check_beta_member_limit();
  return null;
end;
$$;
create trigger stop_beta_bots_at_member_limit after insert on public.member_profiles
for each statement execute function private.stop_beta_bots_at_member_limit();

create or replace function private.reserve_beta_bot_names()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') and not public.is_siseon_admin()
     and exists (select 1 from private.beta_bot_roster r where
       r.nickname=new.author_nickname or r.nickname=substring(new.title from '^\[([^]]+)\]')) then
    raise exception using errcode='42501', message='AI 운영 닉네임은 시선 운영팀에서 사용합니다.';
  end if;
  return new;
end;
$$;

create or replace function private.run_siseon_beta_bots()
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  korean_day date := (now() at time zone 'Asia/Seoul')::date;
  daily_limit integer := 1 + floor(random() * 20)::integer;
  bot_name text;
  post_author text;
  operator_id uuid;
  topic record;
  bot_post uuid;
  reaction_target uuid;
  test_vote text;
begin
  perform private.check_beta_member_limit();
  if exists (select 1 from private.beta_bot_stop) or
     exists (select 1 from private.beta_bot_runs where run_day=korean_day) then return null; end if;
  select user_id into operator_id from public.user_roles where role='admin' order by user_id limit 1;
  if operator_id is null then return null; end if;
  select t.id,t.title,t.vote_options into topic from public.topic_candidates t
  where t.status='approved' and t.published_at<=now() and t.expires_at>now()
    and cardinality(t.vote_options)>0
  order by t.published_at desc,t.id desc limit 1;
  if not found then return null; end if;
  insert into private.beta_bot_runs values (korean_day);
  for bot_name in
    select r.nickname from private.beta_bot_roster r where not exists (
      select 1 from private.beta_bot_activity a where a.event='vote' and a.target_id=topic.id and a.nickname=r.nickname
    ) order by random() limit daily_limit
  loop
    test_vote := topic.vote_options[1 + floor(random()*cardinality(topic.vote_options))::integer];
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values (bot_name,'vote',topic.id,test_vote,korean_day);
    post_author := coalesce(post_author,bot_name);
  end loop;
  if post_author is null then return null; end if;
  select p.id into reaction_target from public.open_talk_posts p where p.status='published'
    and not exists (select 1 from private.beta_bot_roster r where r.nickname=p.author_nickname)
    and not exists (select 1 from private.beta_bot_activity a where a.event='reaction' and a.nickname=post_author and a.target_id=p.id)
  order by p.created_at desc,p.id desc limit 1;
  insert into public.open_talk_posts(author_id,author_nickname,category,title,body)
  values(operator_id,post_author,'자유','['||post_author||'] '||left(topic.title,90),
    '시선 베타테스트에 참여하는 AI 운영봇입니다.'||chr(10)||chr(10)||
    '이 안건에서 서로 다른 의견을 가진 사람이 함께 중요하게 볼 기준은 무엇일까요? 이유나 경험을 들려주세요.')
  returning id into bot_post;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day)
    values(post_author,'post',bot_post,korean_day);
  if reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
      values(post_author,'reaction',reaction_target,'공감',korean_day);
  end if;
  return bot_post;
end;
$$;
revoke execute on function private.check_beta_member_limit(), private.stop_beta_bots_at_member_limit(),
  private.reserve_beta_bot_names(), private.run_siseon_beta_bots() from public,anon,authenticated;
select private.check_beta_member_limit();

-- The public API exposes a combined tally and carries no source breakdown.
create function public.get_beta_poll_results(p_topic_id uuid)
returns table(choice text,vote_count bigint)
language sql stable security definer set search_path=''
as $$
  select tallies.choice,sum(tallies.n)::bigint
  from (
    select r.choice,r.vote_count n from private.topic_vote_totals r where r.topic_id=p_topic_id
    union all
    select a.detail,count(*) from private.beta_bot_activity a
      where a.target_id=p_topic_id and a.event='vote' group by a.detail
  ) tallies
  where exists (select 1 from public.topic_candidates t where t.id=p_topic_id and t.published_at<=now() and
      (t.status='archived' or (t.status='approved' and exists (
        select 1 from public.topic_votes v where v.topic_id=t.id and v.user_id=auth.uid()
      ))))
  group by tallies.choice
$$;
revoke execute on function public.get_beta_poll_results(uuid) from public;
grant execute on function public.get_beta_poll_results(uuid) to anon,authenticated;

create function public.admin_beta_poll_breakdown(p_topic_id uuid)
returns table(choice text,member_votes bigint,ai_votes bigint)
language plpgsql stable security definer set search_path=''
as $$
begin
  if public.is_siseon_admin() is distinct from true then
    raise exception using errcode='42501',message='관리자 권한이 필요합니다.';
  end if;
  return query
  select tallies.label,sum(tallies.members)::bigint,sum(tallies.bots)::bigint
  from (
    select r.choice label,r.vote_count members,0::bigint bots from private.topic_vote_totals r where r.topic_id=p_topic_id
    union all
    select a.detail,0::bigint,count(*) from private.beta_bot_activity a
      where a.target_id=p_topic_id and a.event='vote' group by a.detail
  ) tallies group by tallies.label;
end;
$$;
revoke execute on function public.admin_beta_poll_breakdown(uuid) from public,anon;
grant execute on function public.admin_beta_poll_breakdown(uuid) to authenticated;

update public.announcements set
  summary='AI 닉네임이 베타에 참여하며, 공개 투표 결과에 AI 표가 포함됩니다.',
  body='베타테스트 동안 AI 운영봇이 닉네임 뒤에 AI를 표시하고 익명 자유토론에 참여합니다. AI 닉네임은 100개이며, 한국 시간 기준 하루 최대 20개가 돌아가며 참여합니다.'||chr(10)||chr(10)||
       '베타 기간 공개 투표 결과에는 회원 표와 AI 표가 함께 집계됩니다. 운영자는 관리자 화면에서 두 유형을 구분할 수 있습니다. AI 공감 기록은 별도 저장되며 게시물 공감 수에는 포함되지 않습니다.'||chr(10)||chr(10)||
       '실제 회원이 1,000명에 도달하면 새 AI 활동을 중단합니다. 베타 종료 시 AI 작성 글과 AI 투표·공감 기록을 정리할 예정이며, 실제 회원의 투표와 안건은 유지합니다.',
  updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published;
