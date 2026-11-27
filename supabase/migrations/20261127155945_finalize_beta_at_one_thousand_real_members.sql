set local lock_timeout = '5s';

alter table private.beta_bot_stop add column cleaned_at timestamptz;

create function private.finalize_siseon_beta_bots()
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if not exists (select 1 from private.beta_bot_stop where cleaned_at is null) then
    return false;
  end if;
  perform pg_advisory_xact_lock(20261127,152);
  if not exists (select 1 from private.beta_bot_stop where cleaned_at is null) then
    return false;
  end if;

  -- Lock only tracked bot-written posts before testing for dependent comments.
  perform p.id from public.open_talk_posts p
  join private.beta_bot_activity a on a.target_id=p.id and a.event='post' and a.nickname=p.author_nickname
  order by p.id for update of p;

  -- Remove AI text while retaining a hidden parent record for member comments.
  update public.open_talk_posts p
     set title='베타 종료로 삭제된 AI 게시글', body='베타테스트 종료로 AI 작성 내용을 삭제했습니다.',
         status='removed',updated_at=now()
    from private.beta_bot_activity a
   where a.event='post' and a.target_id=p.id and a.nickname=p.author_nickname
     and exists (select 1 from public.open_talk_comments c where c.post_id=p.id);

  delete from public.open_talk_posts p
   using private.beta_bot_activity a
   where a.event='post' and a.target_id=p.id and a.nickname=p.author_nickname
     and not exists (select 1 from public.open_talk_comments c where c.post_id=p.id);

  delete from private.beta_bot_activity;
  delete from private.beta_bot_runs;
  update private.beta_bot_stop set cleaned_at=now() where cleaned_at is null;

  update public.announcements
     set summary='실제 회원 1,000명 달성으로 AI 운영봇 활동을 종료했습니다.',
         body='시선은 실제 회원 1,000명 도달로 AI 운영봇 베타를 종료했습니다. AI가 작성한 게시글은 공개 목록에서 내려갔고, AI 투표와 공감 기록은 정리됐습니다. 현재 투표 결과에는 실제 회원의 표만 반영됩니다. 회원이 작성한 글, 댓글과 투표 기록은 보존됩니다.',
         updated_at=now()
   where title='베타테스트 기간 AI 운영봇 참여 안내' and published;
  return true;
end;
$$;
revoke execute on function private.finalize_siseon_beta_bots() from public,anon,authenticated;
select cron.schedule('siseon-beta-bot-cleanup','*/5 * * * *','select private.finalize_siseon_beta_bots()');
select private.finalize_siseon_beta_bots();
