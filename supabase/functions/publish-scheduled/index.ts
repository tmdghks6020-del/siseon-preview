import { createClient } from 'npm:@supabase/supabase-js@2';

const keyMap = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || keyMap.default || Object.values(keyMap)[0];
if (!serverKey) throw new Error('Supabase server secret key를 찾지 못했습니다.');
const service = createClient(Deno.env.get('SUPABASE_URL')!, serverKey);
const clean = (v: unknown, n = 10000) => String(v ?? '').trim().slice(0, n);
const base = `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v27.0'}`;
function targetUrl(row: any) {
  const root = new URL(Deno.env.get('SISEON_SITE_URL')?.trim() || 'https://tmdghks6020-del.github.io/siseon-preview/');
  const url = new URL(root); url.searchParams.set('issue', row.issue_id); url.searchParams.set('utm_source', row.platform);
  url.searchParams.set('utm_medium', row.platform === 'naver_blog' ? 'blog' : 'social'); url.searchParams.set('utm_campaign', row.issue_id); url.searchParams.set('utm_content', row.id);
  return url.toString();
}
async function post(row: any) {
  const url = targetUrl(row); const data = row.content || {};
  const plain = (value: unknown) => String(value ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();
  const caption = [plain(data.title), plain(data.body), Array.isArray(data.hashtags) ? data.hashtags.join(' ') : ''].filter(Boolean).join('\n\n');
  const text = [caption, url].filter(Boolean).join('\n\n');
  const { data: saved, error: integrationError } = await service.rpc('service_get_integration', { p_provider: row.platform });
  if (integrationError) throw integrationError;
  let linked: Record<string, string> = {};
  try { linked = JSON.parse(saved || '{}'); } catch { throw new Error(`${row.platform} 연동 정보 형식이 올바르지 않습니다.`); }
  if (row.platform === 'threads') {
    const token = linked.accessToken || Deno.env.get('THREADS_ACCESS_TOKEN'); const userId = linked.accountId || Deno.env.get('META_THREADS_USER_ID');
    if (!token || !userId) throw new Error('Threads 토큰 또는 사용자 ID가 설정되지 않았습니다.');
    const api = 'https://graph.threads.net/v1.0';
    const title = plain(data.title).slice(0, 85);
    const link = '투표 참여하기\n' + url;
    const budget = Math.max(0, 500 - title.length - link.length - 4);
    let threadBody = plain(data.body);
    if (!threadBody.includes('\n\n')) {
      threadBody = (threadBody.match(/[^.!?。！？]+[.!?。！？]+(?=\s|$)|.+$/gs) || [threadBody])
        .map(sentence => sentence.trim()).filter(Boolean).join('\n\n');
    }
    if (threadBody.length > budget) {
      const clipped = threadBody.slice(0, Math.max(0, budget - 1));
      const lastParagraph = clipped.lastIndexOf('\n\n');
      threadBody = lastParagraph >= budget * 0.6 ? clipped.slice(0, lastParagraph) : clipped.trimEnd() + '…';
    }
    const threadText = [title, budget ? threadBody : '', link].filter(Boolean).join('\n\n');
    const imageUrl = clean(data.imageUrl, 1500);
    const hasImage = /^https:\/\//i.test(imageUrl);
    const threadParams = new URLSearchParams({ access_token: token, media_type: hasImage ? 'IMAGE' : 'TEXT', text: threadText });
    if (hasImage) {
      threadParams.set('image_url', imageUrl);
      if (title) threadParams.set('alt_text', title);
    }
    const create = await fetch(`${api}/${userId}/threads`, { method: 'POST', body: threadParams });
    const container = await create.json(); if (!create.ok || !container.id) throw new Error(container.error?.message || 'Threads 컨테이너 생성 실패');
    const publish = await fetch(`${api}/${userId}/threads_publish`, { method: 'POST', body: new URLSearchParams({ access_token: token, creation_id: container.id }) });
    const result = await publish.json(); if (!publish.ok || !result.id) throw new Error(result.error?.message || 'Threads 게시 실패');
    let permalink = ''; try { const lookup = await fetch(`${api}/${result.id}?fields=permalink&access_token=${encodeURIComponent(token)}`); const meta = await lookup.json(); permalink = lookup.ok ? meta.permalink || '' : ''; } catch { }
    return { id: result.id, url: permalink };
  }
  const token = linked.accessToken || Deno.env.get('META_ACCESS_TOKEN'); if (!token) throw new Error('Meta 액세스 토큰이 설정되지 않았습니다.');
  let endpoint = ''; const body = new URLSearchParams({ access_token: token });
  if (row.platform === 'facebook') {
    const pageId = linked.accountId || Deno.env.get('META_FACEBOOK_PAGE_ID'); if (!pageId) throw new Error('Facebook 페이지 ID가 없습니다.');
    const imageUrl = clean(data.imageUrl, 1500);
    if (/^https:\/\//i.test(imageUrl)) {
      endpoint = `${base}/${pageId}/photos`;
      body.set('url', imageUrl);
      body.set('caption', text);
    } else {
      endpoint = `${base}/${pageId}/feed`;
      body.set('message', caption);
      body.set('link', url);
    }
  } else if (row.platform === 'instagram') {
    const userId = linked.accountId || Deno.env.get('META_INSTAGRAM_USER_ID'); const imageUrl = clean(data.imageUrl, 1500);
    if (!userId || !/^https:\/\//i.test(imageUrl)) throw new Error('Instagram 사용자 ID와 공개 HTTPS 이미지 주소가 필요합니다.');
    const create = await fetch(`${base}/${userId}/media`, { method: 'POST', body: new URLSearchParams({ access_token: token, image_url: imageUrl, caption: text.slice(0, 2200) }) });
    const container = await create.json(); if (!create.ok || !container.id) throw new Error(container.error?.message || 'Instagram 미디어 준비 실패');
    endpoint = `${base}/${userId}/media_publish`; body.set('creation_id', container.id);
  } else throw new Error(`지원하지 않는 플랫폼: ${row.platform}`);
  const response = await fetch(endpoint, { method: 'POST', body }); const result = await response.json();
  if (!response.ok || !result.id) throw new Error(result.error?.message || `Meta 게시 실패 ${response.status}`);
  const publicationId = result.post_id || result.id;
  const postUrl = row.platform === 'facebook' ? (publicationId.includes('_') ? `https://www.facebook.com/${publicationId.replace('_', '/posts/')}` : `https://www.facebook.com/${publicationId}`) : '';
  return { id: publicationId, url: postUrl };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expected = Deno.env.get('SCHEDULER_SECRET'); const provided = request.headers.get('x-scheduler-secret');
  if (!expected || !provided || provided !== expected) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { data: due, error } = await service.from('publishing_jobs').select('*').in('status', ['queued','retry']).lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let processed = 0;
  for (const job of due || []) {
    const { data: claimed } = await service.from('publishing_jobs').update({ status: 'publishing', updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', job.status).select().maybeSingle();
    if (!claimed) continue;
    const { data: row, error: readError } = await service.from('generated_contents').select('*').eq('id', job.content_id).single();
    if (readError || !row || row.status !== 'queued' || !row.approved_at) {
      await service.from('publishing_jobs').update({ status: 'failed', error_message: '승인 상태를 확인하지 못해 발행을 차단했습니다.' }).eq('id', job.id);
      continue;
    }
    await service.from('generated_contents').update({ status: 'publishing', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'queued');
    try {
      const published = await post(row);
      const finishedAt = new Date().toISOString();
      await service.from('publishing_jobs').update({ status: 'published', external_post_id: published.id, external_post_url: published.url || null, published_at: finishedAt, error_message: null, updated_at: finishedAt }).eq('id', job.id);
      await service.from('generated_contents').update({ status: 'published', external_post_id: published.id, external_post_url: published.url || null, published_at: finishedAt, error_message: null, updated_at: finishedAt }).eq('id', row.id);
      await service.from('content_audit').insert({ action: 'published', content_id: row.id, details: { platform: row.platform, external_post_id: published.id } });
    } catch (err) {
      const message = clean((err as Error).message, 1000); const failedAt = new Date().toISOString();
      await service.from('publishing_jobs').update({ status: 'failed', error_message: message, updated_at: failedAt }).eq('id', job.id);
      await service.from('generated_contents').update({ status: 'failed', error_message: message, updated_at: failedAt }).eq('id', row.id);
      await service.from('content_audit').insert({ action: 'publish_failed', content_id: row.id, details: { message } });
    }
    processed++;
  }
  return Response.json({ ok: true, processed });
});
