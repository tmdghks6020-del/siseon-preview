alter table public.topic_candidates add column if not exists vote_options text[] not null default array['찬성','반대','판단 보류'];
create or replace function public.validate_topic_options() returns trigger language plpgsql set search_path='' as $$
begin
 if array_ndims(new.vote_options) <> 1 or cardinality(new.vote_options) not between 2 and 10
 or exists(select 1 from unnest(new.vote_options) x where x is null or char_length(btrim(x)) not between 1 and 60 or x <> btrim(x))
 or (select count(distinct x) from unnest(new.vote_options) x) <> cardinality(new.vote_options)
 then raise exception '선택지는 중복 없이 2~10개, 각각 1~60자로 입력하세요.'; end if;
 if tg_op='UPDATE' and old.vote_options is distinct from new.vote_options and
 (old.published_at is not null or exists(select 1 from public.topic_votes where topic_id=old.id))
 then raise exception '공개된 투표의 선택지는 변경할 수 없습니다.'; end if;
 return new;
end $$;
revoke all on function public.validate_topic_options() from public,anon,authenticated;
create trigger validate_topic_options before insert or update on public.topic_candidates for each row execute function public.validate_topic_options();

alter table public.topic_votes drop constraint if exists topic_votes_choice_check;
alter table public.issue_posts drop constraint if exists issue_posts_stance_check;
create schema if not exists private;
revoke all on schema private from public;
-- The trigger must read service-only candidates, while the original vote/post RLS
-- continues to enforce ownership, login, deadlines and one vote per member.
create or replace function private.validate_topic_selection() returns trigger language plpgsql security definer set search_path='' as $$
declare options text[]; selected text;
begin
 select vote_options into options from public.topic_candidates where id=new.topic_id for share;
 if tg_table_name='topic_votes' then selected:=new.choice; else selected:=new.stance; end if;
 if options is null or selected is null or not(selected=any(options)) then raise exception '이 안건에 없는 선택지입니다.'; end if;
 return new;
end $$;
revoke all on function private.validate_topic_selection() from public,anon,authenticated;
create trigger validate_topic_vote_selection before insert or update on public.topic_votes for each row execute function private.validate_topic_selection();
create trigger validate_issue_post_selection before insert or update on public.issue_posts for each row execute function private.validate_topic_selection();

