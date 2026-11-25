create table public.post_reactions (
 board text not null check (board in ('issue','talk')),
 post_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null check (reaction = 'like' or (board = 'issue' and reaction = 'differ')),
 primary key (board,post_id,user_id)
);
alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from public,anon,authenticated;

create function private.reaction_post_visible(p_board text,p_post uuid) returns boolean
language sql stable security invoker set search_path='' as $$
select auth.uid() is not null and (
 (p_board='talk' and exists(select 1 from public.open_talk_posts p where p.id=p_post and p.status='published'))
 or (p_board='issue' and exists(select 1 from public.issue_posts p where p.id=p_post and p.status='published' and
 (exists(select 1 from public.topic_votes v where v.topic_id=p.topic_id and v.user_id=auth.uid()) or public.is_topic_archived(p.topic_id))))
)
$$;
revoke all on function private.reaction_post_visible(text,uuid) from public,anon,authenticated;

create function public.get_post_reactions(p_board text,p_posts uuid[])
returns table(post_id uuid,likes bigint,differs bigint,mine text)
language sql stable security definer set search_path='' as $$
 select p.id,count(*) filter(where r.reaction='like'),count(*) filter(where r.reaction='differ'),
 max(r.reaction) filter(where r.user_id=auth.uid())
 from (select distinct id from unnest(p_posts) as x(id) limit 500) p
 left join public.post_reactions r on r.board=p_board and r.post_id=p.id
 where private.reaction_post_visible(p_board,p.id)
 group by p.id
$$;
create function public.set_post_reaction(p_board text,p_post uuid,p_reaction text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.reaction_post_visible(p_board,p_post),false) then raise exception 'post_unavailable'; end if;
 if p_reaction is null then
   delete from public.post_reactions where board=p_board and post_id=p_post and user_id=auth.uid();
 else
   insert into public.post_reactions(board,post_id,user_id,reaction) values(p_board,p_post,auth.uid(),p_reaction)
   on conflict(board,post_id,user_id) do update set reaction=excluded.reaction;
 end if;
end $$;
revoke all on function public.get_post_reactions(text,uuid[]),public.set_post_reaction(text,uuid,text) from public,anon;
grant execute on function public.get_post_reactions(text,uuid[]),public.set_post_reaction(text,uuid,text) to authenticated;