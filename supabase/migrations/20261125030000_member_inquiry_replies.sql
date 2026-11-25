create or replace function public.get_my_siseon_inquiries()
returns table(id uuid, title text, message text, created_at timestamptz, reply text, answered_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select i.id,i.title,i.message,i.created_at,case when i.answered_at is not null then i.admin_note end,i.answered_at
 from public.user_inquiries i
 where (select auth.uid()) is not null and i.user_id = (select auth.uid())
 order by i.created_at desc
$$;
revoke all on function public.get_my_siseon_inquiries() from public, anon;
grant execute on function public.get_my_siseon_inquiries() to authenticated;
create index if not exists user_inquiries_owner_created_idx on public.user_inquiries(user_id, created_at desc);