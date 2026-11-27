set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);

alter table private.beta_bot_activity drop constraint beta_bot_activity_event_check;
alter table private.beta_bot_activity add check(event in ('post','vote','reaction','suggestion','interest','issue_post'));
alter table private.beta_bot_activity drop constraint beta_bot_activity_nickname_event_run_day_key;

create table private.beta_bot_four_hour_runs (slot_start timestamptz primary key);
alter table private.beta_bot_four_hour_runs enable row level security;
revoke all on private.beta_bot_four_hour_runs from public,anon,authenticated;

create trigger reserve_beta_bot_issue_names before insert or update on public.issue_posts
for each row execute function private.reserve_beta_bot_names();

create or replace function private.run_siseon_beta_bots()
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  slot_start timestamptz := date_bin(interval '4 hours', statement_timestamp(), timestamptz '2000-01-01 00:00:00+09');
  d date := (slot_start at time zone 'Asia/Seoul')::date;
  run_at timestamptz := statement_timestamp();
  bots text[];
  topics uuid[];
  operator_id uuid;
  k integer;
  bot text;
  issue record;
  vote_choice text;
  created_post uuid;
  first_post uuid;
  interest_target uuid;
  reaction_target uuid;
begin
  perform private.check_beta_member_limit();
  if exists(select 1 from private.beta_bot_stop) then return null; end if;
  select user_id into operator_id from public.user_roles where role='admin' order by user_id limit 1;
  if operator_id is null then return null; end if;

  select array_agg(id order by random()) into topics from public.topic_candidates
  where status='approved' and published_at<=run_at and expires_at>run_at and cardinality(vote_options)>0;
  if topics is null then return null; end if;
  select array_agg(nickname) into bots
  from (select nickname from private.beta_bot_roster order by random() limit 3) roster;
  if cardinality(bots) is distinct from 3 then return null; end if;

  insert into private.beta_bot_four_hour_runs values(slot_start) on conflict do nothing;
  if not found then return null; end if;
  delete from private.beta_bot_four_hour_runs r where r.slot_start < run_at-interval '7 days';

  -- Choose independently from each topic's current options and retain one vote per AI and topic.
  insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
  select roster.nickname,'vote',t.id,t.vote_options[1+floor(random()*cardinality(t.vote_options))::integer],d
  from unnest(bots) as roster(nickname)
  cross join public.topic_candidates t
  where t.id=any(topics) and not exists (
    select 1 from private.beta_bot_activity a where a.event='vote' and a.target_id=t.id and a.nickname=roster.nickname
  )
  on conflict (nickname,target_id) where event='vote' do nothing;

  for k in 1..least(3,cardinality(topics)) loop
    bot:=bots[k];
    select t.id,t.title into issue from public.topic_candidates t where t.id=topics[k];
    select a.detail into vote_choice from private.beta_bot_activity a
    where a.event='vote' and a.target_id=issue.id and a.nickname=bot;
    -- A poll can be edited after a bot votes. Use a current option for the opinion's stance.
    if not exists(select 1 from public.topic_candidates t where t.id=issue.id and vote_choice=any(t.vote_options)) then
      select t.vote_options[1] into vote_choice from public.topic_candidates t where t.id=issue.id;
    end if;
    insert into public.issue_posts(topic_id,author_id,author_nickname,stance,kind,title,body)
    values(issue.id,operator_id,bot,vote_choice,'opinion',
      (array['제가 중요하게 본 기준','다른 입장도 함께 살펴봤어요','이 선택에서 확인하고 싶은 점'])[k],
      '저는 이 안건에서 ‘'||vote_choice||'’ 쪽에 가까워요. '||
      (array[
        '좋은 취지라도 실제 적용할 때 부담이 한쪽에 쏠리지 않는지가 중요하다고 생각해요.',
        '같은 선택이라도 상황에 따라 결과가 다를 수 있어요. 누구에게 어떤 영향을 주는지 먼저 확인하고 싶어요.',
        '예외가 생겼을 때도 적용할 수 있는 기준이 필요하다고 봐요. 어떤 사례를 생각하셨나요?'
      ])[k])
    returning id into created_post;
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bot,'issue_post',created_post,issue.id::text,d);
  end loop;

  for k in 1..2 loop
    bot:=bots[k];
    select t.title into issue from public.topic_candidates t where t.id=topics[1+(k-1)%cardinality(topics)];
    insert into public.open_talk_posts(author_id,author_nickname,category,title,body)
    values(operator_id,bot,'자유',left(issue.title,90),
      (array['이 질문을 일상에서 마주친 적 있나요? 판단할 때 가장 중요하게 본 기준을 이야기해 봐요.',
             '이 주제에 서로 다른 의견이 나오는 이유는 뭘까요? 다른 입장에서도 공감할 부분을 찾아보고 싶어요.'])[k])
    returning id into created_post;
    if first_post is null then first_post:=created_post; end if;
    insert into private.beta_bot_activity(nickname,event,target_id,run_day) values(bot,'post',created_post,d);
  end loop;

  bot:=bots[3];
  select t.title into issue from public.topic_candidates t where t.id=topics[1+2%cardinality(topics)];
  insert into public.topic_suggestions(author_id,author_nickname,category,title,rationale,for_text,against_text)
  values(operator_id,bot,'기타','이 문제에 공통 기준이 필요할까요?',
    '‘'||left(issue.title,180)||'’를 읽고, 일상에서 누구에게나 적용할 기준과 예외를 함께 토론해 보고 싶어요.',
    '공통 기준이 있으면 결과를 예측하고 판단하기 쉬워질 수 있어요.',
    '상황에 맞게 판단할 여지가 있어야 다양한 경험을 반영할 수 있어요.')
  returning id into created_post;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day) values(bot,'suggestion',created_post,d);

  select p.id into reaction_target from public.open_talk_posts p
  where p.status='published' and not exists(select 1 from private.beta_bot_roster r where r.nickname=p.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='reaction' and a.nickname=bots[1] and a.target_id=p.id)
  order by p.created_at desc,p.id desc limit 1;
  if reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bots[1],'reaction',reaction_target,'공감',d) on conflict do nothing;
  end if;
  select s.id into interest_target from public.topic_suggestions s
  where s.status='pending' and not exists(select 1 from private.beta_bot_roster r where r.nickname=s.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='interest' and a.nickname=bot and a.target_id=s.id)
  order by s.created_at desc,s.id desc limit 1;
  if interest_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(bot,'interest',interest_target,'토론해 보고 싶어요',d) on conflict do nothing;
  end if;
  return first_post;
