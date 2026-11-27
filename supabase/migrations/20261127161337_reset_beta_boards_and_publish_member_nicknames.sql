set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);
lock table public.open_talk_posts, public.open_talk_comments, public.topic_suggestions,
  public.topic_suggestion_interests, public.post_reactions in share row exclusive mode;

-- Clear the two confirmed beta boards only. Stop if anything arrived since review.
do $$
begin
  if (select count(*) from public.open_talk_posts)<>3
     or (select count(*) from public.topic_suggestions)<>3
     or exists(select 1 from public.open_talk_comments)
     or exists(select 1 from public.topic_suggestion_interests)
     or exists(select 1 from public.post_reactions where board='talk') then
    raise exception 'The two beta boards changed since they were reviewed';
  end if;
end;
$$;
delete from public.open_talk_posts;
delete from public.topic_suggestions;
delete from private.beta_bot_activity where event in ('post','reaction','suggestion','interest');

alter table public.topic_suggestions add column author_nickname text not null default '참여자';
grant select(author_nickname) on public.open_talk_posts,public.topic_suggestions to anon;

create function private.store_public_board_nickname()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  actor_role text := current_setting('role',true);
  profile_name text;
  bot_alias text;
begin
  if actor_role in ('anon','authenticated') then
    if TG_OP='UPDATE' then
      new.author_nickname:=old.author_nickname;
      return new;
    end if;
    select nickname into profile_name from public.member_profiles where user_id=auth.uid();
    if profile_name is null or new.author_nickname is distinct from profile_name then
      raise exception using errcode='22023', message='게시하려면 화면을 새로고침하고 닉네임 공개 안내를 확인해 주세요.';
    end if;
    if exists(select 1 from private.beta_bot_roster where nickname=profile_name) then
      raise exception using errcode='42501', message='AI 운영 닉네임은 시선 운영팀에서 사용합니다.';
    end if;
  elsif TG_TABLE_NAME='topic_suggestions' and TG_OP='INSERT' then
    select r.nickname into bot_alias from private.beta_bot_roster r
    where r.nickname=substring(new.title from '^\[([^]]+)\]');
    if bot_alias is not null then new.author_nickname:=bot_alias; end if;
  end if;
  return new;
end;
$$;
create trigger store_public_board_nickname before insert or update on public.open_talk_posts
for each row execute function private.store_public_board_nickname();
create trigger store_public_board_nickname before insert or update on public.open_talk_comments
for each row execute function private.store_public_board_nickname();
create trigger store_public_board_nickname before insert or update on public.topic_suggestions
for each row execute function private.store_public_board_nickname();
revoke execute on function private.store_public_board_nickname() from public,anon,authenticated;

update public.announcements set published=false,pinned=false,updated_at=now()
where title='익명 닉네임을 사용해도 서로를 비방할 수는 없습니다';
update public.announcements set body=replace(body,'익명 자유토론','자유게시판'),updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published;
