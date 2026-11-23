import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const root = () => document.querySelector('#contentAutomationRoot');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const platformNames = { instagram: '인스타그램', threads: '스레드', facebook: '페이스북', naver_blog: '네이버 블로그' };
let supabase; let currentUser = null; let isAdmin = false; let contents = [];

function renderNotice(message, isError = false) {
  const target = root();
  if (target) target.innerHTML = `<div class="moderation-guidance"><strong>${isError ? '확인 필요' : '안내'}</strong><span>${esc(message)}</span></div>`;
}
async function call(action, data = {}) {
  const { data: result, error } = await supabase.functions.invoke('content-admin', { body: { ...data, action } });
  if (error) throw new Error(result?.error || error.message || '서버 요청에 실패했습니다.');
  if (result?.error) throw new Error(result.error);
  return result;
}
function platformContentShape(item) { return item.content || {}; }
function render() {
  const target = root(); if (!target) return;
  const counts = contents.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {});
  target.innerHTML = `
    <div class="content-auto-toolbar"><div><strong>승인 전 자동 발행 차단</strong><p>게시물은 관리자 검토·승인 후에만 예약 대기열에 들어갑니다. 네이버 블로그는 복사·수동 게시 방식입니다.</p><p>계정 토큰은 서버 Secret으로 등록합니다. 페이지 안에서는 토큰을 표시하거나 입력하지 않습니다.</p></div><button type="button" class="table-action" data-content-action="refresh">새로고침</button></div>
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
  const publishedLink = item.externalPostUrl ? `<p><a href="${esc(item.externalPostUrl)}" target="_blank" rel="noopener noreferrer">게시물 확인 ↗</a></p>` : '';
  const scheduleLabel = item.scheduledAt ? `<p class="admin-footnote">게시 예약 시각: ${esc(new Date(item.scheduledAt).toLocaleString('ko-KR'))} · 작업 ${esc(item.jobStatus || '')} · 재시도 ${Number(item.retryCount || 0)}회</p>` : '';
  const buttons = [
    editable ? '<button type="button" data-content-action="save" data-id="' + esc(item.id) + '">수정 저장</button>' : '',
    editable ? '<button type="button" data-content-action="regenerate" data-id="' + esc(item.id) + '">AI 재생성</button>' : '',
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
    <p class="admin-footnote">출처: ${sourceLinks}</p>${scheduleLabel}${jobState}${publishedLink}<div class="content-auto-actions">${buttons}</div></article>`;
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
    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      currentUser = user; isAdmin = false;
      const updateAuthView = async () => {
        if (user) { try { await call('list'); isAdmin = true; } catch { isAdmin = false; } }
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
    else if (action === 'save') {
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

init();
