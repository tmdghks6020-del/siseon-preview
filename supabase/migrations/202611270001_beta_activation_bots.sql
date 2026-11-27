begin;

create table if not exists public.beta_bot_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  member_target integer not null default 100 check (member_target between 1 and 100000),
  bots_per_topic integer not null default 10 check (bots_per_topic between 1 and 50),
  topic_opinion_min integer not null default 3 check (topic_opinion_min between 1 and 10),
  topic_opinion_max integer not null default 5 check (topic_opinion_max between topic_opinion_min and 10),
  open_talk_daily_min integer not null default 1 check (open_talk_daily_min between 0 and 30),
  open_talk_daily_max integer not null default 10 check (open_talk_daily_max between open_talk_daily_min and 30),
  started_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  updated_at timestamptz not null default now()
);
insert into public.beta_bot_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.beta_bot_personas (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  perspective text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.beta_bot_personas(nickname,perspective) values
 ('차분한저울','양쪽이 감수하는 비용과 얻는 이익을 비교한다.'),
 ('생활의시선','정책과 선택이 일상에 미치는 영향을 먼저 살핀다.'),
 ('현장메모','실제 시행 과정에서 생길 수 있는 어려움을 따진다.'),
 ('긴호흡','장기적인 효과와 제도의 지속 가능성을 살핀다.'),
 ('틈새질문','놓치기 쉬운 조건과 예외를 찾아 질문한다.'),
 ('균형찾기','한쪽의 이익이 다른 쪽에 주는 부담을 함께 본다.'),
 ('근거확인','주장과 확인된 사실을 구분하고 근거의 범위를 짚는다.'),
 ('다른경로','같은 목표를 달성할 수 있는 대안이 있는지 살핀다.'),
 ('작은목소리','취약한 상황에 놓인 사람에게 미칠 영향을 살핀다.'),
 ('실행가능성','제안이 실제로 실행되고 점검될 수 있는지 살핀다.')
on conflict(nickname) do update set perspective=excluded.perspective, enabled=true;

create table if not exists public.beta_bot_votes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topic_candidates(id) on delete cascade,
  persona_id uuid not null references public.beta_bot_personas(id) on delete restrict,
  choice text not null,
  created_at timestamptz not null default now(),
  unique(topic_id,persona_id)
);
create index if not exists beta_bot_votes_topic_idx on public.beta_bot_votes(topic_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.validate_beta_bot_vote()
returns trigger language plpgsql security definer set search_path='' as $$
declare options text[];
begin
  select vote_options into options from public.topic_candidates where id=new.topic_id for share;
  if options is null or new.choice is null or not (new.choice=any(options)) then
    raise exception '이 안건에 없는 선택지입니다.';
  end if;
  return new;
end
$$;
revoke all on function private.validate_beta_bot_vote() from public, anon, authenticated;
drop trigger if exists validate_beta_bot_vote_selection on public.beta_bot_votes;
create trigger validate_beta_bot_vote_selection before insert or update on public.beta_bot_votes
for each row execute function private.validate_beta_bot_vote();

create table if not exists public.beta_bot_queue (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.beta_bot_personas(id) on delete cascade,
  post_type text not null check(post_type in ('issue_opinion','issue_reply','open_talk','open_talk_reply')),
  topic_id uuid references public.topic_candidates(id) on delete cascade,
  parent_post_id uuid,
  category text,
  title text,
  body text not null,
  stance text,
  status text not null default 'queued' check(status in ('queued','published','cancelled','failed')),
  scheduled_at timestamptz not null,
  published_post_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists beta_bot_queue_due_idx on public.beta_bot_queue(status,scheduled_at);
create unique index if not exists beta_bot_queue_one_reply_idx
  on public.beta_bot_queue(post_type,parent_post_id)
  where parent_post_id is not null and post_type in ('issue_reply','open_talk_reply');

create table if not exists public.beta_bot_daily_targets (
  activity_date date primary key,
  target_count integer not null check(target_count between 1 and 10),
  created_at timestamptz not null default now()
);

-- Simulated participants are not auth users. Nullable authors can only be created by
-- the service worker; client insert policies still require auth.uid().
alter table public.issue_posts alter column author_id drop not null;
alter table public.issue_comments alter column author_id drop not null;
alter table public.open_talk_posts alter column author_id drop not null;
alter table public.open_talk_comments alter column author_id drop not null;

alter table public.beta_bot_personas enable row level security;
alter table public.beta_bot_votes enable row level security;
alter table public.beta_bot_queue enable row level security;
alter table public.beta_bot_daily_targets enable row level security;
alter table public.beta_bot_settings enable row level security;
revoke all on public.beta_bot_personas,public.beta_bot_votes,public.beta_bot_queue,public.beta_bot_daily_targets,public.beta_bot_settings from public,anon,authenticated;

create or replace function public.get_topic_vote_results(p_topic_id uuid)
returns table(choice text,vote_count bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or (
    not exists(select 1 from public.topic_votes where topic_id=p_topic_id and user_id=auth.uid())
    and not public.is_topic_archived(p_topic_id)
  ) then raise exception 'vote_required'; end if;

  return query
    select combined.choice,count(*)::bigint
    from (
      select v.choice from public.topic_votes v where v.topic_id=p_topic_id
      union all
      select v.choice from public.beta_bot_votes v where v.topic_id=p_topic_id
    ) combined
    group by combined.choice;
end
$$;
revoke all on function public.get_topic_vote_results(uuid) from public,anon;
grant execute on function public.get_topic_vote_results(uuid) to authenticated;

create or replace function public.get_beta_bot_admin_stats()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  member_total bigint;
  active_topics bigint;
  real_votes bigint;
  simulated_votes bigint;
  real_issue_posts bigint;
  simulated_issue_posts bigint;
  real_issue_comments bigint;
  simulated_issue_comments bigint;
  real_open_posts bigint;
  simulated_open_posts bigint;
  real_open_comments bigint;
  simulated_open_comments bigint;
  settings_row public.beta_bot_settings%rowtype;
begin
  if not public.is_siseon_admin() then raise exception 'admin_required'; end if;
  select * into settings_row from public.beta_bot_settings where singleton=true;
  select count(*) into member_total from public.member_profiles where status in ('active','warned');
  select count(*) into active_topics from public.topic_candidates where status='approved' and (expires_at is null or expires_at>now());
  select count(*) into real_votes from public.topic_votes;
  select count(*) into simulated_votes from public.beta_bot_votes;
  select count(*) into real_issue_posts from public.issue_posts where author_id is not null;
  select count(*) into simulated_issue_posts from public.issue_posts where author_id is null;
  select count(*) into real_issue_comments from public.issue_comments where author_id is not null;
  select count(*) into simulated_issue_comments from public.issue_comments where author_id is null;
  select count(*) into real_open_posts from public.open_talk_posts where author_id is not null;
  select count(*) into simulated_open_posts from public.open_talk_posts where author_id is null;
  select count(*) into real_open_comments from public.open_talk_comments where author_id is not null;
  select count(*) into simulated_open_comments from public.open_talk_comments where author_id is null;
  return jsonb_build_object(
    'settings',to_jsonb(settings_row),
    'realMembers',member_total,'activeTopics',active_topics,
    'realVotes',real_votes,'simulatedVotes',simulated_votes,
    'realIssuePosts',real_issue_posts,'simulatedIssuePosts',simulated_issue_posts,
    'realIssueComments',real_issue_comments,'simulatedIssueComments',simulated_issue_comments,
    'realOpenTalkPosts',real_open_posts,'simulatedOpenTalkPosts',simulated_open_posts,
    'realOpenTalkComments',real_open_comments,'simulatedOpenTalkComments',simulated_open_comments
  );
end
$$;
revoke all on function public.get_beta_bot_admin_stats() from public,anon;
grant execute on function public.get_beta_bot_admin_stats() to authenticated;

create or replace function public.set_beta_bot_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  member_total bigint;
  setting_row public.beta_bot_settings%rowtype;
begin
  if not public.is_siseon_admin() then raise exception 'admin_required'; end if;
  select count(*) into member_total from public.member_profiles where status in ('active','warned');
  select * into setting_row from public.beta_bot_settings where singleton=true for update;

  if p_enabled and member_total >= setting_row.member_target then
    update public.beta_bot_settings set enabled=false,stopped_at=now(),stop_reason='member_target',updated_at=now() where singleton=true;
    raise exception 'member_target_reached';
  end if;
  if p_enabled and not exists (
    select 1 from public.announcements
    where published=true and title='시선 공개 베타테스트 안내'
  ) then raise exception 'beta_notice_required'; end if;

  update public.beta_bot_settings
  set enabled=p_enabled,
      started_at=case when p_enabled then coalesce(started_at,now()) else started_at end,
      stopped_at=case when p_enabled then null else now() end,
      stop_reason=case when p_enabled then null else 'admin_paused' end,
      updated_at=now()
  where singleton=true
  returning * into setting_row;
  return to_jsonb(setting_row);
end
$$;
revoke all on function public.set_beta_bot_enabled(boolean) from public,anon;
grant execute on function public.set_beta_bot_enabled(boolean) to authenticated;

insert into public.announcements(category,title,summary,body,published,pinned)
select
  '서비스 소식',
  '시선 공개 베타테스트 안내',
  '베타 기간에는 AI 시뮬레이션 참여가 투표 결과와 토론에 포함될 수 있습니다.',
  '시선은 현재 공개 베타테스트 중입니다. 일부 안건에서 AI 시뮬레이션 참여자가 투표하고 의견·댓글을 남길 수 있으며, AI 표는 화면에 표시되는 투표 결과에 합산됩니다. 익명 자유토론 글과 실제 회원 글에 대한 답글도 베타 기간에 생성될 수 있습니다.

운영 지표에서는 실제 회원 활동과 AI 시뮬레이션 활동을 따로 집계합니다. 이 결과는 실제 이용자만의 의견이나 전체 여론조사를 뜻하지 않습니다. AI 참여는 실제 사람의 경험이나 의견을 나타내지 않습니다.

AI 활동은 실제 회원 프로필 수가 100명에 도달하면 자동으로 중단됩니다. 정식 서비스 전환 시 AI 참여자 기록과 베타 기간의 투표 기록은 초기화될 예정입니다. 베타테스트에 참여하기 전에 이 점을 확인해 주세요.',
  true,
  true
where not exists(select 1 from public.announcements where title='시선 공개 베타테스트 안내');

commit;