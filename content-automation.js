import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const root = () => document.querySelector('#contentAutomationRoot');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const platformNames = { instagram: '인스타그램', threads: '스레드', facebook: '페이스북', naver_blog: '네이버 블로그' };
let supabase; let currentUser = null; let isAdmin = false; let contents = [];
function topicDraftFromRow(row) {
  return {
    voteOptions: row.vote_options || ['찬성','반대','판단 보류'], id: row.id, batchId: row.batch_id, category: row.category, title: row.title, intro: row.intro,
    trendingReason: row.trending_reason, facts: row.facts || [], source: row.source, sourceUrl: row.source_url,
    sourceDate: row.source_date, forText: row.for_text, againstText: row.against_text,
    imageKeywords: row.data_signals?.imageKeywords || [],
    searchKeywords: row.search_keywords || [], dataSignals: row.data_signals || {},
    selectedField: row.data_signals?.selectedField || '', createdAt: row.created_at
  };
}

function renderNotice(message, isError = false) {
  const target = root();
  if (target) target.innerHTML = `<div class="moderation-guidance"><strong>${isError ? '확인 필요' : '안내'}</strong><span>${esc(message)}</span></div>`;
}
async function call(action, data = {}) {
  const { data: result, error } = await supabase.functions.invoke('content-admin', { body: { ...data, action } });
  if (error) {
    let details = result;
    try { if (!details && error.context?.clone) details = await error.context.clone().json(); } catch { /* keep the SDK message */ }
    const message = details?.error || error.message || '서버 요청에 실패했습니다.';
    const status = error.context?.status;
    throw new Error(status ? `${message} (HTTP ${status})` : message);
  }
  if (result?.error) throw new Error(result.error);
  return result;
}
function platformContentShape(item) { return item.content || {}; }
const promoStatus = {review_required:'검토 대기', approved:'승인 완료', rejected:'반려', queued:'발행 예약', publishing:'발행 중', published:'발행 완료', failed:'발행 실패'};
function renderPollPromotionStatuses(error = false) {
  for (const target of document.querySelectorAll('[data-promo-status]')) {
    if (error) { target.textContent='홍보 상태를 불러오지 못했습니다.'; continue; }
    const latest = new Map();
    for (const item of contents) {
      if (item.issueId !== target.dataset.promoStatus || item.status === 'rejected') continue;
      const key = item.platform + ':' + (item.content?.facebookDeletedAt ? 'removed' : item.status);
      const record = latest.get(key) || {item,count:0};
      record.count++;
      latest.set(key,record);
    }
    target.innerHTML = [...latest.values()].map(({item,count}) => `<span class="admin-status ${item.status==='failed'?'status-blocked':item.status==='published'?'status-good':'status-warn'}">${esc(platformNames[item.platform] || item.platform)} · ${esc(item.content?.facebookDeletedAt ? '게시물 삭제 완료' : promoStatus[item.status] || item.status)}${count>1?' '+count+'건':''}</span>`).join('') || '홍보 기록 없음';
  }
}
function render() {
  renderPollPromotionStatuses();
  const target = root(); if (!target) return;
  const scoped = contents.filter(item => item.issueId === target.dataset.issueId && item.status !== 'rejected');
  const counts = scoped.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {});
  target.innerHTML = `
    <div class="content-auto-toolbar"><div><strong>승인 전 자동 발행 차단</strong><p>게시물은 관리자 검토·승인 후에만 예약 대기열에 들어갑니다. 네이버 블로그는 복사·수동 게시 방식입니다.</p><p>서비스 키와 계정 토큰은 API 설정에서 서버에 암호화 저장합니다.</p></div><button type="button" class="table-action" data-content-action="refresh">새로고침</button></div>
    <div class="content-status-strip"><span>검토 대기 <b>${counts.review_required || 0}</b></span><span>승인 <b>${counts.approved || 0}</b></span><span>예약·발행 대기 <b>${counts.queued || 0}</b></span><span>발행 완료 <b>${counts.published || 0}</b></span><span>실패 <b>${counts.failed || 0}</b></span></div>
    <div class="content-auto-list">${scoped.map(renderContent).join('') || '<p class="table-empty">아직 생성된 콘텐츠가 없습니다.</p>'}</div>`;
}

async function findPollPhotos(query) {
  const result = await call('search-kakao-images', { query });
  return result.results || [];
}

