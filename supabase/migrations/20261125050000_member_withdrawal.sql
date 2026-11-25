create table private.withdrawal_secret (secret bytea not null);
insert into private.withdrawal_secret values(extensions.gen_random_bytes(32));
create table private.withdrawn_votes(topic_id uuid references public.topic_candidates(id) on delete cascade, mark bytea not null, expires_at timestamptz not null, primary key(topic_id,mark));
create table private.withdrawal_history(id bigint generated always as identity primary key, reason text not null, created_at timestamptz not null default now());
revoke all on private.withdrawal_secret,private.withdrawn_votes,private.withdrawal_history from public,anon,authenticated;
alter table public.topic_votes alter column user_id drop not null;
alter table public.topic_votes drop constraint topic_votes_user_id_fkey;
alter table public.topic_votes add foreign key(user_id) references auth.users(id) on delete set null;
create function private.kakao_vote_mark(u uuid,t uuid) returns bytea language sql stable set search_path='' as $$
 select extensions.hmac(convert_to(t::text||':'||i.provider_id,'UTF8'),s.secret,'sha256') from auth.identities i cross join private.withdrawal_secret s where i.user_id=u and i.provider='kakao' limit 1
$$;
revoke all on function private.kakao_vote_mark(uuid,uuid) from public,anon,authenticated;
create function private.block_withdrawn_vote() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=new.user_id for key share;
 if exists(select 1 from private.withdrawn_votes w where w.topic_id=new.topic_id and w.expires_at>now() and w.mark=private.kakao_vote_mark(new.user_id,new.topic_id)) then
 raise exception 'kakao_vote_already_cast' using errcode='23505'; end if;
 return new;
end $$;
revoke all on function private.block_withdrawn_vote() from public,anon,authenticated;
create trigger block_withdrawn_vote before insert on public.topic_votes for each row execute function private.block_withdrawn_vote();
create function public.withdraw_siseon_member(p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or public.is_siseon_admin() or char_length(coalesce(btrim(p_reason),'')) not between 2 and 500 then raise exception 'withdrawal_unavailable'; end if;
 perform 1 from auth.users where id=u for update;
 if not found or not exists(select 1 from auth.identities where user_id=u and provider='kakao') then raise exception 'withdrawal_unavailable'; end if;
 insert into private.withdrawn_votes select v.topic_id,private.kakao_vote_mark(u,v.topic_id),t.expires_at from public.topic_votes v join public.topic_candidates t on t.id=v.topic_id where v.user_id=u and t.status='approved' and t.expires_at>now() on conflict do nothing;
 insert into private.withdrawal_history(reason) values(btrim(p_reason));
 delete from auth.users where id=u;
end $$;
create function public.get_siseon_withdrawals(p_today boolean,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d timestamptz:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
 if auth.uid() is null or not public.is_siseon_admin() then raise exception 'admin_required'; end if;
 return jsonb_build_object('total',(select count(*) from private.withdrawal_history),'today',(select count(*) from private.withdrawal_history where created_at>=d),'rows',(select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc),'[]'::jsonb) from (select reason,created_at from private.withdrawal_history where not p_today or created_at>=d order by created_at desc,id limit 30 offset greatest(p_offset,0)) w));
end $$;
revoke all on function public.withdraw_siseon_member(text),public.get_siseon_withdrawals(boolean,integer) from public,anon;
grant execute on function public.withdraw_siseon_member(text),public.get_siseon_withdrawals(boolean,integer) to authenticated;
select cron.schedule('siseon-withdrawal-cleanup','*/15 * * * *',$$delete from private.withdrawn_votes where expires_at<=now(); delete from private.withdrawal_history where created_at<now()-interval '90 days';$$);