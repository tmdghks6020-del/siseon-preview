begin;
alter table public.topic_votes add column if not exists changed_at timestamptz;
create or replace function public.change_topic_vote(p_topic_id uuid,p_choice text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.member_profiles where user_id=auth.uid() and status in ('active','warned')) then raise exception 'member_required'; end if;
  perform 1 from public.topic_candidates where id=p_topic_id and status='approved' and published_at<=now() and least(expires_at,published_at+interval '30 days')>now() for share;
  if not found then raise exception 'vote_closed'; end if;
  update public.topic_votes set choice=p_choice,changed_at=now()
  where topic_id=p_topic_id and user_id=auth.uid() and changed_at is null and choice<>p_choice;
  if not found then raise exception 'vote_change_unavailable'; end if;
end $$;
revoke execute on function public.change_topic_vote(uuid,text) from public,anon;
grant execute on function public.change_topic_vote(uuid,text) to authenticated;

create or replace function public.is_topic_votable(p_topic_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.topic_candidates t where t.id=p_topic_id and t.status='approved' and t.published_at<=now() and least(t.expires_at,t.published_at+interval '30 days')>now())
$$;
create or replace function public.can_comment_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from public.topic_candidates t where t.id=p_topic_id and t.published_at<=now()
     and now()<t.published_at+interval '90 days'
     and (t.status='archived' or (t.status='approved' and
       (least(t.expires_at,t.published_at+interval '30 days')<=now() or exists(
          select 1 from public.topic_votes v where v.topic_id=t.id and v.user_id=auth.uid()))))
 )
$$;
drop policy issue_post_insert_after_vote on public.issue_posts;
create policy issue_post_insert_after_vote on public.issue_posts for insert to authenticated
with check(author_id=auth.uid() and public.can_comment_topic(topic_id) and exists(
 select 1 from public.topic_votes v where v.topic_id=issue_posts.topic_id and v.user_id=auth.uid() and v.choice=issue_posts.stance
));
create or replace function private.guard_issue_reaction_window()
returns trigger language plpgsql security definer set search_path='' as $$
declare board_key text; post_key uuid;
begin
 if tg_op='DELETE' then board_key:=old.board;post_key:=old.post_id;
 else board_key:=new.board;post_key:=new.post_id; end if;
 if auth.uid() is not null and board_key='issue' and not exists(
    select 1 from public.issue_posts p where p.id=post_key and p.status='published' and public.can_comment_topic(p.topic_id)
 ) then raise exception 'discussion_closed'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_issue_reaction_window before insert or update or delete on public.post_reactions
for each row execute function private.guard_issue_reaction_window();

create or replace function public.get_closed_poll_discussion(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.topic_candidates t where t.id=p_topic_id and t.published_at<=now()
   and (t.status='archived' or (t.status='approved' and least(t.expires_at,t.published_at+interval '30 days')<=now()))) then
   raise exception 'poll_not_closed';
 end if;
 return jsonb_build_object(
  'counts',coalesce((select jsonb_agg(to_jsonb(r)) from public.get_beta_poll_results(p_topic_id) r),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'stance',p.stance,'kind',p.kind,'title',p.title,'body',p.body,
   'source_url',p.source_url,'author_nickname',p.author_nickname,'created_at',p.created_at,
   'likes',(select count(*) from public.post_reactions r where r.board='issue' and r.post_id=p.id and r.reaction='like')) order by p.created_at desc,p.id)
   from public.issue_posts p where p.topic_id=p_topic_id and p.status='published'),'[]'::jsonb),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'post_id',c.post_id,'author_nickname',c.author_nickname,'body',c.body,'created_at',c.created_at) order by c.created_at,c.id)
   from public.issue_comments c join public.issue_posts p on p.id=c.post_id
   where p.topic_id=p_topic_id and p.status='published' and c.status='published'),'[]'::jsonb)
 );
end $$;
revoke execute on function public.get_closed_poll_discussion(uuid) from public;
grant execute on function public.get_closed_poll_discussion(uuid) to anon,authenticated;

alter table public.topic_suggestions add column if not exists review_note text, add column if not exists qualified_at timestamptz,
 add column if not exists candidate_id uuid references public.topic_candidates(id) on delete set null;
create or replace function private.finish_member_suggestions()
returns void language plpgsql security definer set search_path='' as $$
declare s public.topic_suggestions%rowtype; inserted_candidate uuid; supporters bigint;
begin
 for s in select * from public.topic_suggestions where status='pending' and qualified_at is null and created_at+interval '15 days'<=now() for update skip locked loop
   select count(*) into supporters from public.topic_suggestion_interests i join public.member_profiles m on m.user_id=i.user_id
    where i.suggestion_id=s.id and i.created_at<s.created_at+interval '15 days' and m.status in ('active','warned');
   if supporters>=10 then
     insert into public.topic_candidates(batch_id,category,title,intro,trending_reason,source,source_date,source_url,for_text,against_text,data_signals,created_by)
     values('member-suggestion-'||s.id,s.category,s.title,s.rationale,'공개 회원 제안 · 응원 '||supporters||'명','회원 제안',s.created_at::date,
        coalesce(s.source_url,''),s.for_text,s.against_text,jsonb_build_object('suggestionId',s.id,'manualReviewRequired',true),s.author_id)
     returning id into inserted_candidate;
     update public.topic_suggestions set candidate_id=inserted_candidate,qualified_at=s.created_at+interval '15 days' where id=s.id;
   else
     update public.topic_suggestions set status='rejected',review_note='기간 만료 · 목표 미달' where id=s.id;
   end if;
 end loop;
end $$;
revoke execute on function private.finish_member_suggestions() from public,anon,authenticated;
drop policy interests_self_insert on public.topic_suggestion_interests;
create policy interests_self_insert on public.topic_suggestion_interests for insert to authenticated with check(
 user_id=auth.uid() and exists(select 1 from public.member_profiles m where m.user_id=auth.uid() and m.status in ('active','warned'))
 and exists(select 1 from public.topic_suggestions s where s.id=suggestion_id and s.status='pending' and now()<s.created_at+interval '15 days')
);
drop policy interests_self_delete on public.topic_suggestion_interests;
create policy interests_self_delete on public.topic_suggestion_interests for delete to authenticated using(
 user_id=auth.uid() and exists(select 1 from public.topic_suggestions s where s.id=suggestion_id and s.status='pending' and now()<s.created_at+interval '15 days')
);
create or replace function private.sync_suggestion_candidate_decision()
returns trigger language plpgsql security definer set search_path='' as $
begin
 if new.status in ('approved','rejected','not_selected') then
   update public.topic_suggestions set
     status=case when new.status='approved' then 'approved' else 'rejected' end,
     review_note=new.decision_note
   where candidate_id=new.id;
 end if;
 return new;
end $;
create trigger sync_suggestion_candidate_decision after update of status,decision_note on public.topic_candidates
for each row execute function private.sync_suggestion_candidate_decision();
grant select (changed_at) on public.topic_votes to authenticated;

-- The proposal board closes at day 15. Qualified proposals remain in the
-- editorial queue and are visible to admins after the cutoff.
drop policy suggestions_public_read on public.topic_suggestions;
create policy suggestions_public_read on public.topic_suggestions for select
using (
  public.is_siseon_admin()
  or (status in ('pending','approved') and created_at+interval '15 days'>now())
);

select cron.schedule('siseon-finish-member-suggestions','* * * * *','select private.finish_member_suggestions()');
commit;
