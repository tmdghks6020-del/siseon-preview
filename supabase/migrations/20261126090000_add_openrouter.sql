alter table public.integration_connections drop constraint integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check check (provider in ('openai','gemini','openrouter','groq','cloudflare','instagram','threads','facebook'));
CREATE OR REPLACE FUNCTION public.admin_disconnect_integration(p_actor uuid, p_provider text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then raise exception 'admin_required'; end if;
  if p_provider not in ('openai', 'gemini','openrouter', 'groq', 'cloudflare', 'instagram', 'threads', 'facebook') then raise exception 'invalid_provider'; end if;
  delete from vault.secrets where name = 'siseon_integration_' || p_provider;
  insert into public.integration_connections(provider,connection_group,status,enabled)
  values(p_provider,case when p_provider in ('openai','gemini','openrouter','groq','cloudflare') then 'site' else 'marketing' end,'disconnected',false)
  on conflict(provider) do update set enabled=false,status='disconnected',cooldown_until=null,last_error=null,account_label=null,last_tested_at=null;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_record_integration_test(p_actor uuid, p_provider text, p_ok boolean, p_account_label text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then raise exception 'admin_required'; end if;
  if p_provider not in ('openai', 'gemini','openrouter', 'groq', 'cloudflare', 'instagram', 'threads', 'facebook') then raise exception 'invalid_provider'; end if;
  insert into public.integration_connections(provider, connection_group, status, account_label, last_tested_at, last_error, updated_by, updated_at)
    values (p_provider, case when p_provider in ('openai','gemini','openrouter','groq','cloudflare') then 'site' else 'marketing' end, case when p_ok then 'connected' else 'error' end, nullif(left(coalesce(p_account_label,''), 160), ''), now(), case when p_ok then null else left(coalesce(p_error,'연결 확인에 실패했습니다.'), 500) end, p_actor, now())
    on conflict (provider) do update set cooldown_until = null, status = excluded.status, account_label = excluded.account_label, last_tested_at = now(), last_error = excluded.last_error, updated_by = p_actor, updated_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.admin_store_integration(p_actor uuid, p_provider text, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare vault_name text;
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then raise exception 'admin_required'; end if;
  if p_provider not in ('openai', 'gemini','openrouter', 'groq', 'cloudflare', 'instagram', 'threads', 'facebook') then raise exception 'invalid_provider'; end if;
  if p_secret is null or length(p_secret) < 8 then raise exception 'invalid_secret'; end if;
  vault_name := 'siseon_integration_' || p_provider;
  delete from vault.secrets where name = vault_name;
  perform vault.create_secret(p_secret, vault_name, '시선 관리자 API 설정 · ' || p_provider);
  insert into public.integration_connections(provider, connection_group, status, account_label, last_tested_at, last_error, updated_by, updated_at)
    values (p_provider, case when p_provider in ('openai','gemini','openrouter','groq','cloudflare') then 'site' else 'marketing' end, 'disconnected', null, null, null, p_actor, now())
    on conflict (provider) do update set enabled = true, cooldown_until = null, status = 'disconnected', account_label = null, last_tested_at = null, last_error = null, updated_by = excluded.updated_by, updated_at = now();
end $function$;