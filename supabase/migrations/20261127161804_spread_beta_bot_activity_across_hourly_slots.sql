set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);
create table private.beta_bot_hourly_plan (
  run_day date not null,
  hour_of_day smallint not null check(hour_of_day between 0 and 23),
  nickname text not null references private.beta_bot_roster(nickname) on update cascade,
  primary key (run_day,hour_of_day),
  unique (run_day,nickname)
);
alter table private.beta_bot_hourly_plan enable row level security;
revoke all on private.beta_bot_hourly_plan from public,anon,authenticated;

create or replace function private.run_siseon_beta_vote_and_talk()
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  korea_now timestamp := statement_timestamp() at time zone 'Asia/Seoul';
  d date := korea_now::date;
  slot_hour integer := extract(hour from korea_now)::integer;
  remaining integer;
  planned integer;
  bot_name text;
  operator_id uuid;
  topic record;
  bot_post uuid;
  reaction_target uuid;
begin
  perform private.check_beta_member_limit();
  if exists (select 1 from private.beta_bot_stop) then
    delete from private.beta_bot_hourly_plan;
    return null;
  end if;
  if not exists (select 1 from private.beta_bot_hourly_plan where run_day=d) then
    delete from private.beta_bot_hourly_plan where run_day<d;
    select 20-count(distinct nickname)::integer into remaining from private.beta_bot_activity where run_day=d;
    if remaining<=0 then return null; end if;
    planned := least(remaining,24-slot_hour,1+floor(random()*20)::integer);
    insert into private.beta_bot_hourly_plan(run_day,hour_of_day,nickname)
    select d,slots.hour_of_day,names.nickname
    from (
      select hour_of_day,row_number() over () n from
        (select h hour_of_day from generate_series(slot_hour,23) h order by random() limit planned) picked
    ) slots join (
      select nickname,row_number() over () n from (
        select r.nickname from private.beta_bot_roster r
        where not exists(select 1 from private.beta_bot_activity a where a.run_day=d and a.nickname=r.nickname)
        order by random() limit planned
      ) picked
    ) names using(n);
  end if;
  select nickname into bot_name from private.beta_bot_hourly_plan where run_day=d and hour_of_day=slot_hour;
  if bot_name is null or exists (
    select 1 from private.beta_bot_activity a where a.run_day=d and a.nickname=bot_name and a.event='vote'
  ) then return null; end if;

  select t.id,t.title,t.vote_options into topic from public.topic_candidates t
  where t.status='approved' and t.published_at<=now() and t.expires_at>now()
    and cardinality(t.vote_options)>0
    and not exists (select 1 from private.beta_bot_activity a where a.event='vote' and a.nickname=bot_name and a.target_id=t.id)
  order by t.published_at desc,t.id desc limit 1;
  if not found then return null; end if;

  insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
  values(bot_name,'vote',topic.id,topic.vote_options[1+floor(random()*cardinality(topic.vote_options))::integer],d);
  if exists(select 1 from private.beta_bot_runs where run_day=d) then return null; end if;

  select user_id into operator_id from public.user_roles where role='admin' order by user_id limit 1;
  if operator_id is null then return null; end if;
  select p.id into reaction_target from public.open_talk_posts p where p.status='published'
    and not exists(select 1 from private.beta_bot_roster r where r.nickname=p.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='reaction' and a.nickname=bot_name and a.target_id=p.id)
  order by p.created_at desc,p.id desc limit 1;
  insert into public.open_talk_posts(author_id,author_nickname,category,title,body)
  values(operator_id,bot_name,'자유','['||bot_name||'] '||left(topic.title,90),
    '시선 베타테스트에 참여하는 AI 운영봇입니다.'||chr(10)||chr(10)||
    '이 안건에서 서로 다른 의견을 가진 사람이 함께 중요하게 볼 기준은 무엇일까요? 이유나 경험을 들려주세요.')
  returning id into bot_post;
  insert into private.beta_bot_runs values(d);
  insert into private.beta_bot_activity(nickname,event,target_id,run_day) values(bot_name,'post',bot_post,d);
  if reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bot_name,'reaction',reaction_target,'공감',d);
  end if;
  return bot_post;
end;
$$;
revoke execute on function private.run_siseon_beta_vote_and_talk() from public,anon,authenticated;
select cron.schedule('siseon-beta-bots','0 * * * *','select private.run_siseon_beta_bots()');

update public.announcements
set body=replace(body,'한국 시간 기준 하루 최대 20개가 돌아가며 참여합니다.',
  '한국 시간 기준 매시간 활동 여부를 확인하고, 하루 1~20개의 닉네임이 무작위 시간대에 나누어 참여합니다.'),updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published and not exists(select 1 from private.beta_bot_stop);