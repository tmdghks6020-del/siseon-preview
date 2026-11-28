set local lock_timeout='5s';
select pg_advisory_xact_lock(20261127,152);

alter table private.beta_bot_four_hour_runs
  add column status text not null default 'completed',
  add column context jsonb not null default '{}'::jsonb,
  add column attempts smallint not null default 0,
  add column updated_at timestamptz not null default now(),
  add column last_error text;
alter table private.beta_bot_four_hour_runs
  add constraint beta_bot_four_hour_runs_status_check
  check(status in ('generating','completed','failed'));

create or replace function public.prepare_siseon_beta_bot_run()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_slot timestamptz := date_bin(interval '4 hours', statement_timestamp(), timestamptz '2000-01-01 00:00:00+09');
  v_run_day date := (date_bin(interval '4 hours', statement_timestamp(), timestamptz '2000-01-01 00:00:00+09') at time zone 'Asia/Seoul')::date;
  v_topics uuid[];
  v_bots text[];
  v_topics_json jsonb;
  v_votes jsonb := '[]'::jsonb;
  v_issue_prompts jsonb := '[]'::jsonb;
  v_talk_prompts jsonb := '[]'::jsonb;
  v_suggestion_prompt jsonb;
  v_context jsonb;
  v_status text;
  v_attempts smallint;
  v_updated_at timestamptz;
  v_topic record;
  v_vote record;
  v_bot text;
  v_choice text;
  v_index integer;
  v_k integer;
  v_admin_id uuid;
begin
  perform pg_advisory_xact_lock(20261127,152);
  perform private.check_beta_member_limit();
  if exists(select 1 from private.beta_bot_stop) then return jsonb_build_object('ready',false,'reason','stopped'); end if;
  select user_id into v_admin_id from public.user_roles where role='admin' order by user_id limit 1;
  if v_admin_id is null then return jsonb_build_object('ready',false,'reason','admin_missing'); end if;

  select r.status,r.attempts,r.updated_at into v_status,v_attempts,v_updated_at
  from private.beta_bot_four_hour_runs r where r.slot_start=v_slot for update;
  if found then
    if v_status='completed' then return jsonb_build_object('ready',false,'reason','already_completed'); end if;
    if v_status='generating' then return jsonb_build_object('ready',false,'reason','already_generating'); end if;
    if v_status='failed' and (v_attempts>=2 or v_updated_at>v_now-interval '10 minutes') then
      return jsonb_build_object('ready',false,'reason','retry_later');
    end if;
  end if;

  select array_agg(t.id order by random()) into v_topics
  from public.topic_candidates t
  where t.status='approved' and t.published_at<=v_now and t.expires_at>v_now and cardinality(t.vote_options)>0;
  if v_topics is null or cardinality(v_topics)=0 then return jsonb_build_object('ready',false,'reason','no_active_topics'); end if;
  select array_agg(s.nickname) into v_bots from
    (select nickname from private.beta_bot_roster order by random() limit 3) s;
  if cardinality(v_bots) is distinct from 3 then return jsonb_build_object('ready',false,'reason','bot_roster_incomplete'); end if;

  select jsonb_agg(jsonb_build_object(
    'id',t.id,'title',t.title,'category',t.category,'intro',t.intro,
    'facts',coalesce(t.facts,'[]'::jsonb),'forText',t.for_text,'againstText',t.against_text,
    'voteOptions',to_jsonb(t.vote_options)
  ) order by selected.ordinality)
  into v_topics_json
  from unnest(v_topics) with ordinality selected(id,ordinality)
  join public.topic_candidates t on t.id=selected.id;

  for v_vote in
    select b.nickname as bot,t.id as topic_id,t.vote_options
    from unnest(v_bots) as b(nickname)
    cross join unnest(v_topics) as ids(topic_id)
    join public.topic_candidates t on t.id=ids.topic_id
  loop
    select a.detail into v_choice from private.beta_bot_activity a
    where a.event='vote' and a.nickname=v_vote.bot and a.target_id=v_vote.topic_id;
    if v_choice is null or not (v_choice=any(v_vote.vote_options)) then
      v_choice:=v_vote.vote_options[1+floor(random()*cardinality(v_vote.vote_options))::integer];
    end if;
    v_votes:=v_votes||jsonb_build_array(jsonb_build_object('bot',v_vote.bot,'topicId',v_vote.topic_id,'choice',v_choice));
  end loop;

  for v_k in 1..least(3,cardinality(v_topics)) loop
    v_bot:=v_bots[v_k];
    select * into v_topic from public.topic_candidates t where t.id=v_topics[v_k];
    select x->>'choice' into v_choice from jsonb_array_elements(v_votes) x
    where x->>'bot'=v_bot and x->>'topicId'=v_topic.id::text limit 1;
    v_issue_prompts:=v_issue_prompts||jsonb_build_array(jsonb_build_object(
      'bot',v_bot,'topicId',v_topic.id,'title',v_topic.title,'category',v_topic.category,
      'intro',v_topic.intro,'facts',coalesce(v_topic.facts,'[]'::jsonb),
      'forText',v_topic.for_text,'againstText',v_topic.against_text,'stance',v_choice
    ));
  end loop;

  for v_k in 1..2 loop
    v_index:=least(v_k,cardinality(v_topics));
    v_bot:=v_bots[v_k];
    select * into v_topic from public.topic_candidates t where t.id=v_topics[v_index];
    v_talk_prompts:=v_talk_prompts||jsonb_build_array(jsonb_build_object(
      'bot',v_bot,'topicId',v_topic.id,'title',v_topic.title,'category',v_topic.category,
      'intro',v_topic.intro,'facts',coalesce(v_topic.facts,'[]'::jsonb),
      'forText',v_topic.for_text,'againstText',v_topic.against_text,
      'angle',case when v_k=1 then '생활에서 직접 마주치는 선택과 경험' else '규칙을 적용할 때의 형평성과 예외' end
    ));
  end loop;

  v_index:=least(3,cardinality(v_topics));
  v_bot:=v_bots[3];
  select * into v_topic from public.topic_candidates t where t.id=v_topics[v_index];
  v_suggestion_prompt:=jsonb_build_object(
    'bot',v_bot,'topicId',v_topic.id,'title',v_topic.title,'category',v_topic.category,
    'intro',v_topic.intro,'facts',coalesce(v_topic.facts,'[]'::jsonb),
    'forText',v_topic.for_text,'againstText',v_topic.against_text
  );
  v_context:=jsonb_build_object(
    'slotStart',v_slot,'runDay',v_run_day,'bots',to_jsonb(v_bots),'topics',v_topics_json,
    'votes',v_votes,'issuePrompts',v_issue_prompts,'talkPrompts',v_talk_prompts,
    'suggestionPrompt',v_suggestion_prompt
  );
  if v_status is null then
    insert into private.beta_bot_four_hour_runs(slot_start,status,context,attempts,updated_at,last_error)
    values(v_slot,'generating',v_context,1,v_now,null);
  else
    update private.beta_bot_four_hour_runs
    set status='generating',context=v_context,attempts=attempts+1,updated_at=v_now,last_error=null
    where slot_start=v_slot and status='failed';
  end if;
  return jsonb_build_object('ready',true,'slotStart',v_slot,'context',v_context);