end;
$$;
revoke execute on function private.run_siseon_beta_bots() from public,anon,authenticated;

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

  perform p.id from public.issue_posts p join private.beta_bot_activity a on a.target_id=p.id
    where a.event='issue_post' and p.author_nickname=a.nickname order by p.id for update of p;
  update public.issue_posts p set status='removed', title='베타 종료로 삭제된 AI 의견',
    body='베타테스트 종료로 AI 작성 내용을 삭제했습니다.', source_url=null, updated_at=now()
  from private.beta_bot_activity a where a.event='issue_post' and a.target_id=p.id and p.author_nickname=a.nickname
    and exists(select 1 from public.issue_comments c where c.post_id=p.id);
  delete from public.issue_posts p using private.beta_bot_activity a
  where a.event='issue_post' and a.target_id=p.id and p.author_nickname=a.nickname
    and not exists(select 1 from public.issue_comments c where c.post_id=p.id);
  return private.finalize_siseon_beta_talk_and_votes();
end;
$function$
;
select cron.schedule('siseon-beta-bots','0 3,7,11,15,19,23 * * *','select private.run_siseon_beta_bots()');

update public.announcements set
  body=regexp_replace(body,'한국 시간 기준[^.]*참여합니다[.]',
    '한국 시간 기준 4시간마다 AI 3명이 활동하며, 진행 중인 안건에 투표하고 토론 의견과 게시글을 남깁니다.'),updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published and not exists(select 1 from private.beta_bot_stop);
