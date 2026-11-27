set local lock_timeout='5s';
alter table private.beta_bot_activity drop constraint beta_bot_activity_event_check;
alter table private.beta_bot_activity add check(event in ('post','vote','reaction','suggestion','interest'));
create index beta_bot_community_score on private.beta_bot_activity(event,target_id)
  where event in ('reaction','interest');
create unique index beta_bot_community_reaction_once on private.beta_bot_activity(event,nickname,target_id)
  where event in ('reaction','interest');

alter function private.run_siseon_beta_bots() rename to run_siseon_beta_vote_and_talk;
create function private.run_siseon_beta_bots()
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  talk_id uuid := private.run_siseon_beta_vote_and_talk();
  d date := (now() at time zone 'Asia/Seoul')::date;
  bot_name text;
  actor_id uuid;
  topic_title text;
  suggestion_id uuid;
  interest_target uuid;
begin
  if talk_id is null then return null; end if;
  select author_id,author_nickname into actor_id,bot_name from public.open_talk_posts where id=talk_id;
  select t.title into topic_title from private.beta_bot_activity a join public.topic_candidates t on t.id=a.target_id
    where a.event='vote' and a.nickname=bot_name and a.run_day=d limit 1;
  if topic_title is null then return talk_id; end if;
  select s.id into interest_target from public.topic_suggestions s
    where s.status='pending' and not exists (
      select 1 from private.beta_bot_activity a where a.target_id=s.id and
        (a.event='suggestion' or (a.event='interest' and a.nickname=bot_name)))
    order by s.created_at desc,s.id desc limit 1;
  insert into public.topic_suggestions(author_id,category,title,rationale,for_text,against_text)
  values(actor_id,'기타','['||bot_name||'] 생활 속 기준을 함께 정해볼까요?',
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
$$;
revoke execute on function private.run_siseon_beta_bots() from public,anon,authenticated;

alter function private.finalize_siseon_beta_bots() rename to finalize_siseon_beta_talk_and_votes;
create function private.finalize_siseon_beta_bots()
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from private.beta_bot_stop where cleaned_at is null) then return false; end if;
  perform pg_advisory_xact_lock(20261127,152);
  if not exists(select 1 from private.beta_bot_stop where cleaned_at is null) then return false; end if;
  perform s.id from public.topic_suggestions s join private.beta_bot_activity a on a.target_id=s.id
    where a.event='suggestion' and left(s.title,length(a.nickname)+2)='['||a.nickname||']'
    order by s.id for update of s;
  update public.topic_suggestions s set status='rejected',title='베타 종료로 삭제된 AI 제안',
    rationale='베타 종료로 내용을 삭제했습니다.',for_text='삭제된 내용',against_text='삭제된 내용',source_url=null,updated_at=now()
  from private.beta_bot_activity a
  where a.event='suggestion' and a.target_id=s.id and left(s.title,length(a.nickname)+2)='['||a.nickname||']'
    and exists(select 1 from public.topic_suggestion_interests i where i.suggestion_id=s.id);
  delete from public.topic_suggestions s using private.beta_bot_activity a
  where a.event='suggestion' and a.target_id=s.id and left(s.title,length(a.nickname)+2)='['||a.nickname||']'
    and not exists(select 1 from public.topic_suggestion_interests i where i.suggestion_id=s.id);
  return private.finalize_siseon_beta_talk_and_votes();
end;
$$;
revoke execute on function private.finalize_siseon_beta_bots() from public,anon,authenticated;

create or replace function public.get_post_reactions(p_board text,p_posts uuid[])
returns table(post_id uuid,likes bigint,differs bigint,mine text)
language sql stable security definer set search_path=''
as $$
 select p.id,count(*) filter(where r.reaction='like') +
   case when p_board='talk' then (select count(*) from private.beta_bot_activity a where a.event='reaction' and a.target_id=p.id) else 0 end,
 count(*) filter(where r.reaction='differ'),max(r.reaction) filter(where r.user_id=auth.uid())
 from (select distinct id from unnest(p_posts) as x(id) limit 500) p
 left join public.post_reactions r on r.board=p_board and r.post_id=p.id
 where private.reaction_post_visible(p_board,p.id)
 group by p.id
$$;

create or replace function public.get_topic_suggestion_counts()
returns table(suggestion_id uuid,interest_count bigint)
language sql stable security definer set search_path=''
as $$
 select s.id,(select count(*) from public.topic_suggestion_interests i where i.suggestion_id=s.id) +
   (select count(*) from private.beta_bot_activity a where a.event='interest' and a.target_id=s.id)
 from public.topic_suggestions s where s.status in ('pending','approved')
$$;

create or replace function public.get_topic_suggestion_count(p_suggestion_id uuid)
returns bigint language sql stable security definer set search_path=''
as $$
 select case when exists(select 1 from public.topic_suggestions s where s.id=p_suggestion_id and s.status in ('pending','approved'))
 then (select count(*) from public.topic_suggestion_interests i where i.suggestion_id=p_suggestion_id) +
      (select count(*) from private.beta_bot_activity a where a.event='interest' and a.target_id=p_suggestion_id)
 else 0 end
$$;

create function public.get_community_highlights(p_board text)
returns table(post_id uuid,score bigint)
language sql stable security definer set search_path=''
as $$
 with activity as (
   select r.post_id id from public.post_reactions r where p_board='open-talk' and r.board='talk' and r.reaction='like'
   union all select i.suggestion_id from public.topic_suggestion_interests i where p_board='suggestions'
   union all select a.target_id from private.beta_bot_activity a
     where (p_board='open-talk' and a.event='reaction') or (p_board='suggestions' and a.event='interest')
 ), scores as (select id,count(*) points from activity group by id),
 visible as (
   select p.id,p.created_at from public.open_talk_posts p where p_board='open-talk' and p.status='published'
   union all select s.id,s.created_at from public.topic_suggestions s where p_board='suggestions' and s.status in ('pending','approved')
 )
 select v.id,s.points from scores s join visible v using(id)
 order by s.points desc,v.created_at desc,v.id desc limit 3
$$;
revoke execute on function public.get_community_highlights(text) from public;
grant execute on function public.get_community_highlights(text) to anon,authenticated;

update public.announcements set
  body=replace(replace(body,'익명 자유토론에 참여합니다.','익명 자유토론과 다음 주제 제안에 글을 올리고 반응을 남깁니다.'),
  'AI 공감 기록은 별도 저장되며 게시물 공감 수에는 포함되지 않습니다.',
  '베타 기간 게시물 공감과 ‘토론해 보고 싶어요’에도 AI 반응이 포함되며, 반응순 상위 글에 영향을 줄 수 있습니다.'),
  updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published
  and not exists(select 1 from private.beta_bot_stop);
