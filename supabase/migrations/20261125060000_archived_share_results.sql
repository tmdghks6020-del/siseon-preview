create function public.get_archived_share_results(p_topics uuid[])
returns table(topic_id uuid, choice text, vote_count bigint)
language sql stable security definer set search_path='' as $$
  select t.id, v.choice, count(*)
  from public.topic_candidates t join public.topic_votes v on v.topic_id=t.id
  where t.id in (select unnest(p_topics) limit 100)
    and t.status='archived' and t.published_at is not null
  group by t.id, v.choice
$$;
revoke all on function public.get_archived_share_results(uuid[]) from public;
grant execute on function public.get_archived_share_results(uuid[]) to anon,authenticated;