begin;
create extension if not exists pgcrypto;

create or replace function public.is_siseon_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
$$;
revoke all on function public.is_siseon_admin() from public;
grant execute on function public.is_siseon_admin() to authenticated;
grant execute on function public.is_siseon_admin() to anon;

create table if not exists public.member_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check(char_length(nickname) between 2 and 24),
 trust_level text not null default 'member' check(trust_level in ('member','trusted')),
 status text not null default 'active' check(status in ('active','warned','suspended','deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.create_siseon_member_profile()
returns trigger language plpgsql security definer set search_path=public as $$
declare picked text;
begin
 picked:=nullif(trim(coalesce(new.raw_user_meta_data->>'nickname','')),'');
 if picked is null then picked:='회원'||substr(replace(new.id::text,'-',''),1,8); end if;
 insert into public.member_profiles(user_id,nickname) values(new.id,left(picked,24)) on conflict(user_id) do nothing;
 insert into public.notification_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end $$;
drop trigger if exists on_siseon_auth_user_created on auth.users;
create trigger on_siseon_auth_user_created after insert on auth.users for each row execute function public.create_siseon_member_profile();

create table if not exists public.topic_votes(
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topic_candidates(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 choice text not null check(choice in ('찬성','반대','판단 보류')), created_at timestamptz not null default now(),
 unique(topic_id,user_id)
);
create index if not exists topic_votes_topic_idx on public.topic_votes(topic_id);
create table if not exists public.issue_posts(
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topic_candidates(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade, author_nickname text not null default '참여자', stance text not null check(stance in ('찬성','반대','판단 보류')),
 kind text not null default 'opinion' check(kind in ('opinion','question','source','correction')),
 title text not null check(char_length(title) between 2 and 120), body text not null check(char_length(body) between 1 and 10000),
 source_url text, status text not null default 'published' check(status in ('published','hidden','removed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists issue_posts_topic_idx on public.issue_posts(topic_id,status,created_at desc);
create table if not exists public.issue_comments(
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.issue_posts(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade, author_nickname text not null default '참여자', body text not null check(char_length(body) between 1 and 3000),
 status text not null default 'published' check(status in ('published','hidden','removed')), created_at timestamptz not null default now()
);
create table if not exists public.open_talk_posts(
 id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade, author_nickname text not null default '익명',
 category text not null, title text not null check(char_length(title) between 2 and 120),
 body text not null check(char_length(body) between 1 and 10000), status text not null default 'published' check(status in ('published','hidden','removed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists open_talk_posts_public_idx on public.open_talk_posts(status,created_at desc);
create table if not exists public.open_talk_comments(
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.open_talk_posts(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade, author_nickname text not null default '익명', body text not null check(char_length(body) between 1 and 3000),
 status text not null default 'published' check(status in ('published','hidden','removed')), created_at timestamptz not null default now()
);
create table if not exists public.topic_suggestions(
 id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id) on delete cascade,
 category text not null, title text not null check(char_length(title) between 2 and 160),
 rationale text not null check(char_length(rationale) between 1 and 5000), for_text text not null, against_text text not null, source_url text,
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.topic_suggestion_interests(
 suggestion_id uuid not null references public.topic_suggestions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(),
 primary key(suggestion_id,user_id)
);
create table if not exists public.announcements(
 id uuid primary key default gen_random_uuid(), category text not null, title text not null, summary text not null, body text not null,
 published boolean not null default false, pinned boolean not null default false,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_reports(
 id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id) on delete set null,
 target_type text not null, target_id uuid, reason text not null, details text not null default '',
 status text not null default 'pending' check(status in ('pending','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
);
create table if not exists public.user_inquiries(
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 category text not null, title text not null, sender text not null, message text not null,
 status text not null default 'pending' check(status in ('pending','answered','closed')), admin_note text not null default '', created_at timestamptz not null default now(), answered_at timestamptz
);
create table if not exists public.partnership_inquiries(
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 category text not null, title text not null, organization text not null, message text not null,
 status text not null default 'pending' check(status in ('pending','reviewing','answered','closed')), admin_note text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.notification_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade, new_topics boolean not null default true,
 comments_on_my_posts boolean not null default true, replies_to_my_comments boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.user_notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, title text not null, body text not null default '', target_path text, read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_idx on public.user_notifications(user_id,created_at desc);
create table if not exists public.member_daily_activity(
 user_id uuid not null references auth.users(id) on delete cascade, activity_date date not null default (now() at time zone 'Asia/Seoul')::date,
 visits integer not null default 0, active_seconds integer not null default 0, first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), primary key(user_id,activity_date)
);
create table if not exists public.admin_audit_log(
 id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
 action text not null, target text not null default '', reason text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.admin_site_state(
 state_key text primary key check(state_key='editorial'), payload jsonb not null default '{}'::jsonb,
 updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);

create or replace function public.record_member_visit(p_active_seconds integer default 0)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 insert into public.member_daily_activity(user_id,activity_date,visits,active_seconds)
 values(auth.uid(),(now() at time zone 'Asia/Seoul')::date,1,least(greatest(coalesce(p_active_seconds,0),0),3600))
 on conflict(user_id,activity_date) do update set visits=member_daily_activity.visits+1,
 active_seconds=least(member_daily_activity.active_seconds+least(greatest(coalesce(p_active_seconds,0),0),3600),86400),last_seen_at=now();
end $$;
create or replace function public.record_member_active_seconds(p_seconds integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 insert into public.member_daily_activity(user_id,activity_date,visits,active_seconds)
 values(auth.uid(),(now() at time zone 'Asia/Seoul')::date,0,least(greatest(coalesce(p_seconds,0),0),300))
 on conflict(user_id,activity_date) do update set active_seconds=least(member_daily_activity.active_seconds+least(greatest(coalesce(p_seconds,0),0),300),86400),last_seen_at=now();
end $$;
create or replace function public.get_topic_vote_results(p_topic_id uuid)
returns table(choice text,vote_count bigint) language plpgsql stable security definer set search_path=public as $$
begin
 -- Active poll results remain hidden until the signed-in member votes.
 -- Archived polls are readable to signed-in members, as the archive UI allows.
 if auth.uid() is null or (
   not exists(select 1 from public.topic_votes where topic_id=p_topic_id and user_id=auth.uid())
   and not public.is_topic_archived(p_topic_id)
 ) then raise exception 'vote_required'; end if;
 return query select v.choice,count(*) from public.topic_votes v where v.topic_id=p_topic_id group by v.choice;
end $$;
create or replace function public.is_topic_votable(p_topic_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.topic_candidates t where t.id=p_topic_id and t.status='approved' and (t.expires_at is null or t.expires_at>now()))
$$;
create or replace function public.is_topic_archived(p_topic_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.topic_candidates t where t.id=p_topic_id and t.status='archived')
$$;
create or replace function public.can_comment_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.topic_candidates t where t.id=p_topic_id and
   ((t.status='approved' and exists(select 1 from public.topic_votes v where v.topic_id=t.id and v.user_id=auth.uid()))
    or (t.status='archived' and t.archived_at>now()-interval '90 days')))
$$;
create or replace function public.get_topic_suggestion_counts()
returns table(suggestion_id uuid,interest_count bigint) language sql stable security definer set search_path=public as $$
 select s.id,count(i.user_id) from public.topic_suggestions s left join public.topic_suggestion_interests i on i.suggestion_id=s.id
 where s.status='pending' group by s.id
$$;
create or replace function public.get_topic_suggestion_count(p_suggestion_id uuid)
returns bigint language sql stable security definer set search_path=public as $$
 select count(*) from public.topic_suggestion_interests i join public.topic_suggestions s on s.id=i.suggestion_id where i.suggestion_id=p_suggestion_id and s.status='pending'
$$;
revoke all on function public.is_topic_votable(uuid),public.is_topic_archived(uuid),public.can_comment_topic(uuid),public.get_topic_suggestion_counts(),public.get_topic_suggestion_count(uuid) from public;
grant execute on function public.is_topic_votable(uuid),public.is_topic_archived(uuid),public.can_comment_topic(uuid) to authenticated;
grant execute on function public.get_topic_suggestion_counts(),public.get_topic_suggestion_count(uuid) to anon,authenticated;

do $$
declare t text;
begin
 foreach t in array array['member_profiles','topic_votes','issue_posts','issue_comments','open_talk_posts','open_talk_comments','topic_suggestions','topic_suggestion_interests','announcements','user_reports','user_inquiries','partnership_inquiries','notification_preferences','user_notifications','member_daily_activity','admin_audit_log','admin_site_state']
 loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop;
end $$;
grant select,insert,update on public.member_profiles to authenticated;
grant select,insert on public.admin_audit_log to authenticated;
grant select,insert,update on public.admin_site_state to authenticated;
grant usage,select on sequence public.admin_audit_log_id_seq to authenticated;
grant select,insert on public.topic_votes to authenticated;
grant select,insert,update on public.issue_posts,public.issue_comments,public.open_talk_posts,public.open_talk_comments to authenticated;
grant select,insert,update,delete on public.topic_suggestions,public.topic_suggestion_interests to authenticated;
grant select,insert,update,delete on public.announcements to authenticated;
grant insert on public.user_reports,public.user_inquiries,public.partnership_inquiries to anon,authenticated;
grant update on public.user_reports,public.user_inquiries,public.partnership_inquiries to authenticated;
grant select (id,category,title,status,created_at) on public.open_talk_posts to anon;
grant select (id,category,title,status,created_at) on public.topic_suggestions to anon;
grant select on public.open_talk_posts,public.topic_suggestions to authenticated;
grant select,update on public.user_reports,public.user_inquiries,public.partnership_inquiries to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select,update on public.user_notifications to authenticated;
grant select on public.member_daily_activity to authenticated;
grant execute on function public.record_member_visit(integer),public.record_member_active_seconds(integer),public.get_topic_vote_results(uuid) to authenticated;
grant delete on public.topic_suggestion_interests to authenticated;

create policy member_profile_self_read on public.member_profiles for select to authenticated using(user_id=auth.uid() or public.is_siseon_admin());
create policy member_profile_self_insert on public.member_profiles for insert to authenticated with check(user_id=auth.uid());
create policy member_profile_self_update on public.member_profiles for update to authenticated using(user_id=auth.uid() or public.is_siseon_admin()) with check(user_id=auth.uid() or public.is_siseon_admin());
create policy vote_self_read on public.topic_votes for select to authenticated using(user_id=auth.uid() or public.is_siseon_admin());
create policy vote_insert_once on public.topic_votes for insert to authenticated with check(user_id=auth.uid() and public.is_topic_votable(topic_id));
create policy issue_post_read_after_vote on public.issue_posts for select to authenticated using(public.is_siseon_admin() or (status='published' and (exists(select 1 from public.topic_votes v where v.topic_id=issue_posts.topic_id and v.user_id=auth.uid()) or public.is_topic_archived(topic_id))));
create policy issue_post_insert_after_vote on public.issue_posts for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.topic_votes v where v.topic_id=issue_posts.topic_id and v.user_id=auth.uid()));
create policy issue_post_owner_update on public.issue_posts for update to authenticated using(author_id=auth.uid() or public.is_siseon_admin()) with check(author_id=auth.uid() or public.is_siseon_admin());
create policy issue_comment_read on public.issue_comments for select to authenticated using(public.is_siseon_admin() or (status='published' and exists(select 1 from public.issue_posts p where p.id=post_id)));
create policy issue_comment_insert_after_vote on public.issue_comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.issue_posts p where p.id=post_id and public.can_comment_topic(p.topic_id)));
create policy issue_comment_owner_update on public.issue_comments for update to authenticated using(author_id=auth.uid() or public.is_siseon_admin());
create policy open_talk_public_read on public.open_talk_posts for select to anon,authenticated using(status='published' or (auth.role()='authenticated' and public.is_siseon_admin()));
create policy open_talk_auth_insert on public.open_talk_posts for insert to authenticated with check(author_id=auth.uid());
create policy open_talk_owner_update on public.open_talk_posts for update to authenticated using(author_id=auth.uid() or public.is_siseon_admin());
create policy open_talk_comment_read on public.open_talk_comments for select to authenticated using(public.is_siseon_admin() or (status='published' and exists(select 1 from public.open_talk_posts p where p.id=post_id and p.status='published')));
create policy open_talk_comment_insert on public.open_talk_comments for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.open_talk_posts p where p.id=post_id and p.status='published'));
create policy open_talk_comment_update on public.open_talk_comments for update to authenticated using(author_id=auth.uid() or public.is_siseon_admin());
create policy suggestions_public_read on public.topic_suggestions for select to anon,authenticated using(status in ('pending','approved') or (auth.role()='authenticated' and public.is_siseon_admin()));
create policy suggestions_auth_insert on public.topic_suggestions for insert to authenticated with check(author_id=auth.uid());
create policy suggestions_owner_update on public.topic_suggestions for update to authenticated using(author_id=auth.uid() or public.is_siseon_admin());
create policy interests_auth_read on public.topic_suggestion_interests for select to authenticated using(user_id=auth.uid() or public.is_siseon_admin());
create policy interests_self_insert on public.topic_suggestion_interests for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.topic_suggestions s where s.id=suggestion_id and s.status='pending'));
create policy interests_self_delete on public.topic_suggestion_interests for delete to authenticated using(user_id=auth.uid());
create policy announcements_public_read on public.announcements for select to anon,authenticated using(published or public.is_siseon_admin());
create policy announcements_admin_write on public.announcements for all to authenticated using(public.is_siseon_admin()) with check(public.is_siseon_admin());
create policy reports_insert_any on public.user_reports for insert to anon,authenticated with check(reporter_id is null or reporter_id=auth.uid());
create policy reports_admin_read on public.user_reports for select to authenticated using(public.is_siseon_admin());
create policy reports_admin_update on public.user_reports for update to authenticated using(public.is_siseon_admin()) with check(public.is_siseon_admin());
create policy inquiry_insert_any on public.user_inquiries for insert to anon,authenticated with check(user_id is null or user_id=auth.uid());
create policy inquiry_admin_read on public.user_inquiries for select to authenticated using(public.is_siseon_admin());
create policy inquiry_admin_update on public.user_inquiries for update to authenticated using(public.is_siseon_admin());
create policy partnership_insert_any on public.partnership_inquiries for insert to anon,authenticated with check(user_id is null or user_id=auth.uid());
create policy partnership_admin_read on public.partnership_inquiries for select to authenticated using(public.is_siseon_admin());
create policy partnership_admin_update on public.partnership_inquiries for update to authenticated using(public.is_siseon_admin());
create policy preference_self_access on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notification_self_access on public.user_notifications for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy activity_self_read on public.member_daily_activity for select to authenticated using(user_id=auth.uid() or public.is_siseon_admin());
create policy audit_admin_read on public.admin_audit_log for select to authenticated using(public.is_siseon_admin());
create policy audit_admin_insert on public.admin_audit_log for insert to authenticated with check(actor_id=auth.uid() and public.is_siseon_admin());
create policy admin_site_state_admin_access on public.admin_site_state for all to authenticated using(public.is_siseon_admin()) with check(public.is_siseon_admin());

create or replace function public.notify_topic_published()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='approved' and old.status is distinct from 'approved' then
   insert into public.user_notifications(user_id,kind,title,body,target_path)
   select u.id,'new_topic','새 투표가 등록됐습니다',new.title,'?issue=topic-'||new.id::text
   from auth.users u left join public.notification_preferences p on p.user_id=u.id
   where u.id is distinct from new.created_by and coalesce(p.new_topics,true);
 end if;
 return new;
end $$;
drop trigger if exists topic_published_notification on public.topic_candidates;
create trigger topic_published_notification after update of status on public.topic_candidates for each row execute function public.notify_topic_published();

create or replace function public.notify_issue_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid; topic_title text;
begin
 select p.author_id,p.title into owner_id,topic_title from public.issue_posts p where p.id=new.post_id;
 if owner_id is not null and owner_id<>new.author_id and not exists(select 1 from public.notification_preferences n where n.user_id=owner_id and not n.comments_on_my_posts) then
   insert into public.user_notifications(user_id,kind,title,body,target_path) values(owner_id,'post_comment','내 토론 글에 댓글이 달렸습니다',left(new.body,180),'?issue=topic-'||(select p.topic_id::text from public.issue_posts p where p.id=new.post_id));
 end if;
 return new;
end $$;
drop trigger if exists issue_comment_notification on public.issue_comments;
create trigger issue_comment_notification after insert on public.issue_comments for each row execute function public.notify_issue_comment();

create or replace function public.notify_open_talk_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
 select p.author_id into owner_id from public.open_talk_posts p where p.id=new.post_id;
 if owner_id is not null and owner_id<>new.author_id and not exists(select 1 from public.notification_preferences n where n.user_id=owner_id and not n.comments_on_my_posts) then
   insert into public.user_notifications(user_id,kind,title,body,target_path) values(owner_id,'post_comment','내 익명 토론 글에 댓글이 달렸습니다',left(new.body,180),'?view=open-talk');
 end if;
 return new;
end $$;
drop trigger if exists open_talk_comment_notification on public.open_talk_comments;
create trigger open_talk_comment_notification after insert on public.open_talk_comments for each row execute function public.notify_open_talk_comment();

insert into public.announcements(category,title,summary,body,published,pinned)
select v.category,v.title,v.summary,v.body,true,v.pinned from (values
 ('운영 원칙','시선은 사람보다 주장에 집중합니다','근거를 나누고 서로 다른 관점을 존중하는 대화를 지향합니다.','비판은 주장·자료·정책을 대상으로 해 주세요. 상대를 공격하거나 조롱하지 말고 사실과 해석을 구분해 주세요.',true),
 ('이용 안내','익명 닉네임을 사용해도 서로를 비방할 수는 없습니다','실명 대신 닉네임으로 참여할 수 있으며 인격 공격과 개인정보 공개는 금지됩니다.','욕설·협박·혐오 표현·개인정보 공개·도배는 허용되지 않습니다. 위반 게시물은 맥락과 피해 정도를 확인해 처리합니다.',false),
 ('신고와 제재','신고 접수와 단계별 조치 기준을 안내합니다','신고를 검토한 뒤 위반 정도와 반복 여부에 따라 조치합니다.','신고만으로 자동 제재하지 않습니다. 운영자가 앞뒤 대화와 맥락을 확인하고 안내, 경고, 게시물 숨김·삭제, 이용 정지 순으로 검토합니다.',false),
 ('투표 안내','투표 결과는 투표한 뒤 확인할 수 있습니다','인증된 계정은 이슈마다 한 번 투표하고 이후 결과와 토론을 확인합니다.','각 투표는 매일 오전 7시에 공개되고 30일차에 마감됩니다. 보관 후 90일 동안 댓글을 허용하고 이후 읽기 전용으로 전환합니다.',false),
 ('안전과 개인정보','안전한 토론을 위해 신고와 개인정보를 보호합니다','신고 내용은 운영 검토에 사용하고 개인정보 노출 게시물은 신속히 처리합니다.','전화번호·주소·계정 정보 등 식별 정보를 허락 없이 게시하지 마세요. 신고자 정보는 운영 업무에 필요한 범위에서만 확인합니다.',false)
) as v(category,title,summary,body,pinned) where not exists(select 1 from public.announcements a where a.title=v.title);
commit;
