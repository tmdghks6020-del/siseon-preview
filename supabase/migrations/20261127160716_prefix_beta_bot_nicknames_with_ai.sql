set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);
create temp table beta_alias_map on commit drop as
with old_names as (
  select nickname,row_number() over(order by
    case nickname when '시선봄 AI' then 0 when '시선온 AI' then 1 else 2 end,nickname) n
  from private.beta_bot_roster
), generated as (
  select 'AI '||stem||ending nickname, row_number() over(order by s,e) n
  from unnest(array['솔','달','별','빛','꽃','샘','온','결','나','담']) with ordinality as stems(stem,s)
  cross join unnest(array['이','아','우','미','유','수','리','진','하','지']) with ordinality as endings(ending,e)
)
select o.nickname old_name,case o.n when 1 then 'AI 순이' when 2 then 'AI 봄이' else g.nickname end new_name
from old_names o join generated g on g.n=o.n;
do $$begin
  if (select count(distinct new_name) from beta_alias_map)<>100 then raise exception 'expected 100 AI aliases'; end if;
end$$;

update public.open_talk_posts p
set author_nickname=m.new_name,
    title=case when left(p.title,length(m.old_name)+2)='['||m.old_name||']'
      then '['||m.new_name||']'||substring(p.title from length(m.old_name)+3) else p.title end
from private.beta_bot_activity a join beta_alias_map m on m.old_name=a.nickname
where a.event='post' and a.target_id=p.id and p.author_nickname=m.old_name;

update public.topic_suggestions s
set title='['||m.new_name||']'||substring(s.title from length(m.old_name)+3)
from private.beta_bot_activity a join beta_alias_map m on m.old_name=a.nickname
where a.event='suggestion' and a.target_id=s.id and left(s.title,length(m.old_name)+2)='['||m.old_name||']';

alter table private.beta_bot_activity drop constraint beta_bot_activity_nickname_fkey;
alter table private.beta_bot_activity add foreign key(nickname) references private.beta_bot_roster(nickname) on update cascade;
update private.beta_bot_roster r set nickname=m.new_name from beta_alias_map m where m.old_name=r.nickname;

update public.announcements set body=replace(body,'닉네임 뒤에 AI를 표시하고','‘AI 순이’, ‘AI 봄이’처럼 닉네임 앞에 AI를 표시하고'),updated_at=now()
where title='베타테스트 기간 AI 운영봇 참여 안내' and published and not exists(select 1 from private.beta_bot_stop);