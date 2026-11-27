create or replace function private.run_siseon_beta_bots()
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
select private.run_siseon_beta_bots();
