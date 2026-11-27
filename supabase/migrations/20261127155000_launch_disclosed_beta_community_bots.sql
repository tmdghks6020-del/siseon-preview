set local lock_timeout = '5s';

create table private.beta_bot_activity (
  id bigint generated always as identity primary key,
  nickname text not null check (nickname in ('시선봄 AI', '시선온 AI')),
  event text not null check (event in ('post', 'vote', 'reaction')),
  target_id uuid not null,
  detail text,
  run_day date not null,
  created_at timestamptz not null default now(),
  unique (event, run_day)
);
create unique index beta_bot_one_vote_per_topic
  on private.beta_bot_activity (nickname, target_id) where event = 'vote';
alter table private.beta_bot_activity enable row level security;
revoke all on private.beta_bot_activity from public, anon, authenticated;

create function private.reserve_beta_bot_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_siseon_admin()
     and (new.author_nickname in ('시선봄 AI', '시선온 AI')
       or new.title ~ '^\[(시선봄 AI|시선온 AI)\]') then
    raise exception using errcode = '42501', message = 'AI 운영 닉네임은 시선 운영팀에서 사용합니다.';
  end if;
  return new;
end;
$$;
create trigger reserve_beta_bot_names before insert or update on public.open_talk_posts
for each row execute function private.reserve_beta_bot_names();
revoke execute on function private.reserve_beta_bot_names() from public, anon, authenticated;

create function private.run_siseon_beta_bots()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  korean_day date := (now() at time zone 'Asia/Seoul')::date;
  bot_name text := case when extract(doy from korean_day)::integer % 2 = 0 then '시선봄 AI' else '시선온 AI' end;
  operator_id uuid;
  topic record;
  bot_post uuid;
  reaction_target uuid;
  test_vote text;
begin
  perform pg_advisory_xact_lock(20261127, 152);
  if exists (select 1 from private.beta_bot_activity where event = 'post' and run_day = korean_day) then
    return null;
  end if;
  select user_id into operator_id from public.user_roles where role = 'admin' order by user_id limit 1;
  if operator_id is null then return null; end if;

  select t.id, t.title, t.vote_options into topic
  from public.topic_candidates t
  where t.status = 'approved' and t.published_at <= now() and t.expires_at > now()
  order by t.published_at desc, t.id desc limit 1;
  if not found then return null; end if;

  select p.id into reaction_target from public.open_talk_posts p
  where p.status = 'published'
    and p.author_nickname not in ('시선봄 AI','시선온 AI')
    and not exists (select 1 from private.beta_bot_activity a where a.event = 'reaction' and a.nickname = bot_name and a.target_id = p.id)
  order by p.created_at desc, p.id desc limit 1;

  insert into public.open_talk_posts(author_id, author_nickname, category, title, body)
  values (
    operator_id, bot_name, '자유',
    '[' || bot_name || '] ' || left(topic.title, 90),
    '시선 베타테스트에 참여하는 AI 운영봇입니다.' || chr(10) || chr(10) ||
    case when bot_name = '시선봄 AI'
      then '이 안건을 판단할 때 가장 중요하게 보는 기준은 무엇인가요? 이유나 경험을 하나씩 들려주세요.'
      else '이 안건에서 의견이 갈리는 이유는 무엇일까요? 서로 다른 입장이 공감할 만한 부분도 함께 이야기해 봐요.'
    end
  ) returning id into bot_post;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day)
  values (bot_name,'post',bot_post,korean_day);

  test_vote := topic.vote_options[1 + extract(doy from korean_day)::integer % nullif(cardinality(topic.vote_options), 0)];
  if test_vote is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values (bot_name,'vote',topic.id,test_vote,korean_day)
    on conflict do nothing;
  end if;
  if reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values (bot_name,'reaction',reaction_target,'공감',korean_day);
  end if;
  return bot_post;
end;
$$;
revoke execute on function private.run_siseon_beta_bots() from public, anon, authenticated;

insert into public.announcements(category,title,summary,body,published,pinned,created_by)
values (
  '서비스 공지',
  '베타테스트 기간 AI 운영봇 참여 안내',
  '시선봄 AI와 시선온 AI가 베타테스트에 함께 참여합니다.',
  '시선 베타테스트 기간에는 시선봄 AI와 시선온 AI가 익명 자유토론에서 대화를 여는 글을 올립니다. AI 게시글의 제목과 작성자에 AI 닉네임을 표시합니다.' || chr(10) || chr(10) ||
  '투표·공감 기능을 점검하기 위한 AI 활동은 별도 기록에 저장하며, 화면에 표시되는 회원 투표 결과와 공감 수에 반영하지 않습니다.' || chr(10) || chr(10) ||
  '베타테스트 종료 시 AI 작성 글과 AI 투표·공감 기록을 정리할 예정입니다. 안건과 실제 회원의 투표 기록은 유지합니다.',
  true, true,
  (select user_id from public.user_roles where role = 'admin' order by user_id limit 1)
);

select cron.schedule('siseon-beta-bots', '0 3 * * *', 'select private.run_siseon_beta_bots()');
select private.run_siseon_beta_bots();
