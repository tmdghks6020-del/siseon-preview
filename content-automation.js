import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const root = () => document.querySelector('#contentAutomationRoot');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const platformNames = { instagram: '인스타그램', threads: '스레드', facebook: '페이스북', naver_blog: '네이버 블로그' };
let supabase; let currentUser = null; let isAdmin = false; let contents = [];
function topicDraftFromRow(row) {
  return {
    id: row.id, batchId: row.batch_id, category: row.category, title: row.title, intro: row.intro,
    trendingReason: row.trending_reason, facts: row.facts || [], source: row.source, sourceUrl: row.source_url,
    sourceDate: row.source_date, forText: row.for_text, againstText: row.against_text,
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
function render() {
  const target = root(); if (!target) return;
  const counts = contents.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {});
  target.innerHTML = `
    <div class="content-auto-toolbar"><div><strong>승인 전 자동 발행 차단</strong><p>게시물은 관리자 검토·승인 후에만 예약 대기열에 들어갑니다. 네이버 블로그는 복사·수동 게시 방식입니다.</p><p>서비스 키와 계정 토큰은 API 설정에서 서버에 암호화 저장합니다.</p></div><button type="button" class="table-action" data-content-action="refresh">새로고침</button></div>
    <form id="contentGenerationForm" class="announcement-editor content-generation-form">
      <h2>이슈 콘텐츠 만들기</h2>
      <div class="content-form-grid"><label>이슈 ID<input name="issueId" maxlength="100" required placeholder="예: issue-week-four-day"></label><label>이슈 제목<input name="title" maxlength="240" required placeholder="이슈 제목"></label></div>
      <label>이슈 요약<textarea name="summary" rows="3" maxlength="4000" placeholder="배경과 쟁점"></textarea></label>
      <div class="content-form-grid"><label>찬성 관점<textarea name="forView" rows="3" maxlength="2500"></textarea></label><label>반대 관점<textarea name="againstView" rows="3" maxlength="2500"></textarea></label></div>
      <label>확인한 출처 URL (한 줄에 하나씩)<textarea name="sources" rows="3" placeholder="https://..." required></textarea></label>
      <button class="primary-button" type="submit">AI 플랫폼별 초안 생성</button>
      <p class="admin-footnote">생성 결과는 검토 대기 상태로만 저장됩니다. 출처·사실 관계를 직접 확인하세요. 콘텐츠 생성은 OpenAI 사용량에 따라 비용이 발생합니다.</p>
    </form>
    <div class="content-status-strip"><span>검토 대기 <b>${counts.review_required || 0}</b></span><span>승인 <b>${counts.approved || 0}</b></span><span>예약·발행 대기 <b>${counts.queued || 0}</b></span><span>발행 완료 <b>${counts.published || 0}</b></span><span>실패 <b>${counts.failed || 0}</b></span></div>
    <div class="content-auto-list">${contents.map(renderContent).join('') || '<p class="table-empty">아직 생성된 콘텐츠가 없습니다.</p>'}</div>`;
}
function renderContent(item) {
  const statusLabel = ({ review_required: '검토 대기', approved: '승인 완료', rejected: '반려', queued: '게시 대기', publishing: '게시 중', published: '게시 완료', failed: '게시 실패' })[item.status] || item.status;
  const editable = !['published', 'publishing'].includes(item.status);
  const sourceLinks = (item.sources || []).map((url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`).join(' · ') || '등록된 출처 없음';
  const jsonValue = JSON.stringify(platformContentShape(item), null, 2);
  const jobState = item.errorMessage ? `<p class="content-error">${esc(item.errorMessage)}</p>` : '';
  const imageUrl = /^https:\/\//i.test(item.content?.imageUrl || '') ? item.content.imageUrl : '';
  const imagePreview = item.platform === 'instagram' && imageUrl ? `<img class="content-image-preview" src="${esc(imageUrl)}" alt="Instagram 홍보 이미지 시안" loading="lazy">` : '';
  const publishedLink = item.externalPostUrl ? `<p><a href="${esc(item.externalPostUrl)}" target="_blank" rel="noopener noreferrer">게시물 확인 ↗</a></p>` : '';
  const scheduleLabel = item.scheduledAt ? `<p class="admin-footnote">게시 예약 시각: ${esc(new Date(item.scheduledAt).toLocaleString('ko-KR'))} · 작업 ${esc(item.jobStatus || '')} · 재시도 ${Number(item.retryCount || 0)}회</p>` : '';
  const buttons = [
    editable ? '<button type="button" data-content-action="save" data-id="' + esc(item.id) + '">수정 저장</button>' : '',
    editable ? '<button type="button" data-content-action="regenerate" data-id="' + esc(item.id) + '">AI 재생성</button>' : '',
    item.platform === 'instagram' && ['review_required','rejected'].includes(item.status) ? `<button type="button" data-content-action="generate-image" data-id="${esc(item.id)}">${imageUrl ? '이미지 시안 다시 만들기' : 'Instagram 이미지 시안 생성'}</button>` : '',
    ['review_required', 'rejected'].includes(item.status) ? '<button type="button" data-content-action="approve" data-id="' + esc(item.id) + '">검토 후 승인</button>' : '',
    ['review_required', 'approved'].includes(item.status) ? '<button type="button" data-content-action="reject" data-id="' + esc(item.id) + '">반려</button>' : '',
    item.status === 'approved' && item.platform === 'naver_blog' ? '<label class="content-post-url">네이버 게시물 주소<input type="url" data-post-url="' + esc(item.id) + '" placeholder="수동 게시 후 URL 입력"></label><button type="button" data-content-action="manual-publish" data-id="' + esc(item.id) + '">게시 완료 기록</button>' : '',
    item.platform === 'naver_blog' ? '<button type="button" data-content-action="copy" data-id="' + esc(item.id) + '">네이버용 복사</button>' : '',
    item.status === 'approved' && item.platform !== 'naver_blog' ? '<label class="content-schedule">게시 예약<input type="datetime-local" data-schedule="' + esc(item.id) + '"></label><button type="button" data-content-action="publish" data-id="' + esc(item.id) + '">예약 / 지금 게시</button>' : '',
    item.status === 'failed' ? '<button type="button" data-content-action="retry" data-id="' + esc(item.id) + '">재시도</button>' : ''
  ].filter(Boolean).join('');
  return `<article class="content-auto-card" data-content-card="${esc(item.id)}"><div class="content-auto-card-head"><div><span class="announcement-category">${esc(platformNames[item.platform] || item.platform)}</span><small>${esc(item.issueTitle || item.issueId || '')}</small></div><span class="admin-status ${['approved','queued','published'].includes(item.status) ? 'status-good' : item.status === 'failed' || item.status === 'rejected' ? 'status-blocked' : 'status-warn'}">${esc(statusLabel)}</span></div>
    <details><summary>초안 미리보기 · JSON 수정</summary><pre class="content-preview">${esc(JSON.stringify(platformContentShape(item), null, 2))}</pre></details>
    ${editable ? `<label>플랫폼별 콘텐츠 JSON<textarea data-content-json="${esc(item.id)}" rows="12" spellcheck="false">${esc(jsonValue)}</textarea></label>` : ''}
    ${imagePreview}<p class="admin-footnote">출처: ${sourceLinks}</p>${scheduleLabel}${jobState}${publishedLink}<div class="content-auto-actions">${buttons}</div></article>`;
}
const integrationMeta = {
  openai: { title: '1. OpenAI', group: 'site', description: '첫 번째 생성 서비스 · 한도나 장애 발생 시 Gemini로 전환합니다.', fields: [{ name: 'apiKey', label: 'OpenAI API 키', type: 'password', placeholder: '저장한 키는 다시 표시되지 않습니다.' },{name:'model',label:'텍스트 모델 (선택)',type:'text',placeholder:'gpt-6.2-astra'}] },
  gemini: { title: '2. Google Gemini', group: 'site', description: 'AI Studio 키로 연결합니다. 무료 사용 가능 여부와 한도는 계정·모델별로 다릅니다.', fields: [{name:'apiKey',label:'Gemini API 키',type:'password',placeholder:'Google AI Studio에서 발급한 키'},{name:'model',label:'모델 (선택)',type:'text',placeholder:'gemini-3.5-flash-lite'}] },
  groq: { title: '3. Groq', group: 'site', description: '제공된 뉴스 자료를 바탕으로 초안을 만듭니다. 이 연결에서는 웹 검색을 수행하지 않습니다.', fields: [{name:'apiKey',label:'Groq API 키',type:'password',placeholder:'Groq Console에서 발급한 키'},{name:'model',label:'모델 (선택)',type:'text',placeholder:'openai/gpt-oss-120b'}] },
  cloudflare: { title: '4. Cloudflare Workers AI', group: 'site', description: '마지막 텍스트 생성 서비스입니다. Workers AI 권한 토큰과 Account ID가 필요합니다.', fields: [{name:'apiKey',label:'Cloudflare API 토큰',type:'password',placeholder:'Workers AI 사용 권한이 있는 토큰'},{name:'accountId',label:'Cloudflare Account ID',type:'text',placeholder:'32자리 Account ID'},{name:'model',label:'텍스트 모델 (선택)',type:'text',placeholder:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'}] },
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
  target.innerHTML = '<p>안전한 서버 저장소의 연결 상태를 확인하고 있습니다.</p>';
  try {
    const rows = await getIntegrations(); const statusMap = new Map(rows.map((row) => [row.provider, row]));
    const card = (provider) => {
      const meta = integrationMeta[provider]; const row = statusMap.get(provider); const active = row?.status === 'connected';
      const fields = meta.fields.map((field) => `<label>${esc(field.label)}<input name="${field.name}" type="${field.type}" ${field.name === 'apiKey' ? 'autocomplete="new-password"' : ''} placeholder="${esc(field.placeholder)}" ${field.name === 'model' || provider === 'threads' && field.name === 'accountId' ? '' : 'required'}></label>`).join('');
      const tested = (row?.last_tested_at ? `마지막 확인 ${esc(new Date(row.last_tested_at).toLocaleString('ko-KR'))}` : '아직 연결 테스트를 하지 않았습니다.') + (row?.cooldown_until && Date.parse(row.cooldown_until)>Date.now() ? ` · ${esc(new Date(row.cooldown_until).toLocaleTimeString('ko-KR'))} 이후 재시도` : '');
      const error = row?.status === 'error' && row.last_error ? `<p class="integration-error">${esc(row.last_error)}</p>` : '';
      return `<article class="integration-card"><div class="integration-card-head"><div>${connectionLight(row?.status)}<h3>${esc(meta.title)}</h3></div><span class="integration-state ${active ? 'active' : 'inactive'}">${active ? '활성' : '비활성'}</span></div><p>${esc(meta.description)}</p>${active ? `<small class="integration-account">연결 계정 · ${esc(row.account_label || '연결됨')} · ${tested}</small>` : `<small class="integration-account">${tested}</small>`}${error}<form data-integration-form="${provider}">${fields}<div class="integration-actions"><button class="primary-button" type="submit">저장하고 연결 테스트</button><button type="button" class="table-action" data-integration-action="test" data-provider="${provider}">저장된 정보 테스트</button>${row ? `<button type="button" class="table-action" data-integration-action="disconnect" data-provider="${provider}">연결 해제</button>` : ''}</div><p class="admin-footnote" data-integration-message="${provider}" aria-live="polite"></p></form></article>`;
    };
    target.innerHTML = `<section class="integration-group"><div class="integration-group-heading"><div><span class="section-kicker">SITE BASICS</span><h2>사이트 기본 설정</h2><p>사이트 데이터 연결과 AI 기능을 관리합니다.</p></div><span class="integration-summary"><i class="connection-light is-on"></i>Supabase 서버 연결됨</span></div><p>텍스트 자동 전환: OpenAI → Gemini → Groq → Cloudflare. 미연결 서비스는 건너뛰며, 한도·장애 발생 시 잠시 대기 후 우선순위대로 다시 시도합니다. 이미지 생성은 OpenAI 전용입니다.</p><button type="button" class="table-action" data-integration-action="fallback-test">자동 전환 경로 테스트</button><p id="aiFallbackTestResult" aria-live="polite"></p><div class="integration-grid">${card('openai')}${card('gemini')}${card('groq')}${card('cloudflare')}</div></section><section class="integration-group"><div class="integration-group-heading"><div><span class="section-kicker">MARKETING & ADS</span><h2>마케팅·광고 채널</h2><p>연결된 채널만 투표 관리에서 홍보 초안 생성 대상으로 선택할 수 있습니다.</p></div></div><div class="integration-grid">${card('instagram')}${card('threads')}${card('facebook')}<article class="integration-card integration-manual"><div class="integration-card-head"><div><span class="connection-light is-manual"></span><h3>네이버 블로그</h3></div><span class="integration-state manual">수동 게시</span></div><p>네이버 공식 블로그 글쓰기 API는 종료되어 직접 자동 게시 연결을 제공할 수 없습니다.</p><small class="integration-account">콘텐츠 자동화에서 원고를 복사해 블로그에 직접 게시할 수 있습니다.</small></article></div></section><p class="integration-security-note">API 키와 액세스 토큰은 Supabase Vault에 암호화해 저장합니다. 이 화면은 저장된 비밀값을 다시 표시하지 않습니다. AI 연결 테스트는 짧은 실제 생성 요청이며 사용량이 소모될 수 있습니다. 초록색은 마지막 테스트 성공을 뜻하며 무료 한도나 잔액을 보장하지 않습니다. 마케팅 채널 테스트는 계정 접근만 확인합니다.</p>`;
  } catch (error) { target.innerHTML = `<div class="moderation-guidance"><strong>연결 확인 실패</strong><span>${esc(error.message)}. 새 API 설정 데이터베이스 구조가 아직 배포되지 않았는지 확인해 주세요.</span></div>`; }
}
async function loadContents() {
  if (!isAdmin) return;
  renderNotice('콘텐츠와 게시 이력을 불러오는 중입니다.');
  try { ({ contents } = await call('list')); render(); }
  catch (error) { renderNotice(error.message || '콘텐츠를 불러오지 못했습니다.', true); }
}
function renderAuthState() {
  const target = root(); if (!target) return;
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
      async generateForPoll(issue, selectedPlatforms) {
        if (!isAdmin) throw new Error('운영자 로그인이 필요합니다.');
        const result = await call('generate', { ...issue, platforms: selectedPlatforms });
        await loadContents();
        return result;
      }
    };
    window.SISEON_TOPIC_ADMIN = {
      async list() {
        const { candidates, guidelines } = await call('topics-list');
        const guidelineView = document.querySelector('#topicGuidelinesText');
        if (guidelineView) guidelineView.textContent = guidelines?.text ? `적용 버전: ${guidelines.version}\n\n${guidelines.text}` : '서버에 새 작성 지침이 아직 배포되지 않았습니다. content-admin 함수를 업데이트해 주세요.';
        const mapped = (candidates || []).map(topicDraftFromRow);
        window.dispatchEvent(new CustomEvent('siseon-topic-candidates-loaded', { detail: { candidates: mapped } }));
        return mapped;
      },
      async generate(payload) {
        const result = await call('topics-generate', payload);
        const candidates = await this.list();
        return { ...result, candidates };
      },
      async save(draft) {
        await call('topics-save', {
          id: draft.id, category: draft.category, title: draft.title, intro: draft.intro,
          trendingReason: draft.trendingReason, facts: draft.facts, source: draft.source,
          sourceDate: draft.sourceDate, sourceUrl: draft.sourceUrl, forText: draft.forText, againstText: draft.againstText
        });
        return this.list();
      },
      async review(id, decision, note = '') {
        await call('topics-review', { id, decision, note });
        return this.list();
      }
    };
    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
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
    const credentials = ['openai','gemini','groq','cloudflare'].includes(provider)
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
    else if (action === 'copy') {
      const item = contents.find((entry) => entry.id === id); const data = item?.content || {};
      const text = [data.title, data.intro, data.body, ...(data.headings || []), ...(data.tags || []).map((tag) => `#${tag}`)].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(text); button.textContent = '복사했어요'; setTimeout(() => { button.textContent = '네이버용 복사'; button.disabled = false; }, 1400);
    }
    else if (action === 'generate-image') {
      const field = document.querySelector(`[data-content-json="${CSS.escape(id)}"]`);
      const content = field ? JSON.parse(field.value) : {};
      await call('image-generate', { id, imageBrief: content.imageBrief || '' }); await loadContents();
    } else if (action === 'save') {
      const field = document.querySelector(`[data-content-json="${CSS.escape(id)}"]`);
      await call('save', { id, content: JSON.parse(field.value) }); await loadContents();
    } else if (action === 'regenerate') {
      if (!window.confirm('이 플랫폼 초안을 다시 생성할까요? 현재 수정본과 승인은 새 초안으로 바뀝니다.')) return;
      await call('regenerate', { id }); await loadContents();
    } else if (action === 'approve' || action === 'reject') {
      const note = window.prompt(action === 'approve' ? '출처와 균형을 확인했습니다. 검토 메모를 남길 수 있습니다.' : '반려 사유를 입력해 주세요.', '');
      if (note === null || (action === 'reject' && !note.trim())) return;
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
