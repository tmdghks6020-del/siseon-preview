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
  const cards = Array.isArray(data.imageUrls) && data.imageUrls.length > 1 ? data.imageUrls : [];
  if (['threads', 'instagram'].includes(row.platform) && cards.some((item: unknown) => typeof item !== 'string' || !/^https:\/\//i.test(item))) {
    throw new Error('카드 묶음의 모든 이미지에 공개 HTTPS 주소가 필요합니다.');
  }
  const createMedia = async (endpoint: string, params: URLSearchParams, label: string) => {
    const response = await fetch(endpoint, { method: 'POST', body: params, signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(label + ' · ' + (result.error?.message || response.status));
    return String(result.id);
  };
  const waitForInstagramMedia = async (id: string, token: string) => {
    for (let attempt = 0; attempt < 7; attempt++) {
      const response = await fetch(base + '/' + id + '?fields=status_code', {
        headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Instagram 이미지 상태 확인 실패');
      if (result.status_code === 'FINISHED') return;
      if (['ERROR', 'EXPIRED'].includes(result.status_code)) throw new Error('Instagram 이미지 준비 실패 · ' + result.status_code);
      if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error('Instagram 이미지 준비 시간이 초과됐습니다.');
  };
  const plain = (value: unknown) => String(value ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();
  const caption = [plain(data.title), plain(data.body), Array.isArray(data.hashtags) ? data.hashtags.join(' ') : ''].filter(Boolean).join('\n\n');
  const text = [caption, row.platform === 'instagram' ? '' : url].filter(Boolean).join('\n\n');
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
    if (cards.length) {
      const children = [];
      for (const [index, image_url] of cards.entries()) {
        children.push(await createMedia(`${api}/${userId}/threads`, new URLSearchParams({
          access_token: token, media_type: 'IMAGE', image_url, is_carousel_item: 'true'
        }), `Threads 카드 ${index + 1}장 준비 실패`));
      }
      threadParams.set('media_type', 'CAROUSEL');
      threadParams.set('children', children.join(','));
    } else if (hasImage) {
      threadParams.set('image_url', imageUrl);
      if (title) threadParams.set('alt_text', title);
    }
    const containerId = await createMedia(`${api}/${userId}/threads`, threadParams, 'Threads 게시물 준비 실패');
    if (hasImage || cards.length) {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1500));
        const response = await fetch(`${api}/${containerId}?fields=status,error_message`, {
          headers:{authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(6500)
        });
        const state = await response.json().catch(() => ({}));
        if (!response.ok || !state.status) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        if (state.status === 'FINISHED') break;
        if (state.status === 'ERROR' || state.status === 'EXPIRED') throw new Error('Threads 카드 처리 실패 · ' + state.status);
        if (attempt === 5) throw new Error('Threads 카드 준비 시간 초과');
      }
    }
    const publish = await fetch(`${api}/${userId}/threads_publish`, {
      method:'POST', body:new URLSearchParams({access_token:token, creation_id:containerId}),
      signal:AbortSignal.timeout(12000)
    });
    const result = await publish.json();
    if (!publish.ok || !result.id) {
      const code = [result.error?.code, result.error?.error_subcode].filter(Number.isInteger).join('/');
      throw new Error('Threads 최종 발행 실패 · ' + (result.error?.message || publish.status) + (code ? ' · Meta ' + code : ''));
    }
    let permalink = ''; try { const lookup = await fetch(`${api}/${result.id}?fields=permalink&access_token=${encodeURIComponent(token)}`); const meta = await lookup.json(); permalink = lookup.ok ? meta.permalink || '' : ''; } catch { }
    return { id: result.id, url: permalink };
  }
  const token = linked.accessToken || Deno.env.get('META_ACCESS_TOKEN'); if (!token) throw new Error('Meta 액세스 토큰이 설정되지 않았습니다.');
  let endpoint = ''; const body = new URLSearchParams({ access_token: token });
  if (row.platform === 'facebook') {
    const pageId = linked.accountId || Deno.env.get('META_FACEBOOK_PAGE_ID'); if (!pageId) throw new Error('Facebook 페이지 ID가 없습니다.');
    if (!/^\d+$/.test(pageId)) throw new Error('Facebook 페이지 ID는 숫자여야 합니다.');
    const lookup = async (path: string, accessToken: string) => {
      const response = await fetch(base + '/' + path, {
        headers: { authorization: 'Bearer ' + accessToken },
        signal: AbortSignal.timeout(10000)
      });
      return response.ok ? await response.json() : null;
    };
    const identity = await lookup('me?fields=id', token);
    let pageToken = token;
    if (identity?.id !== pageId) {
      const page = await lookup(pageId + '?fields=id,access_token', token);
      if (page?.id !== pageId || !page.access_token || (await lookup('me?fields=id', page.access_token))?.id !== pageId) {
        throw new Error('Facebook 페이지 토큰을 확인할 수 없습니다. 대상 페이지 ID와 페이지 게시 권한을 확인해 주세요.');
      }
      pageToken = page.access_token;
    }
    body.set('access_token', pageToken);
    const imageUrl = clean(data.imageUrl, 1500);
    const images = Array.isArray(data.imageUrls) ? data.imageUrls : [];
    if (images.length === 3 && images.every((url: unknown) => typeof url === 'string' && /^https:\/\//i.test(url))) {
      for (const [index, image] of images.entries()) {
        const upload = await fetch(`${base}/${pageId}/photos`, {
          method: 'POST', body: new URLSearchParams({access_token:pageToken,url:image,published:'false'})
        });
        const photo = await upload.json();
        if (photo.error?.code === 200) {
          throw new Error('Facebook 카드 ' + (index + 1) + '장 준비 실패 · 페이지 사진 게시 권한 없음 (#200). 페이지 토큰의 pages_manage_posts, pages_read_engagement, pages_show_list와 페이지 콘텐츠 만들기 권한을 확인해 주세요.');
        }
        if (!upload.ok || !photo.id) throw new Error('Facebook 카드 ' + (index + 1) + '장 준비 실패 · ' + (photo.error?.message || upload.status));
        body.set('attached_media[' + index + ']', JSON.stringify({media_fbid:photo.id}));
      }
      endpoint = `${base}/${pageId}/feed`;
      body.set('message', text);
    } else if (/^https:\/\//i.test(imageUrl)) {
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
    const mediaEndpoint = `${base}/${userId}/media`;
    let containerId;
    if (cards.length) {
      const children = [];
      for (const [index, image_url] of cards.entries()) {
        children.push(await createMedia(mediaEndpoint, new URLSearchParams({
          access_token: token, image_url, is_carousel_item: 'true'
        }), `Instagram 카드 ${index + 1}장 준비 실패`));
      }
      await Promise.all(children.map(id => waitForInstagramMedia(id, token)));
      containerId = await createMedia(mediaEndpoint, new URLSearchParams({
        access_token: token, media_type: 'CAROUSEL', children: children.join(','), caption: text.slice(0, 2200)
      }), 'Instagram 카드 묶음 준비 실패');
      await waitForInstagramMedia(containerId, token);
    } else {
      containerId = await createMedia(mediaEndpoint, new URLSearchParams({
        access_token: token, image_url: imageUrl, caption: text.slice(0, 2200)
      }), 'Instagram 미디어 준비 실패');
    }
    endpoint = `${base}/${userId}/media_publish`;
    body.set('creation_id', containerId);
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