end;
$$;
revoke all on function public.prepare_siseon_beta_bot_run() from public,anon,authenticated;
grant execute on function public.prepare_siseon_beta_bot_run() to service_role;

create or replace function public.complete_siseon_beta_bot_run(p_slot_start timestamptz,p_generated jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_context jsonb;
  v_run_day date;
  v_admin_id uuid;
  v_bots text[];
  v_item record;
  v_context_item jsonb;
  v_created_id uuid;
  v_first_post uuid;
  v_reaction_target uuid;
  v_interest_target uuid;
  v_bot text;
  v_issue_count integer;
  v_talk_count integer;
begin
  perform pg_advisory_xact_lock(20261127,152);
  select r.context into v_context from private.beta_bot_four_hour_runs r
  where r.slot_start=p_slot_start and r.status='generating' for update;
  if not found then return jsonb_build_object('ok',false,'reason','run_not_claimed'); end if;
  if jsonb_typeof(p_generated->'issuePosts')<>'array' or jsonb_typeof(p_generated->'talkPosts')<>'array'
    or jsonb_typeof(p_generated->'suggestion')<>'object' then raise exception 'invalid_generated_payload'; end if;
  v_issue_count:=jsonb_array_length(p_generated->'issuePosts');
  v_talk_count:=jsonb_array_length(p_generated->'talkPosts');
  if v_issue_count<>jsonb_array_length(v_context->'issuePrompts') or v_talk_count<>2 then
    raise exception 'generated_payload_count_mismatch';
  end if;
  v_run_day:=(p_slot_start at time zone 'Asia/Seoul')::date;
  select user_id into v_admin_id from public.user_roles where role='admin' order by user_id limit 1;
  if v_admin_id is null then raise exception 'admin_required'; end if;
  select array_agg(bot) into v_bots from jsonb_array_elements_text(v_context->'bots') as b(bot);

  insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
  select vote->>'bot','vote',(vote->>'topicId')::uuid,vote->>'choice',v_run_day
  from jsonb_array_elements(v_context->'votes') as votes(vote)
  on conflict (nickname,target_id) where event='vote' do nothing;

  for v_item in select value,ordinality from jsonb_array_elements(p_generated->'issuePosts') with ordinality
  loop
    v_context_item:=v_context->'issuePrompts'->(v_item.ordinality-1);
    insert into public.issue_posts(topic_id,author_id,author_nickname,stance,kind,title,body)
    values((v_context_item->>'topicId')::uuid,v_admin_id,v_context_item->>'bot',v_context_item->>'stance',
      'opinion',v_item.value->>'title',v_item.value->>'body')
    returning id into v_created_id;
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(v_context_item->>'bot','issue_post',v_created_id,v_context_item->>'topicId',v_run_day);
  end loop;

  for v_item in select value,ordinality from jsonb_array_elements(p_generated->'talkPosts') with ordinality
  loop
    v_context_item:=v_context->'talkPrompts'->(v_item.ordinality-1);
    insert into public.open_talk_posts(author_id,author_nickname,category,title,body)
    values(v_admin_id,v_context_item->>'bot','자유',v_item.value->>'title',v_item.value->>'body')
    returning id into v_created_id;
    if v_first_post is null then v_first_post:=v_created_id; end if;
    insert into private.beta_bot_activity(nickname,event,target_id,run_day)
    values(v_context_item->>'bot','post',v_created_id,v_run_day);
  end loop;

  v_context_item:=v_context->'suggestionPrompt';
  insert into public.topic_suggestions(author_id,author_nickname,category,title,rationale,for_text,against_text)
  values(v_admin_id,v_context_item->>'bot',p_generated->'suggestion'->>'category',
    p_generated->'suggestion'->>'title',p_generated->'suggestion'->>'rationale',
    p_generated->'suggestion'->>'forText',p_generated->'suggestion'->>'againstText')
  returning id into v_created_id;
  insert into private.beta_bot_activity(nickname,event,target_id,run_day)
  values(v_context_item->>'bot','suggestion',v_created_id,v_run_day);

  v_bot:=v_bots[1];
  select p.id into v_reaction_target from public.open_talk_posts p
  where p.status='published'
    and not exists(select 1 from private.beta_bot_roster r where r.nickname=p.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='reaction' and a.nickname=v_bot and a.target_id=p.id)
  order by p.created_at desc,p.id desc limit 1;
  if v_reaction_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(v_bot,'reaction',v_reaction_target,'공감',v_run_day) on conflict do nothing;
  end if;

  v_bot:=v_bots[3];
  select s.id into v_interest_target from public.topic_suggestions s
  where s.status='pending'
    and not exists(select 1 from private.beta_bot_roster r where r.nickname=s.author_nickname)
    and not exists(select 1 from private.beta_bot_activity a where a.event='interest' and a.nickname=v_bot and a.target_id=s.id)
  order by s.created_at desc,s.id desc limit 1;
  if v_interest_target is not null then
    insert into private.beta_bot_activity(nickname,event,target_id,detail,run_day)
    values(v_bot,'interest',v_interest_target,'토론해 보고 싶어요',v_run_day) on conflict do nothing;
  end if;

  update private.beta_bot_four_hour_runs set status='completed',updated_at=now(),last_error=null where slot_start=p_slot_start;
  delete from private.beta_bot_four_hour_runs where slot_start<now()-interval '7 days';
  return jsonb_build_object('ok',true,'issuePosts',v_issue_count,'talkPosts',v_talk_count,'suggestions',1);
end;
$$;
revoke all on function public.complete_siseon_beta_bot_run(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.complete_siseon_beta_bot_run(timestamptz,jsonb) to service_role;

create or replace function public.fail_siseon_beta_bot_run(p_slot_start timestamptz,p_reason text)
returns void language sql security definer set search_path=''
as $$
  update private.beta_bot_four_hour_runs
  set status='failed',updated_at=now(),last_error=left(coalesce(p_reason,'generation_failed'),500)
  where slot_start=p_slot_start and status='generating'
$$;
revoke all on function public.fail_siseon_beta_bot_run(timestamptz,text) from public,anon,authenticated;
grant execute on function public.fail_siseon_beta_bot_run(timestamptz,text) to service_role;

create or replace function private.run_siseon_beta_bots()
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_project_url text;
  v_scheduler_secret text;
  v_publishable_key text;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name='siseon_project_url';
  select decrypted_secret into v_scheduler_secret from vault.decrypted_secrets where name='siseon_scheduler_secret';
  select decrypted_secret into v_publishable_key from vault.decrypted_secrets where name='siseon_publishable_key';
  if v_project_url is null or v_scheduler_secret is null or v_publishable_key is null then
    raise exception 'beta_bot_scheduler_configuration_missing';
  end if;
  perform net.http_post(
    url:=rtrim(v_project_url,'/')||'/functions/v1/beta-bot-runner',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',v_publishable_key,'x-scheduler-secret',v_scheduler_secret),
    body:=jsonb_build_object('scheduled',true),
    timeout_milliseconds:=60000
  );
  return null;
end;
$$;
revoke execute on function private.run_siseon_beta_bots() from public,anon,authenticated;

select cron.schedule('siseon-beta-bots','0 3,7,11,15,19,23 * * *','select private.run_siseon_beta_bots()');
select cron.schedule('siseon-beta-bot-retry','15 3,7,11,15,19,23 * * *','select private.run_siseon_beta_bots()');