async function previewPollPhoto(info, title, color, format, brief) {
  const response = await fetch(info.imageUrl, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
  const photo = await createImageBitmap(await response.blob());
  try { return makePollShareCard({ ...brief, title, color, format, credit: info.sourceName }, photo); } finally { photo.close(); }
}

const searchedDrafts = new Set();

function renderContent(item) {
  const removed = item.platform === 'facebook' && item.status === 'published' && item.content?.facebookDeletedAt;
  const statusLabel = removed ? '게시물 삭제 완료' : ({ review_required: '검토 대기', approved: '승인 완료', rejected: '반려', queued: '게시 대기', publishing: '게시 중', published: '게시 완료', failed: '게시 실패' })[item.status] || item.status;
  const editable = !['published', 'publishing'].includes(item.status);
  const sourceLinks = (item.sources || []).map((url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`).join(' · ') || '등록된 출처 없음';
  const jsonValue = JSON.stringify(platformContentShape(item), null, 2);
  const jobState = item.errorMessage ? `<p class="content-error">${esc(item.errorMessage)}</p>` : '';
  const imageUrl = /^https:\/\//i.test(item.content?.imageUrl || '') ? item.content.imageUrl : '';
  const draftCards = Array.isArray(item.content?.imageUrls)
    ? item.content.imageUrls.filter(url => /^https:\/\//i.test(url)) : [];
  const imagePreview = draftCards.length === 3
    ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:10px">' + draftCards.map((url,index) => `<figure style="margin:0"><img class="content-image-preview" src="${esc(url)}" alt="${['메인 상황','핵심 갈등','선택 질문'][index]}"><figcaption>${['메인 상황','핵심 갈등','선택 질문'][index]}</figcaption></figure>`).join('') + '</div>'
    : ['instagram','facebook','threads'].includes(item.platform) && imageUrl ? `<img class="content-image-preview" src="${esc(imageUrl)}" alt="홍보 이미지 시안" loading="lazy">` : '';
  const publishedLink = item.externalPostUrl && !removed ? `<p><a href="${esc(item.externalPostUrl)}" target="_blank" rel="noopener noreferrer">게시물 확인 ↗</a></p>` : '';
  const scheduleLabel = item.scheduledAt ? `<p class="admin-footnote">게시 예약 시각: ${esc(new Date(item.scheduledAt).toLocaleString('ko-KR'))} · 작업 ${esc(item.jobStatus || '')} · 재시도 ${Number(item.retryCount || 0)}회</p>` : '';
  const buttons = [
    ['facebook','instagram','threads'].includes(item.platform) && ['review_required','failed'].includes(item.status)
      ? `<button type="button" data-content-action="attach-finished-image" data-id="${esc(item.id)}">완성 이미지로 첨부</button>` : '',
    ['threads','instagram'].includes(item.platform) && item.status === 'published' && item.external_post_id ? `<button type="button" data-content-action="delete-social-post" data-id="${esc(item.id)}">게시물 삭제</button>` : '',
    item.platform === 'facebook' && item.status === 'published' && item.external_post_id && !removed ? `<button type="button" data-content-action="delete-facebook-post" data-id="${esc(item.id)}">Facebook 게시물 삭제</button>` : '',
    editable ? '<button type="button" data-content-action="save" data-id="' + esc(item.id) + '">수정 저장</button>' : '',
    editable ? '<button type="button" data-content-action="regenerate" data-id="' + esc(item.id) + '">AI 재생성</button>' : '',
    ['instagram','facebook','threads'].includes(item.platform) && ['review_required','failed'].includes(item.status) ? `<button type="button" data-content-action="generate-image" data-id="${esc(item.id)}">${imageUrl ? '투표 카드 다시 만들기' : '투표 카드 만들기'}</button>` : '',
    ['review_required', 'rejected'].includes(item.status) ? '<button type="button" data-content-action="approve" data-id="' + esc(item.id) + '">검토 후 승인</button>' : '',
    ['review_required', 'approved'].includes(item.status) ? '<button type="button" data-content-action="reject" data-id="' + esc(item.id) + '">반려</button>' : '',
    item.status === 'approved' && item.platform === 'naver_blog' ? '<label class="content-post-url">네이버 게시물 주소<input type="url" data-post-url="' + esc(item.id) + '" placeholder="수동 게시 후 URL 입력"></label><button type="button" data-content-action="manual-publish" data-id="' + esc(item.id) + '">게시 완료 기록</button>' : '',
    item.platform === 'naver_blog' ? '<button type="button" data-content-action="copy" data-id="' + esc(item.id) + '">네이버용 복사</button>' : '',
    item.status === 'approved' && item.platform !== 'naver_blog' ? '<label class="content-schedule">게시 예약<input type="datetime-local" data-schedule="' + esc(item.id) + '"></label><button type="button" data-content-action="publish" data-id="' + esc(item.id) + '">예약 / 지금 게시</button>' : '',
    item.status === 'failed' ? '<button type="button" data-content-action="retry" data-id="' + esc(item.id) + '">재시도</button>' : ''
  ].filter(Boolean).join('');
  const photoSearch = ['facebook', 'instagram'].includes(item.platform) && item.status === 'review_required'
    ? `<div><label>사진 검색어<input type="search" data-photo-keywords maxlength="120" value="${esc((item.issueTitle || item.content?.title || '').slice(0,120))}"></label>
      <button type="button" data-content-action="search-photos" data-id="${esc(item.id)}">웹에서 사진 찾기</button>
      <label>카드 색상<select data-photo-palette><option value="#102b24">딥그린</option><option value="#152742">네이비</option><option value="#352719">웜브라운</option></select></label><div data-photo-results aria-live="polite"></div></div>` : '';
  return `<article class="content-auto-card" data-content-card="${esc(item.id)}"><div class="content-auto-card-head"><div><span class="announcement-category">${esc(platformNames[item.platform] || item.platform)}</span><small>${esc(item.issueTitle || item.issueId || '')}</small></div><span class="admin-status ${['approved','queued','published'].includes(item.status) ? 'status-good' : item.status === 'failed' || item.status === 'rejected' ? 'status-blocked' : 'status-warn'}">${esc(statusLabel)}</span></div>
    <details${['facebook','instagram'].includes(item.platform) ? ' open' : ''}><summary>게시글 미리보기</summary>${imagePreview}<strong>${esc(item.content?.title || '')}</strong><p style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7">${esc(item.content?.body || item.content?.intro || '')}</p></details>
    ${editable ? `<label>플랫폼별 콘텐츠 JSON<textarea data-content-json="${esc(item.id)}" rows="12" spellcheck="false">${esc(jsonValue)}</textarea></label>` : ''}
    ${photoSearch}${['facebook','instagram','threads'].includes(item.platform) && ['review_required','failed'].includes(item.status) ? '<label>카드에 넣을 사진<input type="file" accept="image/jpeg,image/png,image/webp" data-poll-photo></label><p class="admin-footnote">사용할 수 있는 사진을 선택한 뒤 ‘투표 카드 만들기’를 누르세요. 사진 없이 만들면 시선 배경에 제목이 표시됩니다.</p>' : ''}<p class="admin-footnote">출처: ${sourceLinks}</p>${scheduleLabel}${jobState}${publishedLink}<div class="content-auto-actions">${buttons}</div></article>`;
}
const integrationMeta = {
  openai: { title: 'OpenAI', group: 'site', description: '홍보 배경 이미지 생성에 사용합니다. 연결 테스트는 이미지 한 장을 생성합니다.', fields: [{ name: 'apiKey', label: 'OpenAI API 키', type: 'password', placeholder: '저장한 키는 다시 표시되지 않습니다.' }] },
  exaone: { title: 'EXAONE', group: 'site', description: 'EXAONE 텍스트 생성 API를 연결합니다.', fields: [{name:'apiKey',label:'EXAONE API 키',type:'password',placeholder:'EXAONE에서 발급한 키'},{name:'model',label:'모델 (선택)',type:'text',placeholder:'k-exaone_v2.5'}] },
  openrouter: { title: 'OpenRouter', group: 'site', description: '텍스트와 홍보 배경 이미지 생성에 사용합니다. 모델에 따라 요금과 한도가 다릅니다.', fields: [{name:'apiKey',label:'OpenRouter API 키',type:'password',placeholder:'OpenRouter에서 발급한 키'},{name:'model',label:'모델 (선택)',type:'text',placeholder:'openrouter/auto'}] },
  groq: { title: 'Groq', group: 'site', description: '제공된 뉴스 자료를 바탕으로 초안을 만듭니다. 이 연결에서는 웹 검색을 수행하지 않습니다.', fields: [{name:'apiKey',label:'Groq API 키',type:'password',placeholder:'Groq Console에서 발급한 키'},{name:'model',label:'모델 (선택)',type:'text',placeholder:'openai/gpt-oss-120b'}] },
  cloudflare: { title: 'Cloudflare Workers AI', group: 'site', description: '마지막 텍스트 생성 서비스입니다. Workers AI 권한 토큰과 Account ID가 필요합니다.', fields: [{name:'apiKey',label:'Cloudflare API 토큰',type:'password',placeholder:'Workers AI 사용 권한이 있는 토큰'},{name:'accountId',label:'Cloudflare Account ID',type:'text',placeholder:'32자리 Account ID'},{name:'model',label:'텍스트 모델 (선택)',type:'text',placeholder:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'}] },
  instagram: { title: 'Instagram', group: 'marketing', description: '비즈니스/크리에이터 계정의 게시 권한 토큰과 계정 ID를 연결합니다.', fields: [{ name: 'accessToken', label: '액세스 토큰', type: 'password', placeholder: 'Meta에서 발급한 액세스 토큰' }, { name: 'accountId', label: 'Instagram 계정 ID', type: 'text', placeholder: 'Instagram professional account ID' }] },
  threads: { title: 'Threads', group: 'marketing', description: 'Threads 게시 권한 토큰을 연결합니다. 사용자 ID는 연결 테스트에서 자동으로 확인합니다.', fields: [{ name: 'accessToken', label: '액세스 토큰', type: 'password', placeholder: 'Threads API 액세스 토큰' }, { name: 'accountId', label: 'Threads 사용자 ID (선택)', type: 'text', placeholder: '모르면 비워두세요. 연결 테스트 때 자동 확인합니다.' }] },
  facebook: { title: 'Facebook 페이지', group: 'marketing', description: '게시 권한이 있는 Facebook 페이지 토큰과 페이지 ID를 연결합니다.', fields: [{ name: 'accessToken', label: '페이지 액세스 토큰', type: 'password', placeholder: 'Meta에서 발급한 페이지 액세스 토큰' }, { name: 'accountId', label: 'Facebook 페이지 ID', type: 'text', placeholder: 'Facebook Page ID' }] }
};
function connectionLight(status) { return `<span class="connection-light ${status === 'connected' ? 'is-on' : 'is-off'}" aria-label="${status === 'connected' ? '활성' : '비활성'}"></span>`; }
async function getIntegrations() {
  if (!isAdmin) throw new Error('운영자 로그인이 필요합니다.');
  const { integrations = [] } = await call('integrations-list');
  return integrations;
}
async function renderApiSettings() {
  const target = document.querySelector('#apiSettingsRoot'); if (!target) return;
  if (!isAdmin) { target.innerHTML = '<div class="content-auth-panel"><h2>운영자 로그인 필요</h2><p>API 연결 정보는 운영자만 확인하고 변경할 수 있습니다.</p></div>'; return; }
  const expandedProviders = new Set([...target.querySelectorAll('details[data-integration-edit][open]')].map(details => details.dataset.integrationEdit));
  target.innerHTML = '<p>연결 상태를 확인하고 있습니다.</p>';
  try {
    const rows = await getIntegrations(); const statusMap = new Map(rows.map((row) => [row.provider, row]));
    const card = (provider) => {
      const meta = integrationMeta[provider]; const row = statusMap.get(provider); const active = row?.status === 'connected';
      const stateLabel = active ? '연결됨' : row?.status === 'error' ? '연결 오류' : '미연결';
      const fields = meta.fields.map((field) => `<label>${esc(field.label)}<input name="${field.name}" type="${field.type}" ${field.name === 'apiKey' ? 'autocomplete="new-password"' : ''} placeholder="${esc(field.placeholder)}" ${field.name === 'model' || provider === 'threads' && field.name === 'accountId' ? '' : 'required'}></label>`).join('');
      const tested = (row?.last_tested_at ? `마지막 확인 ${esc(new Date(row.last_tested_at).toLocaleString('ko-KR'))}` : '아직 연결 테스트를 하지 않았습니다.') + (row?.cooldown_until && Date.parse(row.cooldown_until)>Date.now() ? ` · ${esc(new Date(row.cooldown_until).toLocaleTimeString('ko-KR'))} 이후 재시도` : '');
      const error = row?.status === 'error' && row.last_error ? `<p class="integration-error">${esc(row.last_error)}</p>` : '';
      return `<article class="integration-card"><div class="integration-card-head"><div>${connectionLight(row?.status)}<h3>${esc(meta.title)}</h3></div><span class="integration-state ${active ? 'active' : 'inactive'}">${stateLabel}</span></div><p>${esc(meta.description)}</p>${active ? `<small class="integration-account">연결 계정 · ${esc(row.account_label || '연결됨')} · ${tested}</small>` : `<small class="integration-account">${tested}</small>`}${error}<div class="integration-actions"><button type="button" class="table-action" data-integration-action="test" data-provider="${provider}">저장된 정보 테스트</button>${row ? `<button type="button" class="table-action" data-integration-action="disconnect" data-provider="${provider}">연결 해제</button>` : ''}</div><p class="admin-footnote" data-integration-message="${provider}" aria-live="polite"></p><details data-integration-edit="${provider}"${expandedProviders.has(provider) ? ' open' : ''}><summary>${row ? '연결 설정 수정' : '연결 설정'}</summary><form data-integration-form="${provider}">${fields}<div class="integration-actions"><button class="primary-button" type="submit">저장하고 연결 테스트</button></div></form></details></article>`;
    };
    const summary = (providers) => `${providers.filter(provider => statusMap.get(provider)?.status === 'connected').length}/${providers.length} 연결`;
    const aiProviders = ['exaone', 'groq', 'openai', 'openrouter', 'cloudflare'];
    const socialProviders = ['facebook', 'instagram', 'threads'];
    target.innerHTML = `
      <section class="integration-group">
        <div class="integration-group-heading"><div><h2>AI 서비스</h2><p>안건·홍보 문구와 이미지 생성에 사용합니다.</p></div><span class="integration-summary">${summary(aiProviders)}</span></div>
        <div class="integration-card">
          <h3>자동 전환 순서</h3>
          <p><strong>텍스트</strong> · EXAONE → Groq → OpenRouter → Cloudflare</p>
          <p><strong>이미지</strong> · OpenAI → OpenRouter → Cloudflare</p>
          <p>자동 전환 경로 테스트는 위 텍스트 순서로 호출합니다.</p>
          <div class="integration-actions"><button type="button" class="table-action" data-integration-action="fallback-test">자동 전환 경로 테스트</button></div>
          <p id="aiFallbackTestResult" aria-live="polite"></p>
        </div>
        <div class="integration-grid">${aiProviders.map(card).join('')}</div>
      </section>
      <section class="integration-group">
        <div class="integration-group-heading"><div><h2>마케팅·광고 채널</h2><p>연결된 채널만 투표 관리의 홍보 초안 생성에서 선택할 수 있습니다.</p></div><span class="integration-summary">${summary(socialProviders)}</span></div>
        <div class="integration-grid">${socialProviders.map(card).join('')}<article class="integration-card integration-manual"><div class="integration-card-head"><div><span class="connection-light is-manual"></span><h3>네이버 블로그</h3></div><span class="integration-state manual">수동 게시</span></div><p>네이버 공식 블로그 글쓰기 API는 종료되어 직접 자동 게시 연결을 제공할 수 없습니다.</p><small class="integration-account">콘텐츠 자동화에서 원고를 복사해 블로그에 직접 게시할 수 있습니다.</small></article></div>
      </section>
      <details><summary>연결 테스트 및 키 보관 안내</summary><p class="integration-security-note">API 키와 액세스 토큰은 Supabase Vault에 암호화해 저장합니다. 이 화면은 저장된 비밀값을 다시 표시하지 않습니다. AI 연결 테스트는 짧은 실제 생성 요청이며 사용량이 소모될 수 있습니다. 초록색은 마지막 테스트 성공을 뜻하며 무료 한도나 잔액을 보장하지 않습니다. 마케팅 채널 테스트는 계정 접근만 확인합니다.</p></details>`;
  } catch (error) { target.innerHTML = `<div class="moderation-guidance"><strong>연결 확인 실패</strong><span>${esc(error.message)}. 새 API 설정 데이터베이스 구조가 아직 배포되지 않았는지 확인해 주세요.</span></div>`; }
}
async function loadContents() {
  if (!isAdmin) return;
  renderNotice('콘텐츠와 게시 이력을 불러오는 중입니다.');
  try { ({ contents } = await call('list')); render();
    for (const button of root()?.querySelectorAll('[data-content-action="search-photos"]') || []) {
      if (searchedDrafts.has(button.dataset.id)) continue;
      searchedDrafts.add(button.dataset.id);
      button.click();
    } }
  catch (error) { renderPollPromotionStatuses(true); renderNotice(error.message || '콘텐츠를 불러오지 못했습니다.', true); }
}
function renderAuthState() {
  const target = root();
  if (!target) { if (isAdmin && document.querySelector('[data-promo-status]')) loadContents(); return; }
  if (!currentUser) {
    target.innerHTML = '<div class="content-auth-panel"><h2>운영자 인증</h2><p>Supabase Auth 운영자 계정으로 로그인합니다. 승인된 관리자 계정만 콘텐츠를 관리할 수 있습니다.</p><form id="contentAdminLogin"><label>이메일<input name="email" type="email" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><button class="primary-button" type="submit">관리자 로그인</button></form></div>';
  } else if (!isAdmin) {
    target.innerHTML = `<div class="content-auth-panel"><h2>관리자 권한이 없습니다</h2><p>${esc(currentUser.email || '')} 계정에 서버 관리자 권한이 설정되어 있지 않습니다.</p><button type="button" class="table-action" data-content-action="logout">로그아웃</button></div>`;
  } else loadContents();
}
async function init() {
  const config = window.SISEON_SUPABASE_CONFIG;
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_REF') || !config.publishableKey || config.publishableKey.includes('REPLACE_WITH')) {
    renderNotice('Supabase 프로젝트 URL과 publishable key를 supabase-config.js에 입력해야 관리자 기능을 사용할 수 있습니다.');
    return;
  }
  try {
    supabase = createClient(config.url, config.publishableKey);
    window.SISEON_CONTENT_AUTOMATION = {
      renderApiSettings,
      getIntegrations,
      async loadContents() { return loadContents(); },
      async generateForPoll(issue, selectedPlatforms, onImages) {
        if (!isAdmin) throw new Error('운영자 로그인이 필요합니다.');
        const result = await call('generate', { ...issue, platforms: selectedPlatforms });
        const drafts = (result.drafts || []).filter(draft => ['facebook','instagram','threads'].includes(draft.platform));
        const imageErrors = [];
        const backgrounds = [];
        const cardRoles = ['main', 'conflict', 'choice'];
        try {
          if (drafts.length) onImages?.();
          for (const cardRole of drafts.length ? cardRoles : []) {
            try {
              const generated = await call('promo-background', {
                issueId: issue.issueId, title: issue.title, summary: issue.summary, cardRole
              });
              backgrounds.push(await createImageBitmap(await (await fetch(generated.image)).blob()));
            } catch (error) {
              backgrounds.push(null);
              imageErrors.push(cardRole + ' 배경 · ' + error.message);
            }
          }
          for (const draft of drafts) {
            try {
              const images = makeSocialCardSet(issue, draft, backgrounds);
              await call('save-poll-share-card', { id: draft.id, images });
            } catch (error) {
              imageErrors.push((platformNames[draft.platform] || draft.platform) + ': ' + error.message);
            }
          }
        } finally { backgrounds.forEach(photo => photo?.close()); }
        return {...result, imageErrors};
      }
    };
    window.SISEON_CLEAR_TOPICS_LISTENER?.abort();
    document.querySelector('#clearPendingTopics')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!window.confirm('모든 분야의 검토 대기 후보를 영구 삭제할까요?')) return;
      button.disabled = true;
      const status = document.querySelector('#topicGenerationStatus');
      try {
        const { deletedCount } = await call('topics-clear-pending');
        if (status) status.textContent = `검토 대기 후보 ${deletedCount}개를 삭제했습니다.`;
        try { await window.SISEON_TOPIC_ADMIN.list(); }
        catch { if (status) status.textContent += ' 목록을 갱신하려면 페이지를 새로고침하세요.'; }
      } catch (error) {
        if (status) status.textContent = error.message || '후보안건을 비우지 못했습니다.';
      } finally {
        button.disabled = false;
      }
    }, { signal: (window.SISEON_CLEAR_TOPICS_LISTENER = new AbortController()).signal });
    window.SISEON_TOPIC_ADMIN = {
      async list() {
        const { candidates, scheduled, guidelines } = await call('topics-list');
        const guidelineView = document.querySelector('#topicGuidelinesText');
        if (guidelineView) guidelineView.textContent = guidelines?.text ? `적용 버전: ${guidelines.version}\n\n${guidelines.text}` : '서버에 새 작성 지침이 아직 배포되지 않았습니다. content-admin 함수를 업데이트해 주세요.';
        const mapped = (candidates || []).map(topicDraftFromRow);
        window.dispatchEvent(new CustomEvent('siseon-topic-candidates-loaded', { detail: { candidates: mapped, scheduled: scheduled || [] } }));
        return mapped;
      },
      async generate(payload) {
        const result = await call('topics-generate', payload);
        const candidates = await this.list();
        return { ...result, generatedCount: result.candidates?.length || 0, candidates };
      },
      async save(draft) {
        await call('topics-save', {
          id: draft.id, imageKeywords: draft.imageKeywords, voteOptions: draft.voteOptions, category: draft.category, title: draft.title, intro: draft.intro,
          trendingReason: draft.trendingReason, facts: draft.facts, source: draft.source,
          sourceDate: draft.sourceDate, sourceUrl: draft.sourceUrl, forText: draft.forText, againstText: draft.againstText
        });
        return this.list();
      },
      async review(id, decision, note = '') {
        const result = await call('topics-review', { id, decision, note });
        const candidates = await this.list();
        return { ...result, candidates };
      },
      async publishNow(id) {
        const result = await call('topics-publish-now', { id });
        await this.list();
        return result;
      },
      async manage(id, managementAction) {
        return call('topics-manage', { id, managementAction });
      }
    };
    supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      // Supabase may emit SIGNED_IN again when the same tab regains focus.
      if (isAdmin && user && currentUser?.id === user.id && ['SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        currentUser = user;
        return;
      }
      currentUser = user; isAdmin = false;
      const updateAuthView = async () => {
        if (user) {
          try { await call('list'); isAdmin = true; }
          catch { isAdmin = false; }
          if (isAdmin) {
            try { await window.SISEON_TOPIC_ADMIN.list(); }
            catch (error) { window.dispatchEvent(new CustomEvent('siseon-topic-candidates-error', { detail: { message: `AI 안건 저장소를 읽지 못했습니다. 새 데이터베이스 구조를 적용했는지 확인해 주세요. (${error.message})` } })); }
          }
        }
        if (isAdmin) window.dispatchEvent(new CustomEvent('siseon-admin-authenticated'));
        else if (!user) window.dispatchEvent(new CustomEvent('siseon-admin-signed-out'));
        const operatorNote = document.querySelector('.admin-operator small');
        if (operatorNote) operatorNote.textContent = isAdmin ? 'Supabase 관리자 인증 완료 · 일부 메뉴는 시연용' : user ? '운영자 권한 없음' : '로그인 필요';
        renderAuthState();
      };
      setTimeout(updateAuthView, 0);
    });
  } catch (error) { renderNotice(`Supabase 초기화 실패: ${error.message}`, true); }
}

document.querySelector('#adminAccessLogin')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.querySelector('#adminLoginMessage');
  const button = event.submitter;
  if (!supabase) { message.textContent = 'Supabase 설정을 확인할 수 없습니다.'; return; }
  button.disabled = true; message.textContent = '운영자 계정을 확인하고 있습니다.';
  const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  if (error) {
    message.textContent = '로그인 정보를 확인해 주세요.';
    button.disabled = false;
    return;
  }
  try {
    await call('list');
    message.textContent = '';
    window.dispatchEvent(new CustomEvent('siseon-admin-authenticated'));
  } catch (authError) {
    await supabase.auth.signOut();
    message.textContent = authError.message || '이 계정에는 운영자 권한이 없습니다.';
    button.disabled = false;
  }
});
document.querySelector('#adminLogoutButton')?.addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
});
document.querySelector('#adminLoginDialog')?.addEventListener('close', () => {
  const form = document.querySelector('#adminAccessLogin');
  if (form) form.reset();
  const message = document.querySelector('#adminLoginMessage');
  if (message) message.textContent = '';
  const button = form?.querySelector('button[type="submit"]');
  if (button) button.disabled = false;
});

document.querySelector('.admin-sidebar')?.addEventListener('click', (event) => {
  if (event.target.closest('[data-admin-page="content-automation"]')) setTimeout(() => {
    if (currentUser && isAdmin) loadContents();
    else if (currentUser) renderAuthState();
    else if (!window.SISEON_SUPABASE_CONFIG || window.SISEON_SUPABASE_CONFIG.url.includes('YOUR_PROJECT_REF')) renderNotice('Supabase 프로젝트 설정이 아직 입력되지 않았습니다. README의 Supabase 설정 순서를 먼저 완료하세요.');
    else if (supabase) renderAuthState();
  }, 0);
});
document.querySelector('#adminPageContent')?.addEventListener('submit', async (event) => {
  const integrationForm = event.target.closest('[data-integration-form]');
  if (integrationForm) {
    event.preventDefault();
    const provider = integrationForm.dataset.integrationForm; const formData = new FormData(integrationForm);
    const credentials = ['openai','exaone','openrouter','groq','cloudflare'].includes(provider)
      ? { apiKey: formData.get('apiKey'), model: formData.get('model'), accountId: formData.get('accountId') }
      : { accessToken: formData.get('accessToken'), accountId: formData.get('accountId') };
    const status = document.querySelector(`[data-integration-message="${CSS.escape(provider)}"]`);
    const button = event.submitter; button.disabled = true; if (status) status.textContent = '암호화 저장 후 연결을 확인하고 있습니다.';
    try {
      await call('integration-save', { provider, credentials });
      await renderApiSettings();
    } catch (error) {
      if (status) status.textContent = error.message || '연결 확인에 실패했습니다.';
      button.disabled = false;
      await renderApiSettings();
      const refreshedStatus = document.querySelector(`[data-integration-message="${CSS.escape(provider)}"]`);
      if (refreshedStatus) refreshedStatus.textContent = error.message || '연결 확인에 실패했습니다.';
    }
    return;
  }
  if (event.target.id === 'contentAdminLogin') {
    event.preventDefault();
    const form = new FormData(event.target);
    const button = event.submitter; button.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) { window.alert(error.message); button.disabled = false; }
    return;
  }
  if (event.target.id !== 'contentGenerationForm') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = Object.fromEntries(['issueId','title','summary','forView','againstView'].map((key) => [key, form.get(key)]));
  payload.sources = String(form.get('sources') || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const button = event.submitter; button.disabled = true; button.textContent = '콘텐츠 생성 중…';
  try { await call('generate', payload); await loadContents(); }
  catch (error) { window.alert(error.message || '생성에 실패했습니다.'); button.disabled = false; button.textContent = 'AI 플랫폼별 초안 생성'; }
});
document.querySelector('#adminPageContent')?.addEventListener('click', async (event) => {
  const integrationButton = event.target.closest('[data-integration-action]');
  if (integrationButton) {
    const { integrationAction: action, provider } = integrationButton.dataset;
    integrationButton.disabled = true;
    if(action==='fallback-test') {
      const output=document.querySelector('#aiFallbackTestResult');
      if(output) output.textContent='연결된 AI를 우선순위대로 실제 호출하고 있습니다…';
      try {
        const result=await call('ai-fallback-test');
        await renderApiSettings();
        const refreshed=document.querySelector('#aiFallbackTestResult');
        if(refreshed) refreshed.textContent=`성공: ${result.provider} (${result.model}) · ${result.attempts.map(item=>`${item.provider}: ${item.status}`).join(' → ')}`;
      } catch(error) {
        await renderApiSettings();
        const refreshed=document.querySelector('#aiFallbackTestResult');
        if(refreshed) refreshed.textContent=error.message;
      } finally {integrationButton.disabled=false;}
      return;
    }
    try {
      if (action === 'disconnect') {
        if (!window.confirm(`${integrationMeta[provider]?.title || provider} 연결을 해제할까요? 저장된 토큰도 삭제됩니다.`)) return;
        await call('integration-disconnect', { provider });
        await renderApiSettings();
      } else if (action === 'test') {
        const status = document.querySelector(`[data-integration-message="${CSS.escape(provider)}"]`);
        if (status) status.textContent = '저장된 연결 정보를 확인하고 있습니다.';
        try {
          await call('integration-test', { provider });
          await renderApiSettings();
        } catch (error) {
          await renderApiSettings();
          const refreshedStatus = document.querySelector(`[data-integration-message="${CSS.escape(provider)}"]`);
          if (refreshedStatus) refreshedStatus.textContent = error.message || '연결 확인에 실패했습니다.';
        }
      }
    } catch (error) { window.alert(error.message || 'API 설정을 변경하지 못했습니다.'); }
    finally { integrationButton.disabled = false; }
    return;
  }
  const button = event.target.closest('[data-content-action]'); if (!button) return;
  const action = button.dataset.contentAction; const id = button.dataset.id;
  try {
    button.disabled = true;
    if (action === 'logout') await supabase.auth.signOut();
    else if (action === 'refresh') await loadContents();
    else if (action === 'delete-social-post') {
      const item = contents.find(entry => entry.id === id);
      const platform = platformNames[item?.platform] || '외부 채널';
      if (!window.confirm(platform + ' 게시물과 시선의 발행 항목을 영구 삭제할까요?')) { button.disabled = false; return; }
      await call('delete-social-post', { id });
      await loadContents();
    }
    else if (action === 'delete-facebook-post') {
      if (!window.confirm('Facebook 페이지에서 이 게시물을 삭제할까요? 게시물은 복구할 수 없습니다.')) { button.disabled = false; return; }
      await call('delete-facebook-post', { id });
      await loadContents();
    }
    else if (action === 'copy') {
      const item = contents.find((entry) => entry.id === id); const data = item?.content || {};
      const text = [data.title, data.intro, data.body, ...(data.headings || []), ...(data.tags || []).map((tag) => `#${tag}`)].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(text); button.textContent = '복사했어요'; setTimeout(() => { button.textContent = '네이버용 복사'; button.disabled = false; }, 1400);
    }

    else if (action === 'search-photos') {
      const card = button.closest('[data-content-card]');
      const output = card.querySelector('[data-photo-results]');
      const keywords = card.querySelector('[data-photo-keywords]').value.trim();
      const item = contents.find(entry => entry.id === id);
      if (!keywords || !item) throw new Error('사진 검색어를 입력해 주세요.');
      output.textContent = '카카오 이미지 검색에서 국내 사진을 찾고 있습니다…';
      try {
        const photos = await findPollPhotos(keywords);
        const cards = photos.map((info, index) => `<figure style="margin:0"><label><input type="radio" name="photo-${esc(id)}" data-photo-choice data-photo-url="${esc(info.imageUrl)}" data-photo-credit="${esc(info.sourceName || new URL(info.sourceUrl).hostname)}">후보 ${index + 1}
          <img style="display:block;width:100%;height:auto" alt="사진 후보 ${index + 1}" src="${esc(info.thumbnailUrl)}" referrerpolicy="no-referrer"></label>
          <figcaption><a href="${esc(info.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(info.sourceName || '원문 출처')} ↗</a></figcaption></figure>`);
        output.innerHTML = cards.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(155px,100%),1fr));gap:12px">${cards.join('')}</div>
            <button type="button" data-content-action="attach-photo" data-id="${esc(id)}">선택한 사진 첨부</button>`
          : '<p>카카오 이미지 검색에서 표시할 후보를 찾지 못했습니다.</p>';
        if (photos.length) {
          try {
            const first = photos[0];
            const preview = await previewPollPhoto(first, item.content?.title || item.issueTitle, card.querySelector('[data-photo-palette]').value, undefined, {...item.brief, platform:item.platform});
            output.insertAdjacentHTML('afterbegin', '<p>첫 번째 사진으로 만든 카드 시안</p><img class="content-image-preview" alt="사진 카드 시안" src="data:image/png;base64,' + preview + '">');
          } catch { /* Thumbnails and original source links remain available. */ }
        }
      } catch (error) {
        output.textContent = error.message || '사진 검색에 실패했습니다.';
      } finally {
        button.disabled = false;
      }
    }
    else if (action === 'attach-photo') {
      const selected = button.closest('[data-photo-results]').querySelector('[data-photo-choice]:checked');
      if (!selected) throw new Error('사진 후보 한 장을 선택해 주세요.');
      const item = contents.find(entry => entry.id === id);
      if (!item) throw new Error('홍보 초안을 찾을 수 없습니다.');
      let image;
      try {
        image = await previewPollPhoto({ imageUrl: selected.dataset.photoUrl, sourceName: selected.dataset.photoCredit }, item.content?.title || item.issueTitle, button.closest('[data-content-card]').querySelector('[data-photo-palette]').value, item.platform === 'instagram' ? 'image/jpeg' : 'image/png', {...item.brief, platform:item.platform});
      } catch {
        throw new Error('이 사진은 원본 사이트에서 직접 불러올 수 없습니다. 사용 가능한 원본 파일을 내려받아 카드에 넣을 사진에서 올려 주세요.');
      }
      await call('save-poll-share-card', { id, image });
      await loadContents();
    }
    else if (action === 'generate-image' || action === 'attach-finished-image') {
      const item = contents.find(entry => entry.id === id);
      if (!item) throw new Error('홍보 초안을 찾을 수 없습니다.');
      const input = button.closest('[data-content-card]')?.querySelector('[data-poll-photo]');
      const file = input?.files?.[0];
      if (action === 'attach-finished-image' && !file) throw new Error('카드에 넣을 사진에서 완성 이미지 파일을 선택해 주세요.');
      if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12000000)) throw new Error('12MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.');
      const photo = file ? await createImageBitmap(file) : null;
      if (file && !photo) throw new Error('사진을 열 수 없습니다.');
      try {
        const title = item.content?.title || item.issueTitle;
        const image = action === 'attach-finished-image'
          ? encodeFinishedCard(photo, ['instagram','threads'].includes(item.platform) ? 'image/jpeg' : 'image/png')
          : makePollShareCard({...item.brief, title, platform:item.platform, format: ['instagram','threads'].includes(item.platform) ? 'image/jpeg' : 'image/png', color: button.closest('[data-content-card]')?.querySelector('[data-photo-palette]')?.value},photo);
        await call('save-poll-share-card', {id, image});
      } finally { photo?.close(); }
      await loadContents();
    } else if (action === 'save') {
      const field = document.querySelector(`[data-content-json="${CSS.escape(id)}"]`);
      await call('save', { id, content: JSON.parse(field.value) }); await loadContents();
    } else if (action === 'regenerate') {
      if (!window.confirm('이 플랫폼 초안을 다시 생성할까요? 현재 수정본과 승인은 새 초안으로 바뀝니다.')) return;
      await call('regenerate', { id }); await loadContents();
    } else if (action === 'approve' || action === 'reject') {
      const note = window.prompt(action === 'approve' ? '출처와 균형을 확인했습니다. 검토 메모를 남길 수 있습니다.' : '이 초안을 검토 목록에서 제외할까요? 반려 사유는 비워도 됩니다.', '');
      if (note === null) { button.disabled = false; return; }
      await call('review', { id, decision: action === 'approve' ? 'approve' : 'reject', note }); await loadContents();
    } else if (action === 'publish' || action === 'manual-publish') {
      const scheduleInput = document.querySelector(`[data-schedule="${CSS.escape(id)}"]`);
      const urlInput = document.querySelector(`[data-post-url="${CSS.escape(id)}"]`);
      await call('queue', { id, scheduleAt: scheduleInput?.value ? new Date(scheduleInput.value).toISOString() : null, naverPostUrl: urlInput?.value || '' });
      await loadContents();
    } else if (action === 'retry') { await call('retry', { id }); await loadContents(); }
  } catch (error) { window.alert(error.message || '요청을 처리하지 못했습니다.'); button.disabled = false; }
});

window.addEventListener('siseon-admin-authenticated', () => {
  if (document.querySelector('#apiSettingsRoot')) renderApiSettings();
});

init();


function encodeFinishedCard(photo, format = 'image/png') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const scale = Math.min(1080 / photo.width, 1080 / photo.height);
  const width = photo.width * scale, height = photo.height * scale;
  ctx.fillStyle = '#102b24';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.drawImage(photo, (1080 - width) / 2, (1080 - height) / 2, width, height);
  const reduced = document.createElement('canvas');
  for (const size of [1080, 540, 360]) {
    if (size < 1080) {
      reduced.width = reduced.height = size;
      reduced.getContext('2d').drawImage(canvas, 0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(reduced, 0, 0, 1080, 1080);
    }
    const encoded = canvas.toDataURL(format, 0.9).split(',')[1];
    if (encoded.length <= 1800000) return encoded;
  }
  throw new Error('이미지 파일이 너무 큽니다. 더 작은 이미지를 선택해 주세요.');
}

function makePollShareCard(issue, photo = null, photoSize = 0) {
  if (photo) {
    const context = [issue.summary, issue.forView, issue.againstView]
      .map(value => String(value || '').split(/\n|(?<=[.!?。])\s/)[0].trim()).filter(Boolean);
    return renderPhotoFocusCard({
      photo, heading: issue.title, lines: issue.platform === 'facebook' ? context.slice(0, 1) : [],
      platform: issue.platform, credit: issue.credit, format: issue.format
    });
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const font = (size, weight=500) => { ctx.font = weight+' '+size+'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif'; };
  const panel = (x,y,w,h,color) => {
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,24);
    ctx.fill();
  };
  const wrap = (value,x,y,width,maxLines,lineHeight,color) => {
    const chars=Array.from(String(value || '').replace(/\s+/g,' ').trim());
    const lines=[];
    let line='';
    for(const char of chars) {
      if(line && ctx.measureText(line+char).width>width) { lines.push(line.trimEnd()); line=''; }
      line+=char;
    }
    if(line.trim()) lines.push(line.trimEnd());
    if(lines.length>maxLines) {
      let last=lines[maxLines-1];
      while(last && ctx.measureText(last+'…').width>width) last=last.slice(0,-1);
      lines[maxLines-1]=last.trimEnd()+'…';
    }
    ctx.fillStyle=color;
    lines.slice(0,maxLines).forEach((entry,i)=>ctx.fillText(entry,x,y+i*lineHeight));
  };
  const accent = issue.color || '#075239';
  ctx.fillStyle = '#faf5e9';
  ctx.fillRect(0,0,1080,1080);
  const originalPhoto = photo;
  const housingIllustration = !photo && /재개발|재건축/.test(issue.title || '');
  if (photo) {
    const photoHeight = 414;
    const ratio = Math.max(1080 / photo.width, photoHeight / photo.height);
    const sourceWidth = 1080 / ratio;
    const sourceHeight = photoHeight / ratio;
    const sourceLeft = (photo.width - sourceWidth) / 2;
    const strip = document.createElement('canvas');
    strip.width = photoSize || 1080;
    strip.height = Math.round(strip.width * photoHeight / 1080);
    strip.getContext('2d').drawImage(photo, sourceLeft, 0, sourceWidth, sourceHeight,
      0, 0, strip.width, strip.height);
    ctx.imageSmoothingEnabled = !photoSize;
    ctx.drawImage(strip, 0, 0, 1080, photoHeight);
    ctx.imageSmoothingEnabled = true;
  }
  if (housingIllustration) {
    const sky = ctx.createLinearGradient(0,0,0,414);
    sky.addColorStop(0,'#bdd9e3'); sky.addColorStop(1,'#f1e6c9');
    ctx.fillStyle = sky; ctx.fillRect(0,0,1080,414);
    const towers = [[35,117,146],[205,71,151],[380,134,153],[545,54,174],[746,98,148],[916,156,127]];
    for (const [x,y,width] of towers) {
      ctx.fillStyle='#d7c6a8'; ctx.fillRect(x+width-20,y+10,24,370-y);
      ctx.fillStyle='#f4e9d4'; ctx.fillRect(x,y,width-20,380-y);
      ctx.fillStyle='#6c858c';
      for(let floor=y+24;floor<359;floor+=31) {
        for(let column=x+13;column<x+width-35;column+=29) ctx.fillRect(column,floor,15,15);
      }
    }
    ctx.fillStyle='#38594b'; ctx.fillRect(0,380,1080,34);
  }
  panel(965,15,70,65,'#123d35');
  ctx.strokeStyle='#dcebdc'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(976,48); ctx.quadraticCurveTo(1000,21,1024,48); ctx.quadraticCurveTo(1000,75,976,48); ctx.stroke();
  ctx.fillStyle='#d7ee83'; ctx.beginPath(); ctx.arc(1000,48,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#123d35'; ctx.beginPath(); ctx.arc(1000,48,3,0,Math.PI*2); ctx.fill();
  const top = photo || housingIllustration ? 420 : 160;
  if (housingIllustration) { font(21,600); wrap('아파트 단지 예시 삽화',55,top+23,950,1,25,accent); }
  if (issue.credit) { font(21,600); wrap('사진 · ' + issue.credit,55,top+23,950,1,25,accent); }
  font(52,800); wrap(issue.title,55,top+91,970,3,58,accent);
  const rows = [['배경',issue.summary],['찬성 의견',issue.forView],['반대 의견',issue.againstView]].filter(([,value])=>String(value || '').trim());
  rows.forEach(([label,value],index)=>{
    const y=top+250+index*99;
    panel(55,y-10,148,57,accent);
    font(25,800); wrap(label,68,y+27,128,1,30,'#fff');
    font(29,600); wrap(value,224,y+15,793,2,34,'#20342c');
    ctx.fillStyle='#d8ded1'; ctx.fillRect(55,y+66,970,1);
  });
  panel(265,986,550,64,accent);
  font(32,800); wrap('시선에서 안건 읽기',405,1028,380,1,36,'#fff');
  const image = canvas.toDataURL(issue.format || 'image/png', 0.9).split(',')[1];
  if (image.length <= 1800000) return image;
  if (photo && photoSize !== 360) return makePollShareCard(issue, originalPhoto, photoSize ? 360 : 540);
  throw new Error('카드 파일이 너무 큽니다. 다른 사진을 선택해 주세요.');
}

function makeSocialCardSet(issue, draft, [cover, detail, choice]) {
  if (draft.platform === 'facebook') return makeFacebookCards(issue, cover, detail, choice);
  const platform = draft.platform;
  const baseStyle = pickPhotoCardStyle(cover || detail || choice);
  const style = { ...baseStyle, top: platform === 'threads', highlight: platform === 'threads' ? '#e3f7f4' : baseStyle.highlight };
  const heading = draft.content?.title || issue.title;
  const fact = String(issue.summary || '').split('확인된 사실\n')[1]?.split('\n').find(line => line.trim())?.replace(/^\s*•\s*/, '') || '';
  const render = (photo, text, label, lines = []) => renderPhotoFocusCard({
    photo, heading: text, label, lines, platform, style, fixedBand: true,
    credit: photo ? 'AI 생성 이미지' : '', format: 'image/jpeg'
  });
  return [
    render(cover, heading, ''),
    render(detail, platform === 'instagram' ? '선택을 가르는 조건' : '어떤 조건이 선택을 바꿀까요?', '핵심 갈등', fact ? [fact] : []),
    render(choice, platform === 'instagram' ? '당신의 선택은?' : '여러분이라면 어떻게 하겠어요?', '', [platform === 'instagram' ? '프로필 링크에서 안건 보기' : '시선에서 안건 확인하기'])
  ];
}

function makeFacebookCards(issue, cover, detail, choice) {
  const style = pickPhotoCardStyle(cover || detail);
  const originalTitle = String(issue.title || '');
  const employment = /일용직/.test(originalTitle) && /실업급여/.test(originalTitle) && /부정/.test(originalTitle) && /제재/.test(originalTitle);
  const foodComparison = /라면\s*(?:vs\.?|대|과|그리고)\s*통조림/i.test(originalTitle);
  const voting = /사전투표/.test(originalTitle) && /폐지|없앨/.test(originalTitle);
  const coverTitle = foodComparison ? '라면 vs 통조림' : employment ? '일용직 실업급여 부정수급' : voting ? '사전투표' : originalTitle;
  const coverQuestion = foodComparison ? '무엇을 먼저 챙길까?' : employment ? '제재를 더 강화할까?' : voting ? '유지할까, 없앨까?' : '';
  const source = issue.sources?.[0];
  const facts = String(issue.summary || '').split('확인된 사실\n')[1]?.split('\n').map(line => line.replace(/^\s*•\s*/, '').trim()).filter(Boolean) || [];
  const render = (label, heading, lines, photo, highlight, coverLayout) => renderPhotoFocusCard({
    photo, heading, lines, label, highlight, coverLayout, style, platform:'facebook', fixedBand:true,
    credit:photo ? 'AI 생성 이미지' : '', format:'image/jpeg'
  });
  const factLines = source && facts.length ? [facts[0], '자료 출처 · ' + new URL(source).hostname] : ['확인할 자료는 안건 페이지에서 확인해 주세요.'];
  return [
    render('',coverTitle,coverQuestion ? [coverQuestion] : [],cover || detail,coverQuestion, foodComparison ? { kicker: /전쟁|전시/.test(originalTitle) ? '전쟁 상황에서' : '비상식량을 고른다면' } : undefined),
    render('팩트 체크','먼저 확인할 내용',factLines,detail),
    render('','다른 사람들은 어떤 선택을 했을까요?',['시선에서 안건 읽고 투표 확인하기'],choice,'시선에서 안건 읽고 투표 확인하기')
  ];
}

function renderPhotoFocusCard({photo, heading, lines = [], platform, credit, label, highlight, accent, coverLayout, style = pickPhotoCardStyle(photo), fixedBand = false, format = 'image/png'}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const theme = style;
  ctx.fillStyle = accent || theme.background;
  ctx.fillRect(0,0,1080,1080);
  if (photo) {
    const scale = Math.max(1080 / photo.width,1080 / photo.height);
    ctx.drawImage(photo,(1080-photo.width*scale)/2,0,photo.width*scale,photo.height*scale);
  }
  const putAtTop = Boolean(coverLayout) || theme.top;
  const fontFamily = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  const wrap = (value, size, weight, maxLines) => {
    ctx.font = weight + ' ' + size + 'px ' + fontFamily;
    const rows = [];
    let line = '';
    const words = String(value || '').trim().match(/\S+\s+(?:vs\.?|대)\s+\S+|\S+/gi) || [];
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > 890) { rows.push(line); line = word; }
      else line = next;
    }
    if (line) rows.push(line.trim());
    if (rows.length > maxLines) {
      let last = rows[maxLines-1];
      while (last && ctx.measureText(last+'…').width > 890) last=last.slice(0,-1);
      rows[maxLines-1]=last.trimEnd()+'…';
    }
    return rows.slice(0,maxLines);
  };
  let titleSize = coverLayout ? 88 : Math.max(43,Math.min(platform === 'instagram' ? 79 : platform === 'threads' ? 67 : 72, Math.floor(1240 / Math.sqrt(String(heading || '').length || 1))));
  const maxTitleLines = label ? 2 : 3;
  let titleRows = coverLayout ? [heading] : wrap(heading, titleSize, 800, maxTitleLines);
  // Keep long titles readable without breaking the subjects around “vs”.
  while (!coverLayout && titleSize > 40 && (titleRows.at(-1)?.endsWith('…') || titleRows.some(row => ctx.measureText(row).width > 890))) {
    titleSize -= 2;
    titleRows = wrap(heading, titleSize, 800, maxTitleLines);
  }
  const detailSize = coverLayout ? 43 : !label && highlight ? 54 : 31;
  const detailStep = detailSize * 1.3;
  const detailRows = lines.filter(Boolean).flatMap(line=>wrap(line,detailSize,700,2)).slice(0,4);
  const titleHeight = titleSize * 1.2;
  const heightNeeded = titleRows.length*titleHeight + detailRows.length*detailStep + (detailRows.length ? 18 : 0);
  const textTop = coverLayout ? 129 : putAtTop ? (label ? 164 : 132) : 965-heightNeeded;
  const fade = ctx.createLinearGradient(0,0,0,1080);
  const solid = theme.background;
  if (coverLayout) {
    fade.addColorStop(0, solid+'e8');
    fade.addColorStop(.24, solid+'bd');
    fade.addColorStop(.49, solid+'00');
  } else if (putAtTop) {
    const textEnd = Math.min(.7, (textTop + heightNeeded) / 1080);
    fade.addColorStop(0, solid+'eb');
    fade.addColorStop(textEnd, solid+'ba');
    fade.addColorStop(Math.min(1, textEnd + .17), solid+'00');
  } else {
    const textStart = Math.max(.18, textTop / 1080);
    fade.addColorStop(Math.max(0, textStart - .15), solid+'00');
    fade.addColorStop(textStart, solid+'b0');
    fade.addColorStop(1, solid+'eb');
  }
  ctx.fillStyle = fade; ctx.fillRect(0,0,1080,1080);
  ctx.textBaseline='top';
  ctx.fillStyle='#fff';
  ctx.font='800 '+titleSize+'px '+fontFamily;
  const keywords = /실업급여 부정수급(?: 의혹)?|재개발·재건축|최저임금|실업급여|사전투표|재개발|재건축|주택 공급|인공지능|AI 안경|보유세|투표 결과|투표하기/;
  const titleHighlight = String(heading || '').match(/\S+\s+(?:vs\.?|대)\s+\S+/i)?.[0] || String(heading || '').match(keywords)?.[0];
  const firstFact = String(lines[0] || '');
  const numberWithUnit = firstFact.match(/\d[\d,.]*\s*(?:만\s*)?(?:명|가구|건|%|원)/)?.[0];
  const detailHighlight = highlight || numberWithUnit;
  const drawEmphasis = (rows, firstY, step, phrase) => {
    let highlighted = false;
    rows.forEach((line,i)=>{
      const y=firstY+i*step;
      const at = highlighted || !phrase ? -1 : line.indexOf(phrase);
      ctx.fillStyle='#fff';
      ctx.fillText(line,94,y,890);
      if (at < 0) return;
      ctx.fillStyle=theme.highlight;
      const scale = Math.min(1,890 / ctx.measureText(line).width);
      ctx.fillText(phrase,94+ctx.measureText(line.slice(0,at)).width*scale,y,ctx.measureText(phrase).width*scale);
      highlighted=true;
    });
  };
  if (coverLayout) {
    ctx.font = '700 32px ' + fontFamily;
    ctx.fillStyle = '#fff';
    ctx.fillText(coverLayout.kicker, 94, 75, 890);
    ctx.font = '800 ' + titleSize + 'px ' + fontFamily;
  }
  drawEmphasis(titleRows,textTop,titleHeight,coverLayout ? heading : highlight ? '' : titleHighlight || (!fixedBand ? titleRows[0] : ''));
  ctx.font='700 '+detailSize+'px '+fontFamily;
  drawEmphasis(detailRows,textTop+titleRows.length*titleHeight+18,detailStep,coverLayout ? '' : detailHighlight);
  if(label) {
    ctx.font='800 26px '+fontFamily; ctx.fillStyle=theme.highlight;
    ctx.fillText(label,94,textTop-39);
  }
  ctx.fillStyle='#123d35'; ctx.beginPath(); ctx.roundRect(960,30,80,80,20); ctx.fill();
  ctx.strokeStyle='#dcebdc'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(975,70); ctx.quadraticCurveTo(1000,43,1025,70); ctx.quadraticCurveTo(1000,97,975,70); ctx.stroke();
  ctx.fillStyle='#d7ee83'; ctx.beginPath(); ctx.arc(1000,70,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#123d35'; ctx.beginPath(); ctx.arc(1000,70,3,0,Math.PI*2); ctx.fill();
  if (credit) {
    ctx.font='500 22px '+fontFamily;
    const label='사진 · '+String(credit).slice(0,70);
    ctx.fillStyle='rgba(8,14,12,.76)'; ctx.fillRect(65,1020,Math.min(950,ctx.measureText(label).width+34),37);
    ctx.fillStyle='#fff'; ctx.fillText(label,82,1025,915);
  }
  const image = canvas.toDataURL(format,.9).split(',')[1];
  if (image.length <= 1800000) return image;
  return encodeFinishedCard(canvas,format);
}

function pickPhotoCardStyle(photo) {
  const palettes = [
    {background:'#102e26',highlight:'#b8f2c5'},
    {background:'#17293d',highlight:'#c6e6ff'},
    {background:'#352316',highlight:'#ffdf9b'},
    {background:'#332139',highlight:'#f1d2ff'}
  ];
  const sample = document.createElement('canvas');
  sample.width=sample.height=12;
  let top = false;
  let index = Math.floor(Math.random()*palettes.length);
  if (photo) {
    const ctx=sample.getContext('2d');
    ctx.drawImage(photo,0,0,12,12);
    const data=ctx.getImageData(0,0,12,12).data;
    const light=i=>(data[i]*.21+data[i+1]*.72+data[i+2]*.07);
    let upper=0, lower=0, warm=0, green=0;
    for(let i=4;i<data.length;i+=4) {
      const row=Math.floor(i/48);
      if(i%48) {
        if(row<4) upper+=Math.abs(light(i)-light(i-4));
        if(row>=8) lower+=Math.abs(light(i)-light(i-4));
      }
      warm+=data[i]-data[i+2];
      green+=data[i+1]-(data[i]+data[i+2])/2;
    }
    top=upper<lower*.78;
    const preferred=green>850?0:warm>2400?2:1;
    index=Math.random()<.78?preferred:index;
  }
  return {...palettes[index],top};
}
