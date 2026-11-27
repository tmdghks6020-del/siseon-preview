set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);
CREATE OR REPLACE FUNCTION private.run_siseon_beta_vote_and_talk()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if exists(select 1 from private.beta_bot_activity where run_day=d and event='post') then return null; end if;

  select user_id into operator_id from public.user_roles where role='admin' order by user_id limit 1;
  if operator_id is null then return null; end if;
  select p.id into reaction_target from public.open_talk_posts p where p.status='published'
    and not exists(select 1 from private.beta_bot_roster r where r.nickname=p.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='reaction' and a.nickname=bot_name and a.target_id=p.id)
  order by p.created_at desc,p.id desc limit 1;
  insert into public.open_talk_posts(author_id,author_nickname,category,title,body)
  values(operator_id,bot_name,'자유',left(topic.title,90),
    '시선 베타테스트에 참여하는 AI 운영봇입니다.'||chr(10)||chr(10)||
    '이 안건에서 서로 다른 의견을 가진 사람이 함께 중요하게 볼 기준은 무엇일까요? 이유나 경험을 들려주세요.')
  returning id into bot_post;
  insert into private.beta_bot_runs values(d) on conflict (run_day) do nothing;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day) values(bot_name,'post',bot_post,d);
  if reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bot_name,'reaction',reaction_target,'공감',d);
  end if;
  return bot_post;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.run_siseon_beta_bots()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  talk_id uuid := private.run_siseon_beta_vote_and_talk();
  d date := (now() at time zone 'Asia/Seoul')::date;
  bot_name text;
  actor_id uuid;
  topic_title text;
  suggestion_id uuid;
  interest_target uuid;
begin
  if talk_id is null then
    if exists (select 1 from private.beta_bot_stop) or
       exists (select 1 from private.beta_bot_activity where event='suggestion' and run_day=d) then return null; end if;
    select target_id into talk_id from private.beta_bot_activity where event='post' and run_day=d limit 1;
    if talk_id is null then return null; end if;
  end if;
  select author_id,author_nickname into actor_id,bot_name from public.open_talk_posts where id=talk_id;
  select t.title into topic_title from private.beta_bot_activity a join public.topic_candidates t on t.id=a.target_id
    where a.event='vote' and a.nickname=bot_name and a.run_day=d limit 1;
  if topic_title is null then return talk_id; end if;
  select s.id into interest_target from public.topic_suggestions s
    where s.status='pending' and not exists (
      select 1 from private.beta_bot_activity a where a.target_id=s.id and
        (a.event='suggestion' or (a.event='interest' and a.nickname=bot_name)))
    order by s.created_at desc,s.id desc limit 1;
  insert into public.topic_suggestions(author_id,author_nickname,category,title,rationale,for_text,against_text)
  values(actor_id,bot_name,'기타','생활 속 기준을 함께 정해볼까요?',
    '시선 베타테스트용 AI 제안입니다. ‘'||left(topic_title,180)||'’ 안건과 연결해 일상에서 적용할 기준과 예외를 이야기해 보고 싶어요.',
    '공통 기준이 있으면 상황을 예측하고 판단하기 쉬워질 수 있어요.',
    '상황에 맞게 판단할 여지를 남겨야 다양한 경험을 반영할 수 있어요.')
  returning id into suggestion_id;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day)
  values(bot_name,'suggestion',suggestion_id,d);
  if interest_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bot_name,'interest',interest_target,'토론해 보고 싶어요',d);
  end if;
  return talk_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.finalize_siseon_beta_bots()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from private.beta_bot_stop where cleaned_at is null) then return false; end if;
  perform pg_advisory_xact_lock(20261127,152);
  if not exists(select 1 from private.beta_bot_stop where cleaned_at is null) then return false; end if;
  perform s.id from public.topic_suggestions s join private.beta_bot_activity a on a.target_id=s.id
    where a.event='suggestion' and s.author_nickname=a.nickname
    order by s.id for update of s;
  update public.topic_suggestions s set status='rejected',title='베타 종료로 삭제된 AI 제안',
    rationale='베타 종료로 내용을 삭제했습니다.',for_text='삭제된 내용',against_text='삭제된 내용',source_url=null,updated_at=now()
  from private.beta_bot_activity a
  where a.event='suggestion' and a.target_id=s.id and s.author_nickname=a.nickname
    and exists(select 1 from public.topic_suggestion_interests i where i.suggestion_id=s.id);
  delete from public.topic_suggestions s using private.beta_bot_activity a
  where a.event='suggestion' and a.target_id=s.id and s.author_nickname=a.nickname
    and not exists(select 1 from public.topic_suggestion_interests i where i.suggestion_id=s.id);
  return private.finalize_siseon_beta_talk_and_votes();
end;
$function$
;

update public.open_talk_posts p set title=ltrim(substr(p.title,length(a.nickname)+3)), updated_at=now()
from private.beta_bot_activity a
where a.event='post' and a.target_id=p.id and p.author_nickname=a.nickname
  and left(p.title,length(a.nickname)+2)='['||a.nickname||']'
  and char_length(ltrim(substr(p.title,length(a.nickname)+3)))>=2;

update public.topic_suggestions s set title=ltrim(substr(s.title,length(a.nickname)+3)), updated_at=now()
from private.beta_bot_activity a
where a.event='suggestion' and a.target_id=s.id and s.author_nickname=a.nickname
  and left(s.title,length(a.nickname)+2)='['||a.nickname||']'
  and char_length(ltrim(substr(s.title,length(a.nickname)+3)))>=2;
