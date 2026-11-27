const homeView = document.querySelector('#homeView');
let memberPageLoad = 0;
const issueView = document.querySelector('#issueView');
const pollBoardView = document.querySelector('#pollBoardView');
const announcementsView = document.querySelector('#announcementsView');
const archiveView = document.querySelector('#archiveView');
const openTalkView = document.querySelector('#openTalkView');
const topicSuggestionsView = document.querySelector('#topicSuggestionsView');
const loginDialog = document.querySelector('#loginDialog');
const nicknameDialog = document.querySelector('#nicknameDialog');
const postDialog = document.querySelector('#postDialog');
const loginButton = document.querySelector('#loginButton');
const previousStoragePrefix = 'dugyeon:';
const storagePrefix = 'siseon:';
localStorage.removeItem(`${storagePrefix}demo-auth`);
const previousStorageKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key) => key?.startsWith(previousStoragePrefix));
previousStorageKeys.forEach((key) => {
  const migratedKey = `${storagePrefix}${key.slice(previousStoragePrefix.length)}`;
  if (localStorage.getItem(migratedKey) === null) localStorage.setItem(migratedKey, localStorage.getItem(key));
  localStorage.removeItem(key);
});
let pendingMemberAction = null;
let memberSession = null;
const memberVoteChoices = new Map();
const memberVoteResults = new Map();
const issuePostsCache = new Map();
const issueCommentsCache = new Map();
const visitRecordedFor = new Set();
const memberInterestedSuggestions = new Set();
let activityTrackingInterval = null;
const authConfig = window.SISEON_SUPABASE_CONFIG;
const memberAuth = window.supabase?.createClient && authConfig?.url && authConfig?.publishableKey
  ? window.supabase.createClient(authConfig.url, authConfig.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
const trafficChannels = {direct:'직접 방문 / 출처 미확인',google:'Google',naver:'네이버',daum:'다음',facebook:'Facebook',instagram:'Instagram',threads:'Threads',kakao:'카카오톡·카카오',other:'기타 유입'};
function visitChannel() {
  const campaign = new URLSearchParams(location.search).get('utm_source')?.trim().toLowerCase();
  if (campaign && Object.hasOwn(trafficChannels, campaign)) return campaign;
  if (campaign === 'kakaotalk') return 'kakao';
  if (campaign === 'fb') return 'facebook';
  if (campaign === 'ig') return 'instagram';
  if (campaign) return 'other';
  if (!document.referrer) return 'direct';
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === location.origin) return 'direct';
    const host = referrer.hostname.toLowerCase();
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
    const domains = {naver:['naver.com','naver.me'],daum:['daum.net'],facebook:['facebook.com','fb.com'],instagram:['instagram.com'],threads:['threads.net','threads.com'],kakao:['kakao.com','kakaocorp.com']};
    return Object.keys(domains).find(channel => domains[channel].some(domain => host === domain || host.endsWith('.' + domain))) || 'other';
  } catch { return 'direct'; }
}
async function recordSiteVisit() {
  if (!memberAuth || new URLSearchParams(location.search).get('view') === 'admin') return;
  try {
    const day = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date());
    const storageKey = 'siseon:daily-visitor';
    const previous = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const visitor = previous?.day === day ? previous.id : crypto.randomUUID();
    if (previous?.day !== day) localStorage.setItem(storageKey, JSON.stringify({day,id:visitor}));
    await memberAuth.rpc('record_site_visit', {visitor, origin_channel:visitChannel()});
  } catch { /* Visit tracking is optional for browsing. */ }
}
void recordSiteVisit();

async function renderTodayTraffic(panel) {
  try {
    const {data,error} = await memberAuth.rpc('admin_today_site_visits');
    if (error) throw error;
    const rows = data || [];
    const total = rows.reduce((sum,row) => sum + Number(row.visitors), 0);
    panel.querySelector('[data-visit-total]').textContent = total.toLocaleString('ko-KR') + '명';
    const paths = panel.querySelector('[data-visit-paths]');
    paths.textContent = rows.length ? '' : '오늘 집계된 유입이 없습니다.';
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'activity-row';
      line.textContent = (trafficChannels[row.source] || trafficChannels.other) + ' · ' + Number(row.visitors).toLocaleString('ko-KR') + '명';
      paths.append(line);
    }
  } catch {
    panel.querySelector('[data-visit-paths]').textContent = '방문 통계를 불러오지 못했습니다.';
  }
}
const memberAppRootUrl = new URL('./', document.querySelector('script[src*="app.js"]')?.src || window.location.href).href;
function stableMemberReturnUrl(path) {
  const url = new URL(path, memberAppRootUrl);
  const root = new URL(memberAppRootUrl);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return root;
  const relativePath = url.pathname.slice(root.pathname.length);
  const topicId = relativePath.match(/^topics\/[^/]*?([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/?$/i)?.[1];
  if (topicId) root.searchParams.set('issue', 'topic-' + topicId.toLowerCase());
  return topicId ? root : url;
}
const getMemberNickname = () => String(memberSession?.user?.user_metadata?.nickname || '').trim();
const isMemberSignedIn = () => Boolean(memberSession?.user && getMemberNickname());
function refreshMemberControls() {
  document.querySelector('#headerLogoutButton').classList.toggle('hidden', !memberSession?.user);
  if (loginButton) loginButton.textContent = isMemberSignedIn() ? '내 정보' : memberSession?.user ? '닉네임 설정' : '로그인';
}
function openNicknameSetup() {
  document.querySelector('#memberNickname').value = getMemberNickname();
  document.querySelector('#nicknameMessage').textContent = '';
  nicknameDialog.querySelector('h2').textContent = getMemberNickname() ? '닉네임 변경' : '시선에서 사용할 닉네임을 정해주세요.';
  nicknameDialog.querySelector('[type=submit]').textContent = '닉네임 저장';
  if (nicknameDialog && !nicknameDialog.open) nicknameDialog.showModal();
}
function syncMemberAuth(session) {
  memberSession = session;
  if(!session?.user){memberVoteChoices.clear();memberVoteResults.clear();issuePostsCache.clear();issueCommentsCache.clear();memberInterestedSuggestions.clear();}
  if(!session?.user&&activityTrackingInterval){clearInterval(activityTrackingInterval);activityTrackingInterval=null;}
  refreshMemberControls();
  if (['member','profile'].includes(window.history.state?.siseonRoute)) renderMemberPage();
  renderCommunityAccess();
  if (activeIssueId) renderVoteState();
  if (session?.user) {
    if (!visitRecordedFor.has(session.user.id)) {
      visitRecordedFor.add(session.user.id);
      memberAuth?.rpc('record_member_visit', { p_active_seconds: 0 }).then(({ error }) => { if (error) console.warn('방문 기록 저장 실패:', error.message); });
    }
    if(!activityTrackingInterval) activityTrackingInterval=setInterval(()=>{if(document.visibilityState==='visible'&&isMemberSignedIn())memberAuth?.rpc('record_member_active_seconds',{p_seconds:60}).then(({error})=>{if(error)console.warn('이용 시간 저장 실패:',error.message);});},60000);
    if (loginDialog?.open) loginDialog.close();
    if (!getMemberNickname()) {
      openNicknameSetup();
      return;
    }
    // Close the editor only after both profile saves finish.
    const returnPath = sessionStorage.getItem('siseon:auth-return-path');
    if (returnPath) {
      sessionStorage.removeItem('siseon:auth-return-path');
      const returnUrl = stableMemberReturnUrl(returnPath);
      const appRootPath = new URL(memberAppRootUrl).pathname;
      if (returnUrl.origin === window.location.origin && returnUrl.pathname.startsWith(appRootPath)) {
        window.location.replace(returnUrl.href);
        return;
      }
    }
    refreshCommunityFromSupabase().catch((error)=>console.warn('커뮤니티 데이터 동기화 실패:',error.message));
    if(activeIssueId) loadMemberIssueData(activeIssueId).then(resumePendingAuthVote).catch((error)=>console.warn('투표/토론 데이터를 동기화하지 못했습니다:',error.message));
  } else if (nicknameDialog?.open) {
    nicknameDialog.close();
  }
}

function resumePendingAuthVote() {
  const requestedVote = sessionStorage.getItem('siseon:pending-auth-vote') || pendingVote;
  if (!requestedVote || !isMemberSignedIn() || !activeIssueId) return;
  sessionStorage.removeItem('siseon:pending-auth-vote');
  pendingVote = null;
  if (!memberVoteChoices.has(activeIssueId)) castMemberVote(requestedVote);
}
if (memberAuth) {
  memberAuth.auth.getSession().then(({ data, error }) => {
    if (error) console.error('회원 인증 상태 확인 실패:', error.message);
    syncMemberAuth(data?.session ?? null);
  });
  memberAuth.auth.onAuthStateChange((_event, session) => syncMemberAuth(session));
} else {
  console.error('회원 로그인을 시작할 수 없습니다. Supabase 설정 또는 supabase-js 로드를 확인해 주세요.');
}
const callbackQuery = new URLSearchParams(window.location.search);
const callbackFragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const authCallbackError = callbackQuery.get('error_description') || callbackFragment.get('error_description');
if (authCallbackError) {
  document.querySelector('#authDialogMessage').textContent = `카카오 인증에 실패했습니다: ${authCallbackError}`;
  sessionStorage.removeItem('siseon:auth-return-path');
  sessionStorage.removeItem('siseon:pending-auth-vote');
  loginDialog.showModal();
}
let activeIssueId = null;
let activeIssueIsArchived = false;
let activeIssueIsReadOnly = false;
let pendingVote = null;
let pendingReportContext = null;

function escapeSiteText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function splitReadablePoints(value) {
  const normalized = String(value ?? '').replace(/\r/g, '').trim();
  if (!normalized) return [];
  const marked = normalized.replace(/(^|\s)([①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2}[.)、])\s*/gu, '\n$2 ');
  const lines = marked.split(/\n+/).map((line) => line.trim().replace(/^(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2}[.)、]|[-•])\s*/u, '').trim()).filter(Boolean);
  return lines.length ? lines : [normalized];
}

function renderReadablePoints(value, className = 'readable-points') {
  const points = splitReadablePoints(value);
  if (!points.length) return '';
  return `<ul class="${className}">${points.map((point) => `<li>${escapeSiteText(point)}</li>`).join('')}</ul>`;
}

function renderReadableParagraphs(value, className) {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  if (!text) return `<div class="${className}"></div>`;
  const chunks = text.includes('\n')
    ? text.split(/\n+/).map((part) => part.trim()).filter(Boolean)
    : text.split(/(?<=[.!?])\s+(?=[가-힣A-Z0-9“"'‘(])/u).map((part) => part.trim()).filter(Boolean);
  return `<div class="${className}">${chunks.map((part) => `<p>${escapeSiteText(part)}</p>`).join('')}</div>`;
}

function routeUrl(route, params = {}) {
  const url = stableMemberReturnUrl(window.location.href);
  url.searchParams.delete('issue');
  url.searchParams.delete('view');
  url.searchParams.delete('notice');
  url.searchParams.delete('share');
  if (route === 'public-share') { url.searchParams.set('share', params.uuid); return url.pathname + url.search; }
  url.hash = '';
  if (route === 'issue' && params.issueId) url.searchParams.set('issue', params.issueId);
  else if (route !== 'home') url.searchParams.set('view', route);
  if (params.noticeId) url.searchParams.set('notice', params.noticeId);
  return `${url.pathname}${url.search}${params.hash || ''}`;
}

function pushAppRoute(route, params = {}, replace = false) {
  if (route !== 'public-share') {
    document.querySelector('#publicSharedPoll')?.classList.add('hidden');
    document.querySelector('#publicSharedPoll')?.style.removeProperty('display');
    homeView.style.removeProperty('display');
  }
  const state = { siseonRoute: route, ...params };
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](state, '', routeUrl(route, params));
}

function restoreHomeView(hash = '') {
  homeView.style.removeProperty('display');
  homeView.classList.remove('hidden');
  pollBoardView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  setTopNavActive(hash === '#archive' ? 'archive' : 'polls');
  if (hash) requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

function goBackWithinApp(fallback = 'home') {
  const route = window.history.state?.siseonRoute;
  if (route && route !== 'home') { window.history.back(); return; }
  if (fallback === 'home') restoreHomeView();
}

function restoreRouteFromHistory(state = {}) {
  const route = state.siseonRoute || 'home';
  if (state.siseonRoot && !state.siseonExitGuard) {
    restoreHomeView();
    window.history.pushState({ siseonRoute: 'home', siseonExitGuard: true }, '', window.location.href);
    const dialog = document.querySelector('#exitConfirmDialog');
    if (dialog && !dialog.open) dialog.showModal();
    return;
  }
  if (route === 'public-share' && state.uuid) return showPublicSharedPoll(state.uuid);
  if (route === 'issue') { const id = state.issueId || new URLSearchParams(window.location.search).get('issue'); if (id && getIssueData(id)) return openIssue(id, 'none'); }
  if (route === 'member' || route === 'profile') return showMemberPage(route, false);
  if (['about','principles','privacy'].includes(route)) return openSiteInfo(route, false);
  if (route === 'poll-board') return showPollBoard(false);
  if (route === 'archive') return showArchiveBoard(false);
  if (route === 'open-talk' || route === 'suggestions') return showCommunitySubpage(route, false);
  if (route === 'admin') { showAdminView(false); if (isVerifiedAdmin && state.adminPage && state.adminPage !== 'overview') renderAdminPage(state.adminPage); return; }
  if (route === 'announcements') {
    openAnnouncements(null, false);
    if (state.noticeId) openAnnouncementDetail(state.noticeId, false);
    return;
  }
  restoreHomeView(state.hash || '');
  syncSeoMetadata(null, 'none');
}

function setTopNavActive(key) {
  if (history.state?.siseonRoute !== 'public-share') document.querySelector('#publicSharedPoll')?.classList.add('hidden');
  document.querySelector('#siteInfoView').classList.add('hidden');
  document.querySelector('#memberView')?.classList.add('hidden');
  document.querySelectorAll('.desktop-nav [data-nav-key], .site-map-panel [data-nav-key]').forEach((link) => {
    const active = link.dataset.navKey === key;
    link.classList.toggle('nav-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
setTopNavActive('polls');

function showCommunitySubpage(page, pushHistory = true) {
  homeView.classList.add('hidden'); pollBoardView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden'); adminView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden');
  closeSiteMap();
  if (pushHistory) pushAppRoute(page);
  if (page === 'open-talk') { setTopNavActive('open-talk'); openTalkView.classList.remove('hidden'); document.querySelector('#openTalkDetail').classList.add('hidden'); document.querySelector('#openTalkBoardContent').classList.remove('hidden'); renderOpenTalkList(); }
  if (page === 'suggestions') { setTopNavActive('suggestions'); topicSuggestionsView.classList.remove('hidden'); document.querySelector('#topicSuggestionDetail').classList.add('hidden'); document.querySelector('#topicSuggestionBoardContent').classList.remove('hidden'); renderTopicSuggestions(); }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function closeSiteMap() {
  const panel = document.querySelector('#siteMapPanel');
  const button = document.querySelector('#menuButton');
  panel?.classList.add('hidden');
  button?.setAttribute('aria-expanded', 'false');
  button?.setAttribute('aria-label', '사이트맵 열기');
}

function goHome() {
  pushAppRoute('home');
  restoreHomeView();
  activeIssueId = null;
  activeIssueIsArchived = false; activeIssueIsReadOnly = false;
  syncSeoMetadata(null, 'replace');
  setTopNavActive('polls');
  closeSiteMap();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('.brand').forEach((brand) => brand.addEventListener('click', (event) => { event.preventDefault(); goHome(); }));
document.querySelector('#issueHomeButton').addEventListener('click', goHome);

const issues = {};
const archivedSampleIssues = {};

const editorialStorageKey = `${storagePrefix}editorial-ai-review-v2`;
const demoCleanupVersionKey = `${storagePrefix}demo-cleanup-version`;
if (localStorage.getItem(demoCleanupVersionKey) !== '2026-11-24-cleanup-1') {
  // 게시판/운영 메뉴의 시연 글과 댓글은 브라우저 로컬 저장값이므로
  // 배포 후 각 브라우저에서 한 번만 비우고 이후 작성한 내용은 유지합니다.
  const keysToClear = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key && (key.startsWith(`${storagePrefix}posts:`) || key.startsWith(`${storagePrefix}comments:`)));
  keysToClear.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(editorialStorageKey);
  try {
    const stored = JSON.parse(localStorage.getItem(`${storagePrefix}admin-operations-demo`) || 'null');
    if (stored) {
      ['reports', 'inquiries', 'partnerships', 'topicSuggestions', 'openTalkPosts', 'hiddenDiscussionPosts'].forEach((key) => {
        stored[key] = [];
      });
      localStorage.setItem(`${storagePrefix}admin-operations-demo`, JSON.stringify(stored));
    }
  } catch { /* 손상된 시연 저장값은 기본 빈 목록으로 다시 시작합니다. */ }
  localStorage.setItem(demoCleanupVersionKey, '2026-11-24-cleanup-1');
}


function loadEditorialState() {
  try {
    const stored = JSON.parse(localStorage.getItem(editorialStorageKey) || 'null');
    if (stored) return { pending: [], history: [], approved: [], archived: [], ...stored };
  } catch (error) {
    console.warn('편성 시연 기록을 불러오지 못했습니다.', error);
  }
  return { pending: [], history: [], approved: [], archived: [], activeIssueIds: null };
}

const editorialState = loadEditorialState();
const handledDraftTitles = new Set([...editorialState.history.map((entry) => entry.title), ...editorialState.approved.map((entry) => entry.issue?.title)]);
const handledDraftIds = new Set(editorialState.history.map((entry) => entry.draftId).filter(Boolean));
const pendingDraftIds = new Set(editorialState.pending.map((entry) => entry.id));
// 후보는 자동 배포 파일이나 브라우저 샘플에서 읽지 않고 Supabase 검토 대기열에서만 불러옵니다.
editorialState.approved.forEach((entry) => {
  if (entry?.id && entry.issue) issues[entry.id] = entry.issue;
});
let activeIssueIds = Array.isArray(editorialState.activeIssueIds)
  ? editorialState.activeIssueIds.filter((id) => issues[id])
  : [];

let currentAdminPage = 'overview';
let activeDraftId = editorialState.pending[0]?.id || null;
let activeReviewCategory = '전체 분야';
let scheduledTopicQueue = [];
let adminDiscussionPosts = [];
let memberTotalCount = 0;
const seedAdminOperations = {
  members: [
    { id: 'm-1042', nickname: '생각나눔', joined: '2026.11.20', status: '정상', reports: 0 },
    { id: 'm-1039', nickname: '푸른산책', joined: '2026.11.19', status: '정상', reports: 0 },
    { id: 'm-1028', nickname: '한쪽만봐', joined: '2026.11.16', status: '검토 중', reports: 3 },
    { id: 'm-1014', nickname: '동네기록자', joined: '2026.11.13', status: '주의', reports: 1 },
    { id: 'm-0997', nickname: '편한말', joined: '2026.11.08', status: '7일 정지', reports: 5 },
    { id: 'm-0982', nickname: '차분한토론', joined: '2026.11.04', status: '정상', reports: 0 },
    { id: 'm-0961', nickname: '오늘의질문', joined: '2026.10.29', status: '정상', reports: 1 }
  ],
  reports: [],
  inquiries: [],
  partnerships: [],
  audit: [],
  hiddenDiscussionPosts: [],
  topicSuggestions: [],
  openTalkPosts: [],
  announcements: [
    { id: 'notice-respect', category: '운영 원칙', title: '시선은 사람보다 주장에 집중합니다', summary: '근거를 나누고 서로 다른 관점을 존중하는 대화를 지향합니다.', body: '시선은 찬반 의견을 같은 기준으로 소개하고, 참여자가 근거를 살펴볼 수 있도록 운영합니다.\n\n비판은 주장·자료·정책을 대상으로 해 주세요. 의견이 다르다는 이유만으로 상대를 공격하거나 조롱하지 말고, 사실과 해석을 구분해 주세요. 운영진은 양측 의견의 분량과 순서를 균형 있게 관리하고, 오류가 확인되면 정정 내역을 안내합니다.', createdAt: '2026-11-21T09:00:00.000Z', published: true, pinned: true },
    { id: 'notice-pseudonym', category: '이용 안내', title: '익명 닉네임을 사용해도 서로를 비방할 수는 없습니다', summary: '실명 대신 닉네임으로 참여할 수 있으며, 타인을 향한 모욕과 괴롭힘은 금지됩니다.', body: '시선에서는 실명 공개 없이 닉네임으로 투표와 토론에 참여할 수 있습니다. 다만 익명성은 다른 회원을 모욕하거나 괴롭힐 권리를 뜻하지 않습니다.\n\n특정 회원을 겨냥한 욕설·조롱·협박, 집단에 대한 혐오·차별 표현, 주소·연락처 등 개인정보 공개, 반복적인 도배와 광고는 허용되지 않습니다. 위반 게시물은 맥락과 피해 정도를 확인해 숨김 또는 삭제할 수 있습니다.', createdAt: '2026-11-20T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-sanctions', category: '신고와 제재', title: '신고 접수와 단계별 조치 기준을 안내합니다', summary: '신고 내용을 검토한 뒤 위반 정도와 반복 여부에 따라 조치합니다.', body: '문제가 있는 게시글의 신고하기를 눌러 사유와 필요한 설명을 보내 주세요. 신고자 정보는 신고 대상 회원에게 공개하지 않습니다. 신고만으로 자동 제재하지 않고, 게시글과 앞뒤 대화의 맥락을 운영자가 확인합니다.\n\n조치는 위반 아님 처리, 안내 또는 경고, 게시글 숨김·삭제, 반복적이거나 중대한 위반에 대한 일시 이용 정지 순으로 검토합니다. 협박, 개인정보 노출, 혐오·차별 등 피해가 큰 사안은 즉시 임시 제한할 수 있습니다. 조치 사유는 기록하며, 회원 문의를 통해 재검토를 요청할 수 있습니다.', createdAt: '2026-11-19T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-voting', category: '투표 안내', title: '투표 결과는 투표한 뒤 확인할 수 있습니다', summary: '이슈마다 한 번 투표하고, 이후 결과와 토론을 확인할 수 있습니다.', body: '인증된 계정은 각 이슈에 한 번 투표할 수 있습니다. 투표 전에는 해당 이슈의 집계 결과를 볼 수 없고, 투표한 뒤 결과와 토론 글을 확인할 수 있습니다.\n\n각 투표는 매일 오전 7시에 공개되고 30일차 마지막 날 자정 직전에 마감되어 지난 투표 보관함으로 이동합니다. 보관 후 90일 동안은 댓글을 작성할 수 있고, 그 이후에는 읽기 전용으로 전환됩니다. 화면에 표시되는 투표 결과는 시선 참여자의 의견이며, 전체 국민의 여론이나 과학적 여론조사를 뜻하지 않습니다.', createdAt: '2026-11-18T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-reporting', category: '안전과 개인정보', title: '안전한 토론을 위해 신고와 개인정보를 보호합니다', summary: '신고 내용은 운영 검토에만 사용하고 개인정보 노출 게시물은 신속히 처리합니다.', body: '다른 회원의 전화번호, 주소, 계정 정보 등 개인을 식별하거나 찾아낼 수 있는 정보를 허락 없이 게시하지 마세요. 개인정보가 노출된 게시물은 피해 확산을 막기 위해 우선 숨긴 뒤 검토할 수 있습니다.\n\n신고 내용과 신고자 정보는 운영 업무에 필요한 범위에서만 확인합니다. 계정 정보 처리와 보관에 관한 상세한 내용은 개인정보 처리방침에서 안내합니다. 긴급한 위협이나 안전 문제가 있으면 신고와 함께 회원 문의로 알려 주세요.', createdAt: '2026-11-17T09:00:00.000Z', published: true, pinned: false }
  ]
};

function loadAdminOperations() {
  const empty = JSON.parse(JSON.stringify(seedAdminOperations));
  Object.keys(empty).forEach((key) => { if (Array.isArray(empty[key])) empty[key] = []; });
  return empty;
}
const adminOperations = loadAdminOperations();
let editingAnnouncementId = null;
const homeTalkExamples = [];
const homeSuggestionExamples = [];

function boardOpenTalkPosts() {
  const actual = adminOperations.openTalkPosts.filter((post) => post.status === '공개').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return [...actual, ...homeTalkExamples.slice(0, Math.max(0, 5 - actual.length))];
}

function homeTalkPosts() { return boardOpenTalkPosts().slice(0, 5); }

function boardTopicSuggestions() {
  const actual = [...adminOperations.topicSuggestions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return [...actual, ...homeSuggestionExamples.slice(0, Math.max(0, 5 - actual.length))];
}

function getDemoAnonymousAlias() {
  return '익명';
}

async function refreshCommunityFromSupabase() {
  if (!memberAuth) return;
  const authenticated = isMemberSignedIn();
  const talkFields = authenticated ? 'id,author_id,author_nickname,category,title,body,status,created_at' : 'id,category,title,status,created_at';
  const [{ data: talkRows, error: talkError }, { data: suggestionRows, error: suggestionError }] = await Promise.all([
    memberAuth.from('open_talk_posts').select(talkFields).eq('status','published').order('created_at',{ascending:false}).limit(100),
    memberAuth.from('topic_suggestions').select(authenticated ? 'id,author_id,category,title,rationale,for_text,against_text,source_url,status,created_at' : 'id,category,title,status,created_at').in('status',['pending','approved']).order('created_at',{ascending:false}).limit(100)
  ]);
  if (talkError) console.warn('자유토론 목록 동기화 실패:',talkError.message);
  else adminOperations.openTalkPosts=(talkRows||[]).map(row=>({id:row.id,category:row.category,title:row.title,body:row.body||'',author:row.author_nickname||'익명',memberRef:row.author_id||'',status:'공개',createdAt:row.created_at,comments:[]}));
  if (suggestionError) console.warn('주제 제안 목록 동기화 실패:',suggestionError.message);
  else adminOperations.topicSuggestions=(suggestionRows||[]).map(row=>({id:row.id,category:row.category,title:row.title,rationale:row.rationale||'',forText:row.for_text||'',againstText:row.against_text||'',sourceUrl:row.source_url||'',sender:'익명 제안자',memberRef:row.author_id||'',interestCount:0,status:row.status==='pending'?'검토 대기':row.status,createdAt:row.created_at}));
  if (authenticated) {
    const {data:ownInterests}=await memberAuth.from('topic_suggestion_interests').select('suggestion_id').eq('user_id',memberSession.user.id);
    memberInterestedSuggestions.clear(); (ownInterests||[]).forEach(x=>memberInterestedSuggestions.add(x.suggestion_id));
  }
  const {data:counts}=await memberAuth.rpc('get_topic_suggestion_counts');
  const countMap=new Map((counts||[]).map(x=>[x.suggestion_id,Number(x.interest_count)]));
  for(const item of adminOperations.topicSuggestions)item.interestCount=countMap.get(item.id)||0;
  renderHomeCommunityBoard(); renderOpenTalkList(); renderTopicSuggestions();
}

function renderOpenTalkList() {
  const list = document.querySelector('#openTalkList');
  const unavailable = new Set(adminOperations.reports.filter((item) => item.issueId === 'open-talk' && item.postStatus !== '공개').map((item) => item.postId));
  const posts = boardOpenTalkPosts().filter((post) => !unavailable.has(post.id));
  document.querySelector('#openTalkCount').textContent = `${posts.length}개 글`;
  list.innerHTML = posts.map((post) => `<article class="open-talk-card open-talk-list-row"><div class="open-talk-meta"><span>${escapeAdminHtml(post.category)}</span>${post.sample ? '<em class="suggestion-status">예시</em>' : ''}<time>${new Date(post.createdAt).toLocaleDateString('ko-KR')}</time></div><button type="button" class="open-talk-title-button" data-open-talk-open="${escapeAdminHtml(post.id)}">${escapeAdminHtml(post.title)} <span>상세 보기 →</span></button><div class="open-talk-row-foot">${post.sample ? '예시 글' : escapeAdminHtml(post.author)} · 댓글 ${(post.comments || []).length}개</div></article>`).join('') || '<div class="community-empty">아직 공개된 글이 없습니다. 첫 대화를 시작해 보세요.</div>';
}

async function openOpenTalkDetail(id) {
  if (!isMemberSignedIn()) { openLogin(() => openOpenTalkDetail(id)); return; }
  let post = boardOpenTalkPosts().find((item) => item.id === id);
  const {data:fullPost,error:postError}=await memberAuth.from('open_talk_posts').select('id,author_id,author_nickname,category,title,body,status,created_at').eq('id',id).maybeSingle();
  if(postError||!fullPost){showUserActionToast('게시글을 불러오지 못했습니다.');return;}
  const {data:comments}=await memberAuth.from('open_talk_comments').select('id,author_nickname,body,created_at').eq('post_id',id).eq('status','published').order('created_at');
  post={...post,category:fullPost.category,title:fullPost.title,body:fullPost.body,author:fullPost.author_nickname,memberRef:fullPost.author_id,createdAt:fullPost.created_at,comments:(comments||[]).map(x=>({author:x.author_nickname,text:x.body,id:x.id}))};
  adminOperations.openTalkPosts=adminOperations.openTalkPosts.map(x=>x.id===id?post:x);
  if (!post) return;
  document.querySelector('#openTalkBoardContent').classList.add('hidden');
  const detail = document.querySelector('#openTalkDetail');
  detail.classList.remove('hidden');
  detail.dataset.openTalkId = post.id;
  detail.innerHTML = `<button type="button" class="announcement-detail-back" data-open-talk-detail-back>← 자유토론 목록</button><div class="open-talk-detail-card"><div class="open-talk-meta"><span>${escapeAdminHtml(post.category)}</span><b>${post.sample ? '예시 글' : escapeAdminHtml(post.author)}</b><time>${new Date(post.createdAt).toLocaleDateString('ko-KR')}</time></div><h1>${escapeAdminHtml(post.title)}</h1>${post.sample ? '<p class="suggestion-example-note">화면 구성을 위한 예시 글입니다.</p>' : ''}<p class="open-talk-detail-body">${escapeAdminHtml(post.body)}</p><div class="open-talk-reaction-mount"></div><div class="open-talk-detail-comments"><h2>댓글 ${(post.comments || []).length}개</h2>${(post.comments || []).map((comment) => `<p><b>${escapeAdminHtml(comment.author)}</b>${escapeAdminHtml(comment.text)}</p>`).join('') || '<p class="home-no-comments">아직 댓글이 없습니다.</p>'}</div>${post.sample ? '' : `<form class="open-talk-comment-form"><input name="comment" maxlength="500" required placeholder="익명으로 댓글 남기기"/><button type="submit">등록</button></form><button type="button" class="open-talk-report" data-open-talk-report>신고하기</button>`}</div>`;
  detail.querySelector('.open-talk-reaction-mount').append(createReactionBar('talk', post.id));
  refreshPostReactions(detail, 'talk');
}

function renderTopicSuggestions() {
  const list = document.querySelector('#topicSuggestionList');
  const interested = memberInterestedSuggestions;
  const suggestions = boardTopicSuggestions();
  document.querySelector('#topicSuggestionCount').textContent = `${suggestions.length}개 제안`;
  list.innerHTML = suggestions.map((item) => `<article class="topic-suggestion-row"><div class="open-talk-meta"><span>${escapeAdminHtml(item.category)}</span>${item.sample ? '<em class="suggestion-status">예시</em>' : ''}<time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time></div><button type="button" class="topic-suggestion-title" data-topic-suggestion-open="${escapeAdminHtml(item.id)}">${escapeAdminHtml(item.title)} <span>상세 보기 →</span></button><div class="suggestion-footer"><small>${item.sample ? '예시 제안' : '이용자 제안'}</small><button type="button" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>토론해 보고 싶어요 · ${item.interestCount}</button></div></article>`).join('') || '<div class="community-empty">아직 등록된 제안이 없습니다.</div>';
}

async function openTopicSuggestionDetail(id) {
  if (!isMemberSignedIn()) { openLogin(() => openTopicSuggestionDetail(id)); return; }
  let item = boardTopicSuggestions().find((suggestion) => suggestion.id === id);
  const {data:row,error}=await memberAuth.from('topic_suggestions').select('id,author_id,category,title,rationale,for_text,against_text,source_url,status,created_at').eq('id',id).maybeSingle();
  if(error||!row){showUserActionToast('제안 내용을 불러오지 못했습니다.');return;}
  const {data:count}=await memberAuth.rpc('get_topic_suggestion_count',{p_suggestion_id:id});
  item={...item,id:row.id,category:row.category,title:row.title,rationale:row.rationale,forText:row.for_text,againstText:row.against_text,sourceUrl:row.source_url,sender:'익명 제안자',memberRef:row.author_id,status:row.status==='pending'?'검토 대기':row.status,createdAt:row.created_at,interestCount:Number(count)||0};
  adminOperations.topicSuggestions=adminOperations.topicSuggestions.map(x=>x.id===id?item:x);
  if (!item) return;
  const interested = memberInterestedSuggestions;
  document.querySelector('#topicSuggestionBoardContent').classList.add('hidden');
  const detail = document.querySelector('#topicSuggestionDetail');
  detail.classList.remove('hidden');
  detail.innerHTML = `<button type="button" class="announcement-detail-back" data-suggestion-detail-back>← 제안 목록</button><div class="topic-suggestion-detail-card"><div class="open-talk-meta"><span>${escapeAdminHtml(item.category)}</span><b>${item.sample ? '예시 제안' : escapeAdminHtml(item.sender || '익명 제안자')}</b><time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time></div><h1>${escapeAdminHtml(item.title)}</h1>${item.sample ? '<p class="suggestion-example-note">화면 구성을 위한 예시 제안입니다.</p>' : ''}<p class="suggestion-detail-rationale">${escapeAdminHtml(item.rationale)}</p><div class="suggestion-balance"><p><b>가능한 찬성 관점</b>${escapeAdminHtml(item.forText)}</p><p><b>가능한 반대 관점</b>${escapeAdminHtml(item.againstText)}</p></div>${safeHttpsUrl(item.sourceUrl) ? `<a class="candidate-source" href="${escapeAdminHtml(safeHttpsUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">참고 출처 열기 ↗</a>` : ''}<div class="suggestion-footer"><small>현재 관심 ${item.interestCount}명 · 관심 수는 편집팀 검토의 참고 자료입니다.</small><button type="button" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>${interested.has(item.id) ? '관심 표시됨' : '토론해 보고 싶어요'} · ${item.interestCount}</button></div></div>`;
}

async function toggleTopicSuggestionInterest(id) {
  if (!isMemberSignedIn()) { openLogin(() => toggleTopicSuggestionInterest(id)); return; }
  const item = adminOperations.topicSuggestions.find((suggestion) => suggestion.id === id);
  if (!item || item.status !== '검토 대기') return;
  const {data:existing}=await memberAuth.from('topic_suggestion_interests').select('suggestion_id').eq('suggestion_id',id).eq('user_id',memberSession.user.id).maybeSingle();
  if(existing){const {error}=await memberAuth.from('topic_suggestion_interests').delete().eq('suggestion_id',id).eq('user_id',memberSession.user.id);if(error){showUserActionToast(`관심 표시를 취소하지 못했습니다: ${error.message}`);return;}memberInterestedSuggestions.delete(id);item.interestCount=Math.max(0,item.interestCount-1);}
  else {const {error}=await memberAuth.from('topic_suggestion_interests').insert({suggestion_id:id,user_id:memberSession.user.id});if(error){showUserActionToast(`관심 표시를 저장하지 못했습니다: ${error.message}`);return;}memberInterestedSuggestions.add(id);item.interestCount+=1;}
  renderHomeCommunityBoard();
  renderTopicSuggestions();
  if (!document.querySelector('#topicSuggestionDetail').classList.contains('hidden')) openTopicSuggestionDetail(id);
}

function renderCommunityAccess() {
  const signedIn = isMemberSignedIn();
  [
    ['#openTalkForm', '#openTalkLoginButton'],
    ['#topicSuggestionForm', '#topicSuggestionLoginButton']
  ].forEach(([formSelector, buttonSelector]) => {
    const form = document.querySelector(formSelector);
    const button = document.querySelector(buttonSelector);
    if (form) form.classList.toggle('hidden', !signedIn);
    if (button) button.classList.toggle('hidden', signedIn);
  });
}

const activeHomeBoardCategories = { 'open-talk': '전체', suggestions: '전체' };

function renderHomeCommunityBoard() {
  const talkCategoryBar = document.querySelector('#homeOpenTalkCategories');
  const suggestionCategoryBar = document.querySelector('#homeSuggestionCategories');
  const openTalkBoard = document.querySelector('#homeOpenTalkBoard');
  const suggestionsBoard = document.querySelector('#homeSuggestionsBoard');
  if (!talkCategoryBar || !suggestionCategoryBar || !openTalkBoard || !suggestionsBoard) return;
  const allTalkPosts = homeTalkPosts();
  const allSuggestions = boardTopicSuggestions().slice(0, 5);
  document.querySelector('#homeOpenTalkCount').textContent = String(allTalkPosts.length);
  document.querySelector('#homeSuggestionCount').textContent = String(allSuggestions.length);
  const talkCategories = ['전체', ...new Set(allTalkPosts.map((post) => post.category).filter(Boolean))];
  const suggestionCategories = ['전체', ...new Set(allSuggestions.map((item) => item.category).filter(Boolean))];
  if (!talkCategories.includes(activeHomeBoardCategories['open-talk'])) activeHomeBoardCategories['open-talk'] = '전체';
  if (!suggestionCategories.includes(activeHomeBoardCategories.suggestions)) activeHomeBoardCategories.suggestions = '전체';
  const makeCategoryButtons = (board, categories, selected) => categories.map((category) => `<button type="button" data-home-board-category="${board}" data-home-category="${escapeAdminHtml(category)}" class="${selected === category ? 'active' : ''}" aria-pressed="${selected === category}">${escapeAdminHtml(category)}</button>`).join('');
  talkCategoryBar.innerHTML = makeCategoryButtons('open-talk', talkCategories, activeHomeBoardCategories['open-talk']);
  suggestionCategoryBar.innerHTML = makeCategoryButtons('suggestions', suggestionCategories, activeHomeBoardCategories.suggestions);
  const filteredTalk = allTalkPosts.filter((post) => activeHomeBoardCategories['open-talk'] === '전체' || post.category === activeHomeBoardCategories['open-talk']).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filteredSuggestions = allSuggestions.filter((item) => activeHomeBoardCategories.suggestions === '전체' || item.category === activeHomeBoardCategories.suggestions).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const unavailable = new Set(adminOperations.reports.filter((item) => item.issueId === 'open-talk' && item.postStatus !== '공개').map((item) => item.postId));
  openTalkBoard.innerHTML = filteredTalk.filter((post) => !unavailable.has(post.id)).map((post) => `<article class="home-suggestion-row home-talk-row"><div class="home-suggestion-row-meta"><span>${escapeAdminHtml(post.category)}</span>${post.sample ? '<em>예시</em>' : ''}</div><button type="button" class="home-suggestion-title" data-open-talk-open="${escapeAdminHtml(post.id)}">${escapeAdminHtml(post.title)}</button><span class="home-talk-comment-count">${post.sample ? '예시 글' : '댓글'} · ${(post.comments || []).length}</span></article>`).join('') || '<div class="community-empty">이 분야에 아직 글이 없습니다.</div>';
  const interested = memberInterestedSuggestions;
  suggestionsBoard.innerHTML = filteredSuggestions.map((item) => `<article class="home-suggestion-row"><div class="home-suggestion-row-meta"><span>${escapeAdminHtml(item.category)}</span>${item.sample ? '<em>예시</em>' : ''}</div><button type="button" class="home-suggestion-title" data-topic-suggestion-open="${escapeAdminHtml(item.id)}">${escapeAdminHtml(item.title)}</button><button type="button" class="home-suggestion-interest" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>토론해 보고 싶어요 · ${item.interestCount}</button></article>`).join('') || '<div class="community-empty">이 분야에 아직 제안이 없습니다.</div>';
}

function showHomeCommunityBoard(board) {
  homeView.classList.remove('hidden');
  pollBoardView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  closeSiteMap();
  pushAppRoute('home', { hash: '#communityBoards' });
  setTopNavActive(board === 'open-talk' ? 'open-talk' : 'suggestions');
  renderHomeCommunityBoard();
  const target = document.querySelector(board === 'open-talk' ? '#homeOpenTalkHeading' : '#homeSuggestionsHeading');
  window.scrollTo({ top: target.offsetTop - 70, behavior: 'smooth' });
}
document.querySelector('#communityBoards').addEventListener('click', (event) => {
  const talkButton = event.target.closest('[data-open-talk-open]');
  if (talkButton) {
    showCommunitySubpage('open-talk');
    openOpenTalkDetail(talkButton.dataset.openTalkOpen);
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const detailButton = event.target.closest('[data-topic-suggestion-open]');
  if (detailButton) {
    showCommunitySubpage('suggestions');
    openTopicSuggestionDetail(detailButton.dataset.topicSuggestionOpen);
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const button = event.target.closest('[data-home-category]');
  if (button) {
    activeHomeBoardCategories[button.dataset.homeBoardCategory] = button.dataset.homeCategory;
    renderHomeCommunityBoard();
    return;
  }
  const toggle = event.target.closest('[data-home-comments-toggle]');
  if (!toggle) return;
  const comments = toggle.closest('.home-board-post').querySelector('.home-board-comments');
  const isHidden = comments.classList.toggle('hidden');
  toggle.innerHTML = isHidden ? '댓글 보기 <span>⌄</span>' : '댓글 접기 <span>⌃</span>';
});
document.querySelector('#communityBoards').addEventListener('submit', async (event) => {
  const form = event.target.closest('.open-talk-comment-form');
  if (!form) return;
  event.preventDefault();
  if (!isMemberSignedIn()) { openLogin(); return; }
  const post = adminOperations.openTalkPosts.find((item) => item.id === form.closest('[data-open-talk-id]')?.dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim();
  if (!post || !text) return;
  const {error}=await memberAuth.from('open_talk_comments').insert({post_id:post.id,author_id:memberSession.user.id,author_nickname:'익명',body:text});
  if(error){showUserActionToast(`댓글을 저장하지 못했습니다: ${error.message}`);return;}
  post.comments ||= []; post.comments.push({ author: '익명', text });
  renderHomeCommunityBoard();
  renderOpenTalkList();
});
document.querySelector('#communityBoards').addEventListener('click', (event) => {
  const interestButton = event.target.closest('[data-interest-id]');
  if (!interestButton) return;
  toggleTopicSuggestionInterest(interestButton.dataset.interestId);
});

document.querySelectorAll('[data-community-home]').forEach((button) => button.addEventListener('click', () => {
  goBackWithinApp();
}));
document.querySelector('#openTalkForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isMemberSignedIn()) { openLogin(); return; }
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
  const {data,error}=await memberAuth.from('open_talk_posts').insert({author_id:memberSession.user.id,author_nickname:'익명',category:values.category,title:values.title.trim(),body:values.body.trim()}).select('id,created_at').single();
  if(error){showUserActionToast(`글을 저장하지 못했습니다: ${error.message}`);return;}
  adminOperations.openTalkPosts.unshift({ id:data.id, category: values.category, title: values.title.trim(), body: values.body.trim(), author:'익명', memberRef:memberSession.user.id,status:'공개',createdAt:data.created_at,comments:[] });
  form.reset(); renderOpenTalkList(); renderHomeCommunityBoard(); showUserActionToast('익명 글이 게시됐습니다.');
});
document.querySelector('#openTalkLoginButton').addEventListener('click', () => openLogin(() => {
  renderCommunityAccess();
  document.querySelector('#openTalkTitle').focus();
}));
document.querySelector('#topicSuggestionLoginButton').addEventListener('click', () => openLogin(() => {
  renderCommunityAccess();
  document.querySelector('#suggestionTitle').focus();
}));

document.querySelector('#openTalkList').addEventListener('submit', async (event) => {
  const form = event.target.closest('.open-talk-comment-form'); if (!form) return;
  event.preventDefault();
  if (!isMemberSignedIn()) { openLogin(); return; }
  const card = form.closest('[data-open-talk-id]'); const post = adminOperations.openTalkPosts.find((item) => item.id === card.dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim(); if (!post || !text) return;
  const {error}=await memberAuth.from('open_talk_comments').insert({post_id:post.id,author_id:memberSession.user.id,author_nickname:'익명',body:text});
  if(error){showUserActionToast(`댓글을 저장하지 못했습니다: ${error.message}`);return;}
  post.comments ||= []; post.comments.push({ author: '익명', text }); renderOpenTalkList(); renderHomeCommunityBoard();
});
document.querySelector('#openTalkList').addEventListener('click', (event) => {
  const detailButton = event.target.closest('[data-open-talk-open]');
  if (detailButton) { openOpenTalkDetail(detailButton.dataset.openTalkOpen); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  if (event.target.closest('[data-open-talk-report]')) {
    if (!isMemberSignedIn()) { openLogin(); return; }
    const card = event.target.closest('[data-open-talk-id]'); const post = adminOperations.openTalkPosts.find((item) => item.id === card.dataset.openTalkId);
    pendingReportContext = { issueId: 'open-talk', postId: post.id, postTitle: post.title, author: post.author, memberRef: post.memberRef };
    document.querySelector('#reportTargetTitle').textContent = `“${post.title}” · ${post.author}`; document.querySelector('#userReportForm').reset(); document.querySelector('#userReportDialog').showModal();
  }
});
document.querySelector('#openTalkDetail').addEventListener('click', (event) => {
  if (event.target.closest('[data-open-talk-detail-back]')) {
    document.querySelector('#openTalkDetail').classList.add('hidden');
    document.querySelector('#openTalkBoardContent').classList.remove('hidden');
    return;
  }
  if (event.target.closest('[data-open-talk-report]')) {
    if (!isMemberSignedIn()) { openLogin(); return; }
    const post = adminOperations.openTalkPosts.find((item) => item.id === document.querySelector('#openTalkDetail').dataset.openTalkId);
    if (!post) return;
    pendingReportContext = { issueId: 'open-talk', postId: post.id, postTitle: post.title, author: post.author, memberRef: post.memberRef };
    document.querySelector('#reportTargetTitle').textContent = `“${post.title}” · ${post.author}`; document.querySelector('#userReportForm').reset(); document.querySelector('#userReportDialog').showModal();
  }
});
document.querySelector('#openTalkDetail').addEventListener('submit', async (event) => {
  const form = event.target.closest('.open-talk-comment-form');
  if (!form) return;
  event.preventDefault();
  if (!isMemberSignedIn()) { openLogin(); return; }
  const post = adminOperations.openTalkPosts.find((item) => item.id === document.querySelector('#openTalkDetail').dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim();
  if (!post || !text) return;
  const {error}=await memberAuth.from('open_talk_comments').insert({post_id:post.id,author_id:memberSession.user.id,author_nickname:'익명',body:text});
  if(error){showUserActionToast(`댓글을 저장하지 못했습니다: ${error.message}`);return;}
  post.comments ||= []; post.comments.push({ author: '익명', text });
  renderOpenTalkList(); renderHomeCommunityBoard(); openOpenTalkDetail(post.id);
});
document.querySelector('#topicSuggestionList').addEventListener('click', (event) => {
  const detailButton = event.target.closest('[data-topic-suggestion-open]');
  if (detailButton) { openTopicSuggestionDetail(detailButton.dataset.topicSuggestionOpen); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  const interestButton = event.target.closest('[data-interest-id]');
  if (interestButton) toggleTopicSuggestionInterest(interestButton.dataset.interestId);
});
document.querySelector('#topicSuggestionDetail').addEventListener('click', (event) => {
  if (event.target.closest('[data-suggestion-detail-back]')) {
    document.querySelector('#topicSuggestionDetail').classList.add('hidden');
    document.querySelector('#topicSuggestionBoardContent').classList.remove('hidden');
    return;
  }
  const interestButton = event.target.closest('[data-interest-id]');
  if (interestButton) toggleTopicSuggestionInterest(interestButton.dataset.interestId);
});

document.querySelector('#topicSuggestionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isMemberSignedIn()) { openLogin(); return; }
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
  if (/(선거|대선|총선|지방선거|공천)/.test(values.title)) { showUserActionToast('선거 관련 주제는 제안 대상에서 제외됩니다.'); return; }
  const payload={author_id:memberSession.user.id,category:values.category,title:values.title.trim(),rationale:values.rationale.trim(),for_text:values.forText.trim(),against_text:values.againstText.trim(),source_url:safeHttpsUrl(values.sourceUrl)};
  const {data,error}=await memberAuth.from('topic_suggestions').insert(payload).select('id,created_at').single();
  if(error){showUserActionToast(`제안을 저장하지 못했습니다: ${error.message}`);return;}
  adminOperations.topicSuggestions.unshift({ id:data.id,category:payload.category,title:payload.title,rationale:payload.rationale,forText:payload.for_text,againstText:payload.against_text,sourceUrl:payload.source_url,sender:'익명 제안자',memberRef:memberSession.user.id,interestCount:0,status:'검토 대기',createdAt:data.created_at });
  form.reset(); renderTopicSuggestions(); renderHomeCommunityBoard(); showUserActionToast('주제 제안을 접수했습니다.');
});

function sortedPublicAnnouncements() {
  return adminOperations.announcements.filter((item) => item.published).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt) - new Date(a.createdAt));
}

function renderAnnouncementTicker() {
  const item = sortedPublicAnnouncements()[0];
  const title = document.querySelector('#announcementTickerTitle');
  const ticker = document.querySelector('#announcementTicker');
  if (!ticker || !title) return;
  if (!item) {
    ticker.classList.remove('hidden');
    title.textContent = '공지사항 전체 보기';
    document.querySelector('#announcementTickerDate').textContent = '';
    delete ticker.dataset.announcementId;
    return;
  }
  ticker.classList.remove('hidden');
  title.textContent = item.title;
  document.querySelector('#announcementTickerDate').textContent = new Date(item.createdAt).toLocaleDateString('ko-KR');
  document.querySelector('#announcementTicker').dataset.announcementId = item.id;
}

function renderAnnouncementList() {
  const list = document.querySelector('#announcementList');
  const items = sortedPublicAnnouncements();
  list.innerHTML = items.map((item) => `<a class="announcement-row" href="#announcement" data-announcement-id="${escapeAdminHtml(item.id)}"><div class="announcement-row-meta"><span class="announcement-category">${escapeAdminHtml(item.category)}</span><time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time>${item.pinned ? '<b>고정</b>' : ''}</div><h2>${escapeAdminHtml(item.title)}</h2><p>${escapeAdminHtml(item.summary)}</p></a>`).join('') || '<div class="announcement-empty">게시된 공지사항이 없습니다.</div>';
}

function openAnnouncements(id = null, pushHistory = true) {
  setTopNavActive('announcements');
  homeView.classList.add('hidden'); pollBoardView.classList.add('hidden'); issueView.classList.add('hidden'); archiveView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  if (pushHistory) pushAppRoute('announcements');
  announcementsView.classList.remove('hidden');
  renderAnnouncementList();
  if (id) openAnnouncementDetail(id); else backAnnouncementList();
  if (!id && !sortedPublicAnnouncements().length) refreshAnnouncementsFromSupabase();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openAnnouncementDetail(id, pushHistory = true) {
  const item = sortedPublicAnnouncements().find((entry) => entry.id === id);
  if (!item) return backAnnouncementList();
  if (pushHistory) pushAppRoute('announcements', { noticeId: id });
  document.querySelector('#announcementListView').classList.add('hidden');
  const detail = document.querySelector('#announcementDetailView');
  detail.classList.remove('hidden');
  detail.innerHTML = `<button type="button" class="announcement-detail-back" id="announcementDetailBack">← 공지 목록</button><div class="announcement-row-meta"><span class="announcement-category">${escapeAdminHtml(item.category)}</span><time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time></div><h1>${escapeAdminHtml(item.title)}</h1><p class="announcement-lead">${escapeAdminHtml(item.summary)}</p><div class="announcement-body">${escapeAdminHtml(item.body)}</div>`;
}

function backAnnouncementList() {
  document.querySelector('#announcementDetailView').classList.add('hidden');
  document.querySelector('#announcementListView').classList.remove('hidden');
}

document.querySelectorAll('[data-open-announcements]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault(); closeSiteMap(); document.querySelector('.desktop-nav').classList.remove('mobile-open'); openAnnouncements(link.dataset.announcementId || null);
}));
function showPollBoard(pushHistory = true) {
  closeSiteMap();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  homeView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  pollBoardView.classList.remove('hidden');
  setTopNavActive('polls');
  renderPollBoard();
  if (pushHistory) pushAppRoute('poll-board');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderPollBoard() {
  const list = document.querySelector('#pollBoardList');
  if (!list) return;
  list.replaceChildren(...activeIssueIds.map((id, index) => {
    const issue = issues[id];
    const row = document.createElement('a');
    row.className = 'archive-row poll-board-row'; row.href = `?issue=${encodeURIComponent(id)}`; row.dataset.openIssue = id;
    const main = document.createElement('div'); main.className = 'archive-main';
    const title = document.createElement('strong'); title.textContent = issue.title;
    const meta = document.createElement('span'); meta.textContent = `${issue.category} · 진행 중인 투표 ${index + 1} / ${activeIssueIds.length} · ${formatPollDeadline(issue)} 마감`;
    const summary = document.createElement('small'); summary.textContent = issue.intro;
    main.append(title, meta, summary);
    const arrow = document.createElement('div'); arrow.className = 'archive-arrow'; arrow.textContent = '→';
    row.append(main, arrow); return row;
  }));
}
function showArchiveBoard(pushHistory = true) {
  closeSiteMap();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  homeView.classList.add('hidden'); pollBoardView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  archiveView.classList.remove('hidden');
  setTopNavActive('archive');
  renderEditorialArchives();
  if (pushHistory) pushAppRoute('archive');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.querySelectorAll('[data-open-archive]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); showArchiveBoard(); }));
document.querySelectorAll('[data-open-poll-board]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); showPollBoard(); }));
document.querySelector('#pollBoardBackHome').addEventListener('click', goHome);
document.querySelector('#pollBoardList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-open-issue]');
  if (row) { event.preventDefault(); openIssue(row.dataset.openIssue); }
});
document.querySelectorAll('.desktop-nav [data-nav-key]:not([data-open-announcements]):not([data-open-archive]):not([data-open-poll-board]), .site-map-panel [data-nav-key]:not([data-open-announcements]):not([data-open-archive]):not([data-open-poll-board])').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const key = link.dataset.navKey;
  if (key === 'open-talk' || key === 'suggestions') { showHomeCommunityBoard(key); return; }
  pushAppRoute('home', { hash: link.getAttribute('href') });
  setTopNavActive(key);
  closeSiteMap();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  announcementsView.classList.add('hidden'); archiveView.classList.add('hidden'); pollBoardView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); issueView.classList.add('hidden'); adminView.classList.add('hidden'); homeView.classList.remove('hidden');
  const target = document.querySelector(link.getAttribute('href'));
  if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}));
document.querySelectorAll('[data-community-page]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  showCommunitySubpage(link.dataset.communityPage);
}));
window.addEventListener('scroll', () => {
  if (homeView.classList.contains('hidden')) return;
  const sections = [['polls', '#polls'], ['archive', '#archive'], ['principles', '#principles'], ['community', '#guidelines']];
  let current = 'polls';
  sections.forEach(([key, selector]) => { const section = document.querySelector(selector); if (section && section.getBoundingClientRect().top <= 150) current = key; });
  setTopNavActive(current);
}, { passive: true });
document.querySelector('#announcementBackHome').addEventListener('click', goHome);
document.querySelector('#archiveBackHome').addEventListener('click', goHome);
document.querySelector('#announcementListTop').addEventListener('click', backAnnouncementList);
document.querySelector('#announcementList').addEventListener('click', (event) => {
  const link = event.target.closest('[data-announcement-id]'); if (link) { event.preventDefault(); openAnnouncementDetail(link.dataset.announcementId); }
});
document.querySelector('#announcementDetailView').addEventListener('click', (event) => { if (event.target.closest('#announcementDetailBack')) goBackWithinApp(); });

function saveAdminOperations() {
  // Operational records are now persisted by their typed Supabase table at the point of each action.
}

function logAdminAction(action, target, reason = '') {
  adminOperations.audit.unshift({ action, target, reason, at: new Date().toISOString(), operator: '운영 관리자' });
  if(isVerifiedAdmin&&memberSession?.user) memberAuth?.from('admin_audit_log').insert({actor_id:memberSession.user.id,action,target,reason}).then(({error})=>{if(error)console.warn('운영 로그 저장 실패:',error.message);});
  saveAdminOperations();
}

async function refreshAnnouncementsFromSupabase(admin=false) {
  if(!memberAuth)return;
  let query=memberAuth.from('announcements').select('id,category,title,summary,body,published,pinned,created_at').order('pinned',{ascending:false}).order('created_at',{ascending:false});
  if(!admin)query=query.eq('published',true);
  const {data,error}=await query;
  if(error){console.warn('공지 동기화 실패:',error.message);return;}
  adminOperations.announcements=(data||[]).map(row=>({id:row.id,category:row.category,title:row.title,summary:row.summary,body:row.body,published:row.published,pinned:row.pinned,createdAt:row.created_at}));
  renderAnnouncementTicker();renderAnnouncementList();
}

async function refreshAdminOperations() {
  if(!memberAuth)throw new Error('Supabase 설정이 없습니다.');
  if(!memberSession?.user){const {data}=await memberAuth.auth.getSession();memberSession=data?.session||null;}
  if(!memberSession?.user)throw new Error('운영자 인증 세션이 없습니다. 다시 로그인해 주세요.');
  const queries=await Promise.all([
    memberAuth.from('member_profiles').select('user_id,nickname,status,trust_level,created_at').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('user_reports').select('*').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('user_inquiries').select('*').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('partnership_inquiries').select('*').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('announcements').select('id,category,title,summary,body,published,pinned,created_at').order('created_at',{ascending:false}),
    memberAuth.from('open_talk_posts').select('id,author_id,author_nickname,category,title,body,status,created_at').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('topic_suggestions').select('id,author_id,category,title,rationale,for_text,against_text,source_url,status,created_at').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('issue_posts').select('id,topic_id,author_id,author_nickname,stance,kind,title,body,source_url,status,created_at').order('created_at',{ascending:false}).limit(1000),
    memberAuth.from('admin_audit_log').select('action,target,reason,created_at').order('created_at',{ascending:false}).limit(200),
    memberAuth.from('admin_site_state').select('payload').eq('state_key','editorial').maybeSingle()
  ]);
  const failed=queries.find(x=>x.error);if(failed)throw failed.error;
  const [members,reports,inquiries,partners,notices,talk,suggestions,posts,audit,siteState]=queries.map(x=>x.data||[]);
  if(siteState?.payload)Object.assign(editorialState,siteState.payload);
  memberTotalCount=members.length;
  const targetMap=new Map([...talk.map(x=>[x.id,{owner:x.author_id,nickname:x.author_nickname,title:x.title,status:x.status}]),...posts.map(x=>[x.id,{owner:x.author_id,nickname:x.author_nickname,title:x.title,status:x.status}])]);
  adminOperations.members=members.map(x=>({id:x.user_id,nickname:x.nickname,authRef:x.user_id,joined:new Date(x.created_at).toLocaleDateString('ko-KR'),status:({active:'정상',warned:'주의',suspended:'7일 정지',deleted:'탈퇴'})[x.status]||'정상',role:x.trust_level==='trusted'?'신뢰 회원':'일반 회원',reports:reports.filter(r=>targetMap.get(r.target_id)?.owner===x.user_id).length}));
  adminOperations.reports=reports.map(x=>{const target=targetMap.get(x.target_id)||{};return {id:x.id,memberId:target.owner||'',nickname:target.nickname||'익명 작성자',area:x.target_type==='open_talk_post'?'익명 자유토론장':'토론 게시글',summary:x.details,reason:x.reason,count:1,status:({pending:'미검토',reviewing:'검토 중',resolved:'조치 완료',dismissed:'위반 아님'})[x.status],postStatus:({published:'공개',hidden:'숨김',removed:'삭제됨'})[target.status]||'공개',postId:x.target_id,postTitle:target.title,issueId:x.target_type==='open_talk_post'?'open-talk':`topic-${posts.find(p=>p.id===x.target_id)?.topic_id||''}`,reportedAt:x.created_at};});
  adminOperations.inquiries=inquiries.map(x=>({id:x.id,type:x.category,title:x.title,sender:x.sender,memberId:x.user_id,received:new Date(x.created_at).toLocaleString('ko-KR'),status:({pending:'미답변',answered:'답변 완료',closed:'완료'})[x.status],message:x.message,reply:x.admin_note,answeredAt:x.answered_at,createdAt:x.created_at}));
  adminOperations.partnerships=partners.map(x=>({id:x.id,type:x.category,title:x.title,sender:x.organization,received:new Date(x.created_at).toLocaleString('ko-KR'),status:({pending:'미확인',reviewing:'검토 중',answered:'답변 중',closed:'완료'})[x.status],message:x.message,reply:x.admin_note,createdAt:x.created_at}));
  adminOperations.announcements=notices.map(x=>({id:x.id,category:x.category,title:x.title,summary:x.summary,body:x.body,published:x.published,pinned:x.pinned,createdAt:x.created_at}));
  adminOperations.openTalkPosts=talk.map(x=>({id:x.id,category:x.category,title:x.title,body:x.body,author:x.author_nickname,memberRef:x.author_id,status:({published:'공개',hidden:'숨김',removed:'삭제됨'})[x.status],createdAt:x.created_at,comments:[]}));
  adminOperations.topicSuggestions=suggestions.map(x=>({id:x.id,category:x.category,title:x.title,rationale:x.rationale,forText:x.for_text,againstText:x.against_text,sourceUrl:x.source_url,sender:'익명 제안자',memberRef:x.author_id,interestCount:0,status:({pending:'검토 대기',approved:'채택',rejected:'반려',withdrawn:'철회'})[x.status],createdAt:x.created_at}));
  adminDiscussionPosts=posts.map(x=>({id:x.id,issueId:`topic-${x.topic_id}`,stance:x.stance,kind:x.kind,title:x.title,content:x.body,sourceUrl:x.source_url,author:x.author_nickname,createdAt:x.created_at,status:x.status==='published'?'공개':x.status==='hidden'?'숨김':'삭제됨'}));
  const {data:talkComments}=await memberAuth.from('open_talk_comments').select('id,post_id,author_nickname,body,created_at').order('created_at');
  for(const row of talkComments||[]){const post=adminOperations.openTalkPosts.find(x=>x.id===row.post_id);if(post)post.comments.push({id:row.id,author:row.author_nickname,text:row.body,createdAt:row.created_at});}
  adminOperations.audit=audit.map(x=>({action:x.action,target:x.target,reason:x.reason,at:x.created_at,operator:'운영 관리자'}));
}

function saveEditorialState() {
  editorialState.activeIssueIds = activeIssueIds;
  localStorage.setItem(editorialStorageKey, JSON.stringify(editorialState));
  if(isVerifiedAdmin&&memberSession?.user)memberAuth?.from('admin_site_state').upsert({state_key:'editorial',payload:editorialState,updated_by:memberSession.user.id,updated_at:new Date().toISOString()},{onConflict:'state_key'}).then(({error})=>{if(error)console.warn('편집 상태 서버 저장 실패:',error.message);});
}

function getIssueData(issueId) {
  return issues[issueId] || archivedSampleIssues[issueId] || null;
}

function getIssueArchiveRecord(issueId) {
  const publishedArchive = publishedArchiveTopics.find((topic) => topic.id === issueId);
  if (publishedArchive) return { id: issueId, archivedAt: publishedArchive.archivedAt || publishedArchive.publishedAt };
  return editorialState.archived.find((record) => record.id === issueId) || null;
}

function getPersistedTopicUuid(issueId) {
  const direct = String(issueId).match(/^topic-([0-9a-f-]{36})$/i);
  if (direct) return direct[1];
  const approved = editorialState.approved.find((entry) => entry.id === issueId);
  const history = editorialState.history.find((entry) => entry.status === '승인' && entry.title === approved?.issue?.title);
  return /^[0-9a-f-]{36}$/i.test(history?.draftId || '') ? history.draftId : null;
}

function voteKey(issueId = activeIssueId) {
  return `${storagePrefix}vote:${issueId}`;
}

function syncSeoMetadata(issueId = null, historyMode = 'none') {
  const issue = issueId ? getIssueData(issueId) : null;
  const baseUrl = new URL(memberAppRootUrl);
  if (issue && String(issueId).startsWith('topic-')) {
    const slug = String(issue.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/g, '');
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/topics/${encodeURIComponent(`${slug}-${String(issueId).slice(6)}`)}/`;
  } else if (issue) baseUrl.searchParams.set('issue', issueId);
  const canonicalUrl = baseUrl.href;
  const title = issue ? `${issue.title} | 시선` : '시선 — 다른 관점이 모이는 곳';
  const description = (issue ? `${issue.intro} 여러 관점의 근거를 살펴보고 의견을 나눠보세요.` : '사회 쟁점을 여러 관점에서 살펴보고 근거와 함께 대화하는 커뮤니티, 시선.').slice(0, 160);
  document.title = title;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = title;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('meta[property="og:url"]').content = canonicalUrl;
  document.querySelector('link[rel="canonical"]').href = canonicalUrl;
  const websiteUrl = `${window.location.origin}${window.location.pathname}`;
  const schema = issue
    ? { '@context': 'https://schema.org', '@type': 'Article', headline: issue.title, description, articleSection: issue.category, articleBody: `${issue.intro} ${(issue.facts || []).join(' ')} ${(issue.cardFor || '')} ${(issue.cardAgainst || '')}`.slice(0, 5000), url: canonicalUrl, mainEntityOfPage: canonicalUrl, isPartOf: { '@type': 'WebSite', name: '시선', url: websiteUrl } }
    : { '@context': 'https://schema.org', '@type': 'WebSite', name: '시선', url: websiteUrl, description };
  document.querySelector('#seoStructuredData').textContent = JSON.stringify(schema);
  if (historyMode === 'push') window.history.pushState({ issueId, siseonRoute: 'issue' }, '', routeUrl('issue', { issueId }));
  if (historyMode === 'replace') window.history.replaceState({ ...(window.history.state || {}), issueId, siseonRoute: issueId ? 'issue' : (window.history.state?.siseonRoute || 'home') }, '', issueId ? routeUrl('issue', { issueId }) : memberAppRootUrl);
}

let publishedTopicsPromise;
let publishedArchiveTopics = [];
function loadPublishedTopics() {
  if (!publishedTopicsPromise) publishedTopicsPromise = (async () => {
    const config = window.SISEON_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) return [];
    const response = await fetch(`${config.url.replace(/\/$/, '')}/functions/v1/content-admin`, {
      method: 'POST', headers: { apikey: config.publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'topics-public' })
    });
    if (!response.ok) throw new Error('공개 안건을 불러오지 못했습니다.');
    const { topics = [] } = await response.json();
    const mapped = topics.map((row) => {
      const id = `topic-${row.id}`;
      return { id, voteOptions:row.vote_options || ['찬성','반대','판단 보류'], isHypothetical:row.is_hypothetical, generationMode:row.generation_mode, category: row.category, title: row.title, intro: row.intro, facts: row.facts || [], source: row.source, sourceUrl: row.source_url,
        forArguments: [['주요 논거', row.for_text]], againstArguments: [['주요 논거', row.against_text]], cardFor: row.for_text, cardAgainst: row.against_text,
        demoResults: [0, 0, 0], samplePosts: [], publishedAt: row.published_at || row.decided_at, expiresAt: row.expires_at, topicUuid: row.id, status: row.status, archivedAt: row.archived_at };
    });
    publishedArchiveTopics = mapped.filter((item) => item.status === 'archived');
    return mapped;
  })();
  return publishedTopicsPromise;
}

async function openIssue(issueId, historyMode = 'push') {
  let issue = getIssueData(issueId);
  if (!issue && String(issueId).startsWith('topic-')) {
    const topics = await loadPublishedTopics();
    issue = topics.find((item) => item.id === issueId);
    if (issue) {
      issues[issueId] = issue;
      if (issue.status !== 'archived') activeIssueIds = [issueId, ...activeIssueIds.filter((id) => id !== issueId)].slice(0, 30);
      renderPollCards();
      syncPollCarousel();
    }
  }
  if (!issue) return;
  const archiveRecord = getIssueArchiveRecord(issueId);
  if (archiveRecord && !isMemberSignedIn()) {
    openLogin(() => openIssue(issueId, historyMode));
    return;
  }
  activeIssueId = issueId;
  activeIssueIsArchived = Boolean(archiveRecord);
  const readOnlyAt = archiveRecord?.archivedAt ? new Date(archiveRecord.archivedAt) : null;
  if (readOnlyAt && !Number.isNaN(readOnlyAt.getTime())) readOnlyAt.setTime(readOnlyAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  activeIssueIsReadOnly = Boolean(readOnlyAt && Date.now() >= readOnlyAt.getTime());
  setTopNavActive('polls');
  syncSeoMetadata(issueId, historyMode);
  renderIssueContent();
  homeView.classList.add('hidden'); pollBoardView.classList.add('hidden');
  document.querySelector('#adminView').classList.add('hidden');
  announcementsView?.classList.add('hidden'); archiveView?.classList.add('hidden');
  openTalkView?.classList.add('hidden'); topicSuggestionsView?.classList.add('hidden');
  issueView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
  await loadMemberIssueData(issueId);
  renderVoteState();
  resumePendingAuthVote();
}

function openLogin(afterLogin = null) {
  pendingMemberAction = typeof afterLogin === 'function' ? afterLogin : null;
  if (memberSession?.user && !isMemberSignedIn()) { openNicknameSetup(); return; }
  if (!loginDialog.open) loginDialog.showModal();
}

function castDemoVote(choice) {
  return castMemberVote(choice);
}

async function loadMemberIssueData(issueId) {
  const topicId = getPersistedTopicUuid(issueId);
  if (!topicId || !isMemberSignedIn() || !memberAuth) return;
  const userId = memberSession.user.id;
  const { data: ownVote, error: voteError } = await memberAuth.from('topic_votes').select('choice').eq('topic_id', topicId).eq('user_id', userId).maybeSingle();
  if (voteError) console.warn('투표 여부를 불러오지 못했습니다:', voteError.message);
  if (ownVote?.choice) memberVoteChoices.set(issueId, ownVote.choice); else memberVoteChoices.delete(issueId);
  const choice = ownVote?.choice;
  if (choice || activeIssueIsArchived) {
    const { data: counts, error: resultError } = await memberAuth.rpc('get_topic_vote_results', { p_topic_id: topicId });
    if (!resultError) memberVoteResults.set(issueId, counts || []);
    else console.warn('투표 결과를 불러오지 못했습니다:', resultError.message);
  }
  if (choice || activeIssueIsArchived) {
    const { data: posts, error: postError } = await memberAuth.from('issue_posts').select('id,topic_id,author_id,author_nickname,stance,kind,title,body,source_url,created_at').eq('topic_id', topicId).eq('status','published').order('created_at',{ascending:false});
    if (postError) console.warn('토론 글을 불러오지 못했습니다:', postError.message);
    const mapped = (posts || []).map((row) => ({ id: row.id, stance: row.stance, kind: row.kind, title: row.title, content: row.body, sourceUrl: row.source_url, author: row.author_nickname, createdAt: row.created_at }));
    issuePostsCache.set(issueId, mapped);
    const ids = (posts || []).map((row) => row.id);
    issueCommentsCache.set(issueId, {});
    if (ids.length) {
      const { data: comments, error: commentError } = await memberAuth.from('issue_comments').select('id,post_id,author_nickname,body,created_at').in('post_id', ids).eq('status','published').order('created_at');
      if (commentError) console.warn('댓글을 불러오지 못했습니다:', commentError.message);
      for (const row of comments || []) (issueCommentsCache.get(issueId)[row.post_id] ||= []).push({ id: row.id, author: row.author_nickname, text: row.body, createdAt: row.created_at });
    }
  }
  if (activeIssueId === issueId) renderVoteState();
}

async function castMemberVote(choice) {
  const topicId = getPersistedTopicUuid(activeIssueId);
  if (!memberAuth || !memberSession?.user || !topicId) { showUserActionToast('투표 서버 연결을 확인할 수 없습니다.'); return; }
  const { error } = await memberAuth.from('topic_votes').insert({ topic_id: topicId, user_id: memberSession.user.id, choice });
  if (error) {
    showUserActionToast(error.code === '23505' ? '이미 이 안건에 투표했습니다. 같은 카카오 계정으로 재가입해도 다시 투표할 수 없습니다.' : `투표를 저장하지 못했습니다: ${error.message}`);
    await loadMemberIssueData(activeIssueId);
    return;
  }
  memberVoteChoices.set(activeIssueId, choice);
  pendingVote = null;
  await loadMemberIssueData(activeIssueId);
}

function stanceInfo(choice) {
  if (choice === '찬성') return { className: 'for', label: '찬성 의견', icon: '+' };
  if (choice === '반대') return { className: 'against', label: '반대 의견', icon: '−' };
  return { className: 'hold', label: escapeSiteText(choice || '판단 보류'), icon: '…' };
}

function opinionTag(choice) {
  const stance = stanceInfo(choice);
  return `<span class="tag ${stance.className}"><i class="opinion-icon">${stance.icon}</i>${stance.label}</span>`;
}

function readLocalList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function savedPostsKey(issueId) {
  return `${storagePrefix}posts:${issueId}`;
}

function savedCommentsKey(issueId, postId) {
  return `${storagePrefix}comments:${issueId}:${postId}`;
}

function appendCommentElement(list, comment) {
  const entry = document.createElement('p');
  entry.className = 'comment-entry';
  const author = document.createElement('b');
  author.textContent = comment.author || '참여자';
  const text = document.createElement('span');
  text.textContent = comment.text || '';
  entry.append(author, text);
  list.append(entry);
}

function createDiscussionPost(post) {
  const article = document.createElement('article');
  article.className = 'discussion-post';
  article.dataset.postId = post.id;
  article.dataset.postAuthor = post.author || '시연 사용자';
  article.dataset.postTitle = post.title || '';
  article.dataset.stance = post.stance;
  article.dataset.kind = post.kind || 'opinion';
  article.append(createOpinionTag(stanceInfo(post.stance)));
  if (post.kind && post.kind !== 'opinion') {
    const kindTag = document.createElement('span'); kindTag.className = 'tag discussion-kind-tag';
    kindTag.textContent = ({ question: '질문', source: '자료', correction: '정정 요청' })[post.kind] || '토론';
    article.append(kindTag);
  }

  const titleButton = document.createElement('button');
  titleButton.className = 'post-title-toggle';
  titleButton.type = 'button';
  titleButton.setAttribute('aria-expanded', 'false');
  titleButton.setAttribute('aria-controls', `post-body-${post.id}`);
  const title = document.createElement('span');
  title.textContent = post.title;
  const icon = document.createElement('span');
  icon.className = 'post-toggle-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⌄';
  titleButton.append(title, icon);

  const meta = document.createElement('p');
  meta.className = 'discussion-post-meta';
  const initialComments = (post.initialComments || []).map((text) => ({ author: '참여자', text }));
  const savedComments = issueCommentsCache.get(activeIssueId)?.[post.id] || [];
  const commentCount = initialComments.length + savedComments.length;
  meta.dataset.commentCount = String(commentCount);
  meta.textContent = `${post.author || '참여자'} · 댓글 ${commentCount}`;

  const postTools = document.createElement('div');
  postTools.className = 'discussion-post-tools';
  const reportButton = document.createElement('button');
  reportButton.type = 'button';
  reportButton.className = 'post-report-button';
  reportButton.dataset.reportPost = 'true';
  reportButton.textContent = '신고하기';
  reportButton.setAttribute('aria-label', `${post.title} 게시글 신고하기`);
  postTools.append(meta, reportButton);
  if (article.dataset.kind === 'opinion') postTools.append(createReactionBar('issue', post.id));

  const expanded = document.createElement('div');
  expanded.className = 'post-expanded hidden';
  expanded.id = `post-body-${post.id}`;
  const body = document.createElement('p');
  body.className = 'post-body';
  body.textContent = post.content;
  if (post.sourceUrl && /^https:\/\//i.test(post.sourceUrl)) {
    const source = document.createElement('a'); source.className = 'discussion-source-link'; source.href = post.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = '참고 자료 열기 ↗';
    expanded.append(body, source);
  } else expanded.append(body);

  const form = document.createElement('form');
  form.className = 'comment-form';
  const textarea = document.createElement('textarea');
  textarea.name = 'comment';
  textarea.rows = 3;
  textarea.maxLength = 1000;
  textarea.required = true;
  textarea.placeholder = '댓글을 입력하세요';
  textarea.setAttribute('aria-label', `${post.title} 댓글`);
  const formFooter = document.createElement('div');
  formFooter.className = 'comment-form-footer';
  const hint = document.createElement('small');
  hint.textContent = '최대 1,000자';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary-button';
  submit.textContent = '댓글 등록';
  formFooter.append(hint, submit);
  form.append(textarea, formFooter);

  const comments = document.createElement('div');
  comments.className = 'comment-list';
  comments.setAttribute('aria-live', 'polite');
  [...initialComments, ...savedComments].forEach((comment) => appendCommentElement(comments, comment));
  expanded.append(form, comments);
  article.append(titleButton, postTools, expanded);
  return article;
}

function renderIssueContent() {
  const issue = getIssueData(activeIssueId);
  const archiveRecord = activeIssueIsArchived ? getIssueArchiveRecord(activeIssueId) : null;
  const archivedDate = archiveRecord?.archivedAt ? new Date(archiveRecord.archivedAt).toLocaleDateString('ko-KR') : '';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const options = issue.voteOptions || ['찬성','반대','판단 보류'];
  const standard = JSON.stringify(options) === JSON.stringify(['찬성','반대','판단 보류']);
  const facts = issue.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('');
  const argumentCards = (items, side, title) => `<article class="argument-card ${side}"><h3><span>${side === 'for' ? '+' : '−'}</span> ${escapeHtml(title)}</h3><div class="argument-body"><ol class="argument-points">${items.flatMap(([heading, text]) => splitReadablePoints(text).map((point) => ({ heading, point }))).map(({ heading, point }) => `<li>${heading && heading !== '주요 논거' ? `<b>${escapeHtml(heading)}</b>` : ''}<p>${escapeHtml(point)}</p></li>`).join('')}</ol><small>각 항목은 토론용 관점이며, 사실은 출처에서 확인해 주세요.</small></div></article>`;
  const detail = document.querySelector('#issueView .issue-content');
  detail.innerHTML = `
    <div class="issue-meta"><span class="category">${escapeHtml(issue.category)}</span><span>${activeIssueIsArchived ? `${activeIssueIsReadOnly ? '지난 투표 · 읽기 전용' : '지난 투표 · 댓글 가능'}${archivedDate ? ` · 보관 ${archivedDate}` : ''}` : `투표 마감 ${formatPollDeadline(issue)}`}</span><span>·</span><span>읽는 시간 3분</span></div>
    <h1>${escapeHtml(issue.title)}</h1>${renderReadableParagraphs(issue.intro, 'issue-intro')}
    <section class="facts-card"><div class="card-eyebrow">${issue.isHypothetical ? '가상 상황 · 선택의 조건' : '배경과 확인할 내용'}</div><h2>공통으로 확인할 내용</h2><ul>${facts}</ul><p>확인 가능한 사실과 각 입장의 해석을 구분합니다. ${safeHttpsUrl(issue.sourceUrl) ? `<a class="candidate-source" href="${escapeHtml(safeHttpsUrl(issue.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(issue.source)} ↗</a>` : escapeHtml(issue.source)}</p></section>
    <h2 class="subhead">선택 전에 생각해 볼 관점</h2><div class="arguments">${argumentCards(issue.forArguments, 'for', standard ? '찬성 측 주장' : '고려할 관점 1')}${argumentCards(issue.againstArguments, 'against', standard ? '반대 측 주장' : '고려할 관점 2')}</div>
    <section class="vote-card"><div class="card-eyebrow">${activeIssueIsArchived ? 'ARCHIVE RESULTS' : 'YOUR VOICE'}</div><h2>${activeIssueIsArchived ? '지난 투표 결과' : '당신의 생각은 어떤가요?'}</h2><p>${activeIssueIsArchived ? '투표가 종료된 주제의 결과와 토론 기록입니다.' : '이 이슈에 한 번 투표할 수 있어요. 투표 전에는 결과와 토론 글을 볼 수 없습니다.'}</p><div class="vote-options ${activeIssueIsArchived ? 'hidden' : ''}">${options.map((option,index)=>`<button data-vote="${escapeHtml(option)}" class="${index === 0 ? 'for' : index === 1 ? 'against' : 'hold'}"><span>${index+1}</span> ${escapeHtml(option)}</button>`).join('')}</div><div id="voteMessage" class="vote-message">${activeIssueIsArchived ? '지난 투표 결과와 토론을 보고 있습니다.' : '투표 후 결과와 토론이 열립니다.'}</div><div id="postVoteResults" class="hidden"></div></section>
    <section class="discussion hidden" id="discussionSection"><div class="discussion-title"><div class="card-eyebrow">COMMUNITY VOICES</div><h2>이 이슈의 토론</h2><p class="discussion-demo-note">입장 글과 질문·자료·정정 요청을 나누어 살펴보세요.</p></div><div class="tabs"><button class="active" data-discussion-filter="all">전체</button>${standard ? '<button data-discussion-filter="for">찬성 입장</button><button data-discussion-filter="against">반대 입장</button>' : ''}<button data-discussion-filter="question">질문 · 자료</button><button data-discussion-filter="correction">정정 요청</button></div><div id="discussionPosts" class="discussion-post-list"></div><button class="primary-button write-button" id="writeButton">의견 남기기 <span>→</span></button></section>`;
  const topicUuid = getPersistedTopicUuid(activeIssueId);
  if (topicUuid) {
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'text-link';
    share.textContent = '공유하기';
    detail.querySelector('.issue-meta').append(share);
    const fallbackShare = new URL(memberAppRootUrl);
    fallbackShare.searchParams.set('share', topicUuid);
    const topicPage = new URL(`topics/${encodeURIComponent(topicUuid)}/`, memberAppRootUrl);
    let shareUrl = fallbackShare.href;
    // Newly published polls may precede the next GitHub Pages build.
    void fetch(topicPage.href, { method: 'HEAD', cache: 'no-cache', redirect: 'error' })
      .then(response => { if (response.ok) shareUrl = topicPage.href; })
      .catch(() => {});
    share.addEventListener('click', async () => {
      const url = shareUrl;
      try {
        if (navigator.share) { await navigator.share({url}); return; }
        await navigator.clipboard.writeText(url);
        showUserActionToast('공유 링크를 복사했습니다.');
      } catch (error) {
        if (error.name !== 'AbortError') window.prompt('공유 링크를 복사해 주세요.', url);
      }
    });
  }
  renderPrivateDiscussion();
}

function renderPrivateDiscussion() {
  const postList = document.querySelector('#discussionPosts');
  if (!postList) return;
  postList.replaceChildren();
  const isMember = isMemberSignedIn();
  const hasVoted = Boolean(memberVoteChoices.get(activeIssueId));
  if (!isMember || (!activeIssueIsArchived && !hasVoted)) return;
  const issue = getIssueData(activeIssueId);
  if (!issue) return;
  const unavailablePostIds = new Set([...adminOperations.reports.filter((report) => report.issueId === activeIssueId && report.postStatus !== '공개').map((report) => report.postId), ...adminOperations.hiddenDiscussionPosts]);
  [...(issuePostsCache.get(activeIssueId) || [])]
    .filter((post) => !unavailablePostIds.has(post.id))
    .forEach((post) => postList.append(createDiscussionPost(post)));
  const popular = document.createElement('section');
  popular.className = 'popular-opinions hidden';
  postList.prepend(popular);
  refreshPostReactions(postList, 'issue');
  applyDiscussionFilter('all');
  if (activeIssueIsReadOnly) document.querySelectorAll('#discussionPosts .comment-form').forEach((form) => form.classList.add('hidden'));
}

function applyDiscussionFilter(filter) {
  const popular = document.querySelector(".popular-opinions");
  if (popular) popular.hidden = filter !== "all";
  document.querySelectorAll('#discussionSection [data-discussion-filter]').forEach((button) => button.classList.toggle('active', button.dataset.discussionFilter === filter));
  document.querySelectorAll('#discussionPosts .discussion-post').forEach((post) => {
    const kind = post.dataset.kind; const stance = post.dataset.stance;
    const show = filter === 'all' || (filter === 'for' && stance === '찬성' && kind === 'opinion') || (filter === 'against' && stance === '반대' && kind === 'opinion') || (filter === 'question' && ['question','source'].includes(kind)) || (filter === 'correction' && kind === 'correction');
    post.classList.toggle('hidden', !show);
  });
}

function renderVoteState() {
  if (!activeIssueId) return;
  const isMember = isMemberSignedIn();
  if (activeIssueIsArchived) {
    renderDemoResults(isMember);
    document.querySelector('#discussionSection').classList.toggle('hidden', !isMember);
    document.querySelectorAll('#issueView .vote-options').forEach((options) => options.classList.add('hidden'));
    document.querySelector('#voteMessage').textContent = !isMember
      ? '로그인하면 지난 투표 결과와 토론을 확인할 수 있습니다.'
      : activeIssueIsReadOnly ? '보관 후 90일이 지나 읽기 전용으로 열람 중입니다.' : '투표가 종료된 주제입니다. 결과와 토론을 확인할 수 있습니다.';
    renderPrivateDiscussion();
    const writeButton = document.querySelector('#writeButton');
    writeButton.classList.add('hidden');
    return;
  }
  const choice = memberVoteChoices.get(activeIssueId);
  const canSeePrivate = Boolean(isMember && choice);
  const discussion = document.querySelector('#discussionSection');
  const message = document.querySelector('#voteMessage');
  const voteButtons = [...document.querySelectorAll('#issueView [data-vote]')];
  renderDemoResults(canSeePrivate);
  discussion.classList.toggle('hidden', !isMember);
  const discussionNote = discussion.querySelector('.discussion-demo-note');
  if (discussionNote) discussionNote.textContent = !isMember
    ? '로그인 후 투표하면 결과와 토론 글을 확인할 수 있습니다.'
    : choice ? '입장 글과 질문·자료·정정 요청을 나누어 살펴보세요.' : '투표를 마치면 이곳에서 결과와 토론을 확인하고 의견을 남길 수 있습니다.';
  discussion.querySelector('.tabs')?.classList.toggle('hidden', !canSeePrivate);
  document.querySelector('#discussionPosts')?.classList.toggle('hidden', !canSeePrivate);
  document.querySelector('#writeButton')?.classList.toggle('hidden', !canSeePrivate || activeIssueIsReadOnly);
  voteButtons.forEach((button) => {
    button.disabled = Boolean(choice);
    if (choice && button.dataset.vote === choice) button.setAttribute('aria-pressed', 'true');
  });
  message.textContent = !isMember
    ? '로그인하면 투표할 수 있습니다. 안건과 양쪽 의견은 공개되어 있습니다.'
    : choice ? `투표 완료: ${choice}. 결과와 토론이 열렸습니다.` : '투표 후 결과와 토론이 열립니다.';
  renderPrivateDiscussion();
}

function renderDemoResults(visible) {
  const target = document.querySelector('#postVoteResults');
  target.replaceChildren();
  target.classList.toggle('hidden', !visible);
  if (!visible) return;
  const rows = memberVoteResults.get(activeIssueId) || [];
  const counts = Object.fromEntries(rows.map((row) => [row.choice, Number(row.vote_count)]));
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const percent = (choice) => total ? Math.round((counts[choice] || 0) * 100 / total) : 0;
  const options = getIssueData(activeIssueId)?.voteOptions || ['찬성','반대','판단 보류'];
  target.innerHTML = `<div class="result-heading"><strong>현재 결과</strong><span>참여자 ${total}명</span></div>${options.map(option=>`<div class="option-result"><div><b>${escapeSiteText(option)}</b><span>${counts[option] || 0}표 · ${percent(option)}%</span></div><progress max="100" value="${percent(option)}" aria-label="${escapeSiteText(option)}"></progress></div>`).join('')}<small>시선 참여자의 의견이며 전체 여론을 대표하지 않습니다. 반올림으로 합계가 100%와 다를 수 있습니다.</small>`;

}

function renderPollCards() {
  const list = document.querySelector('#activePollList');
  const countBadge = document.querySelector('.count-pill');
  if (!list) return;
  const entries = activeIssueIds.map((id) => [id, issues[id]]).filter(([, issue]) => Boolean(issue));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  list.replaceChildren(...entries.map(([id, issue], index) => {
    const card = document.createElement('article');
    const forText = issue.cardFor || issue.forArguments.map((item) => item[1]).join('\n');
    const againstText = issue.cardAgainst || issue.againstArguments.map((item) => item[1]).join('\n');
    card.className = 'poll-card';
    card.innerHTML = `<div class="poll-top"><span class="live-label"><i></i> 진행 중인 투표 <b>${String(index + 1).padStart(2, '0')} / ${entries.length}</b></span><span class="deadline" data-poll-deadline="${escapeHtml(id)}">${formatPollDeadline(issue)}</span></div><div class="poll-body"><div class="poll-meta"><span class="category">${escapeHtml(issue.category)}</span><span>읽는 시간 3분</span></div><h3>${escapeHtml(issue.title)}</h3>${renderReadableParagraphs(issue.intro, 'poll-summary')}<div class="stance-grid"><div class="stance for"><div class="stance-head"><span class="stance-symbol">+</span><b>찬성 의견</b></div>${renderReadablePoints(forText, 'stance-points')}</div><div class="stance against"><div class="stance-head"><span class="stance-symbol">−</span><b>반대 의견</b></div>${renderReadablePoints(againstText, 'stance-points')}</div></div><div class="poll-footer"><span class="participant-count">주제 출처 · ${escapeHtml(issue.source.split(' · ')[0])}</span><a class="primary-button" data-open-issue="${escapeHtml(id)}" href="?issue=${encodeURIComponent(id)}">투표하고 이야기 보기 <span>→</span></a></div></div>`;
    return card;
  }));
  if (countBadge) countBadge.textContent = `${entries.length}개`;
  list.scrollLeft = 0;
  syncPollCarousel();
}

function formatPollDeadline(issue) {
  const expiresAt = issue?.expiresAt ? new Date(issue.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return '마감일 확인 중';
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) return '투표 종료';
  const day = 24 * 60 * 60 * 1000;
  if (remaining < 60 * 60 * 1000) return `D-day · ${Math.max(1, Math.ceil(remaining / 60000))}분`;
  if (remaining < day) return `D-day · ${Math.ceil(remaining / (60 * 60 * 1000))}시간`;
  return `D-${Math.ceil(remaining / day)}`;
}

function refreshPollDeadlines() {
  const expiredIds = activeIssueIds.filter((id) => {
    const expiresAt = issues[id]?.expiresAt ? Date.parse(issues[id].expiresAt) : NaN;
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  });
  if (expiredIds.length) {
    expiredIds.forEach((id) => {
      const issue = issues[id];
      const archivedAt = issue.expiresAt;
      issues[id] = { ...issue, status: 'archived', archivedAt };
      publishedArchiveTopics = [issues[id], ...publishedArchiveTopics.filter((item) => item.id !== id)];
    });
    activeIssueIds = activeIssueIds.filter((id) => !expiredIds.includes(id));
    renderPollCards(); renderPollBoard(); renderEditorialArchives(); syncPollCarousel();
    if (activeIssueId && expiredIds.includes(activeIssueId)) {
      activeIssueIsArchived = true;
      const readOnlyAt = new Date(issues[activeIssueId].archivedAt).getTime() + 90 * 24 * 60 * 60 * 1000;
      activeIssueIsReadOnly = Date.now() >= readOnlyAt;
      renderIssueContent(); renderVoteState();
    }
    return;
  }
  document.querySelectorAll('[data-poll-deadline]').forEach((element) => {
    const issue = issues[element.dataset.pollDeadline];
    if (issue) element.textContent = formatPollDeadline(issue);
  });
}
window.setInterval(refreshPollDeadlines, 60 * 1000);

function renderEditorialArchives() {
  const list = document.querySelector('#archive .archive-list');
  if (!list) return;
  list.replaceChildren();
  list.querySelectorAll('[data-editorial-archive="true"]').forEach((row) => row.remove());
  list.querySelectorAll('[data-server-archive="true"]').forEach((row) => row.remove());
  [...publishedArchiveTopics].slice(0, 100).forEach((issue, index) => {
    const row = document.createElement('a');
    row.className = 'archive-row'; row.href = `?issue=${encodeURIComponent(issue.id)}`; row.dataset.openIssue = issue.id; row.dataset.serverArchive = 'true';
    const main = document.createElement('div'); main.className = 'archive-main';
    const title = document.createElement('strong'); title.textContent = issue.title;
    const meta = document.createElement('span'); meta.textContent = `보관함 이동 ${new Date(issue.archivedAt || issue.publishedAt || Date.now()).toLocaleDateString('ko-KR')} · ${issue.category}`;
    const note = document.createElement('small'); note.textContent = '승인된 투표 · 보관 중';
    main.append(title, meta, note);
    const arrow = document.createElement('div'); arrow.className = 'archive-arrow'; arrow.textContent = '↗';
    const number = document.createElement('div'); number.className = 'archive-icon'; number.textContent = String(index + 1).padStart(2, '0');
    row.append(number, main, arrow); list.append(row);
  });
  if (!list.children.length) {
    const empty = document.createElement('div'); empty.className = 'community-empty'; empty.textContent = '아직 보관된 투표가 없습니다.'; list.append(empty);
  }
  const fullList = document.querySelector('#archivePageList');
  if (fullList) fullList.replaceChildren(...[...list.children].map((row) => row.cloneNode(true)));
}

async function managePollFromAdmin(issueId, managementAction, button) {
  const issue = getIssueData(issueId);
  if (!issue || !isVerifiedAdmin) return;
  const isArchive = managementAction === 'archive';
  const label = isArchive ? '지난 투표 보관함으로 이동' : '삭제';
  const confirmText = isArchive
    ? `“${issue.title}”을(를) 진행 중인 투표에서 내리고 지난 투표 보관함으로 이동할까요?`
    : `“${issue.title}”을(를) 삭제할까요? 삭제한 안건은 사용자 화면과 검색용 사이트맵에서 내려갑니다.`;
  if (!window.confirm(confirmText)) return;
  const uuid = getPersistedTopicUuid(issueId);
  const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = isArchive ? '이동 중…' : '삭제 중…'; }
  try {
    if (uuid) {
      if (!window.SISEON_TOPIC_ADMIN?.manage) throw new Error('투표 관리 API가 없습니다. content-automation.js를 최신 버전으로 배포해 주세요.');
      await window.SISEON_TOPIC_ADMIN.manage(uuid, managementAction);
    }
    const canonicalId = uuid ? `topic-${uuid}` : issueId;
    if (uuid && canonicalId !== issueId) {
      issues[canonicalId] = { ...issue, id: canonicalId, topicUuid: uuid };
      delete issues[issueId];
      editorialState.approved = editorialState.approved.filter((entry) => entry.id !== issueId);
    }
    activeIssueIds = activeIssueIds.filter((id) => id !== issueId && id !== canonicalId);
    if (isArchive) {
      const archivedAt = new Date().toISOString();
      if (uuid) {
        publishedArchiveTopics = [
          { ...issues[canonicalId], id: canonicalId, topicUuid: uuid, status: 'archived', archivedAt },
          ...publishedArchiveTopics.filter((entry) => entry.id !== canonicalId)
        ];
      } else {
        editorialState.archived.unshift({ id: canonicalId, title: issue.title, category: issue.category, archivedAt });
      }
      editorialState.history.unshift({ status: '보관', draftId: uuid || canonicalId, title: issue.title, category: issue.category, at: archivedAt });
    } else {
      publishedArchiveTopics = publishedArchiveTopics.filter((entry) => entry.id !== canonicalId);
      editorialState.archived = editorialState.archived.filter((entry) => entry.id !== canonicalId && entry.id !== issueId);
      editorialState.approved = editorialState.approved.filter((entry) => entry.id !== canonicalId && entry.id !== issueId);
      delete issues[canonicalId]; delete issues[issueId];
      editorialState.history.unshift({ status: '삭제', draftId: uuid || canonicalId, title: issue.title, category: issue.category, at: new Date().toISOString() });
    }
    saveEditorialState();
    logAdminAction(isArchive ? '투표를 지난 보관함으로 이동' : '투표 삭제', issue.title, `투표 ID: ${uuid || issueId}`);
    renderPollCards(); renderPollBoard(); renderEditorialArchives();
    renderAdminPage('polls');
    renderAdminDashboard();
  } catch (error) {
    window.alert(`${label} 처리에 실패했습니다.\n\n${error.message || error}`);
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
}

document.querySelector('#activePollList').addEventListener('click', (event) => {
  const link = event.target.closest('[data-open-issue]');
  if (link) { event.preventDefault(); openIssue(link.dataset.openIssue); }
});
document.querySelector('#archive .archive-list').addEventListener('click', (event) => {
  const row = event.target.closest('[data-open-issue]');
  if (row) { event.preventDefault(); openIssue(row.dataset.openIssue); }
});
document.querySelector('#archivePageList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-open-issue]');
  if (row) { event.preventDefault(); openIssue(row.dataset.openIssue); }
});

const adminView = document.querySelector('#adminView');
const adminEntryButton = document.querySelector('#adminEntryButton');
const editorialForm = document.querySelector('#editorialForm');
const editorialFieldNames = ['category', 'title', 'intro', 'facts', 'source', 'sourceUrl', 'forText', 'againstText'];
let isVerifiedAdmin = false;

function showAdminView(pushHistory = true) {
  document.querySelector('#publicSharedPoll')?.classList.add('hidden');
  document.querySelector('#siteInfoView').classList.add('hidden');
  document.querySelector('#memberView').classList.add('hidden');
  if (!isVerifiedAdmin) {
    const dialog = document.querySelector('#adminLoginDialog');
    if (dialog && !dialog.open) dialog.showModal();
    return;
  }
  homeView.classList.add('hidden');
  pollBoardView.classList.add('hidden');
  issueView.classList.add('hidden');
  announcementsView.classList.add('hidden'); archiveView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden');
  adminView.classList.remove('hidden');
  currentAdminPage = 'overview';
  refreshAdminOperations().then(()=>{renderAdminDashboard();renderAdminPage(currentAdminPage);}).catch((error)=>{console.error('관리자 데이터를 불러오지 못했습니다:',error);showUserActionToast(`운영 데이터를 불러오지 못했습니다: ${error.message}`);renderAdminDashboard();});
  if (pushHistory) pushAppRoute('admin', { adminPage: 'overview' });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function currentDraftFromForm() {
  const values = Object.fromEntries(new FormData(editorialForm).entries());
  const savedMetadata = editorialState.pending.find((draft) => draft.id === activeDraftId) || {};
  return {
    ...savedMetadata,
    voteOptions: [...editorialForm.querySelectorAll('[name="voteOption"]')].map(input => input.value.normalize('NFC').trim()),
    id: activeDraftId || editorialState.pending[0]?.id || `editorial-${Date.now()}`,
    category: values.category.trim(), title: values.title.trim(), intro: values.intro.trim(),
    facts: values.facts.split('\n').map((fact) => fact.trim()).filter(Boolean),
    source: values.source.trim(), sourceUrl: values.sourceUrl.trim(),
    forText: values.forText.trim(), againstText: values.againstText.trim()
  };
}

function updateAdminPreview() {
  if (!editorialForm || editorialForm.classList.contains('hidden')) return;
  const draft = currentDraftFromForm();
  document.querySelector('#previewCategory').textContent = draft.category || '카테고리';
  document.querySelector('#previewTitle').textContent = draft.title || '투표 제목';
  document.querySelector('#previewIntro').textContent = draft.intro || '주제 설명';
  document.querySelector('#previewRecency').textContent = draft.trendingReason ? `최근 이슈 근거: ${draft.trendingReason}` : '최근 이슈 근거가 별도로 기록되지 않았습니다. 보도 날짜와 출처의 시의성을 확인해 주세요.';
  document.querySelector('#previewFor').textContent = draft.forText || '찬성 관점';
  document.querySelector('#previewAgainst').textContent = draft.againstText || '반대 관점';
  const facts = document.querySelector('#previewFacts');
  facts.replaceChildren(...(draft.facts.length ? draft.facts : ['확인된 사실을 입력해 주세요.']).map((fact) => {
    const item = document.createElement('li'); item.textContent = fact; return item;
  }));
  const source = document.querySelector('#previewSource');
  source.textContent = draft.source || '출처 이름과 날짜를 입력해 주세요.';
  const validUrl = /^https:\/\//i.test(draft.sourceUrl);
  source.href = validUrl ? draft.sourceUrl : '#';
  source.setAttribute('aria-disabled', String(!validUrl));
}

function renderEditorialHistory() {
  const container = document.querySelector('#editorialHistory');
  const records = [...editorialState.history].reverse();
  container.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'history-empty'; empty.textContent = '아직 승인하거나 반려한 기록이 없습니다.'; container.append(empty); return;
  }
  records.slice(0, 12).forEach((record) => {
    const row = document.createElement('article'); row.className = 'history-row';
    const marker = document.createElement('span'); marker.className = `history-status ${record.status.startsWith('승인') ? 'approved' : 'rejected'}`; marker.textContent = record.status;
    const details = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = record.title;
    const meta = document.createElement('small'); meta.textContent = `${record.category} · ${new Date(record.at).toLocaleString('ko-KR')}${record.replacedTitle ? ` · 보관함 이동: ${record.replacedTitle}` : ''}`;
    details.append(title, meta); row.append(marker, details); container.append(row);
  });
}

function renderAdminDashboard() {
  renderAdminPage(currentAdminPage);
}

function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function safeHttpsUrl(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function renderReviewQueue() {
  const queue = document.querySelector('#reviewQueueList');
  const categoryFilter = document.querySelector('#reviewCategoryFilter');
  const categories = [...new Set(editorialState.pending.map((draft) => draft.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  categoryFilter.innerHTML = ['전체 분야', ...categories].map((category) => `<option value="${escapeAdminHtml(category)}">${escapeAdminHtml(category)}</option>`).join('');
  if (activeReviewCategory !== '전체 분야' && !categories.includes(activeReviewCategory)) activeReviewCategory = '전체 분야';
  categoryFilter.value = activeReviewCategory;
  const visibleDrafts = editorialState.pending.filter((draft) => activeReviewCategory === '전체 분야' || draft.category === activeReviewCategory);
  document.querySelector('#pendingCount').textContent = String(editorialState.pending.length);
  document.querySelector('#navPendingCount').textContent = String(editorialState.pending.length);
  if (!visibleDrafts.some((draft) => draft.id === activeDraftId)) activeDraftId = visibleDrafts[0]?.id || null;
  const pendingMarkup = visibleDrafts.map((draft) => {
    const batch = draft.batchId ? editorialState.pending.filter((item) => item.batchId === draft.batchId) : [];
    const batchPosition = batch.findIndex((item) => item.id === draft.id) + 1;
    const batchLabel = batch.length ? `이번 생성 후보 ${batch.length}개 중 ${batchPosition}번` : 'AI 검토 안건';
    const recency = draft.trendingReason ? `<small>주제 선정 이유 · ${escapeAdminHtml(draft.trendingReason)}</small>` : '';
    const selectedField = (draft.dataSignals?.manualReviewRequired ? '<small>관리자 직접 승인 필요 · 자동 승인 제외</small>' : '') + (draft.selectedField ? `<small>후보 생성 분야 · ${escapeAdminHtml(draft.selectedField)}</small>` : '');
    const headlines = draft.dataSignals?.coverageSources || draft.dataSignals?.relatedHeadlines || [];
    const bingSummary = headlines.length ? `<small>참고 소재 · ${headlines.length}건 (게시글·보도 수는 여론의 증거가 아님)</small>` : '';
    const bingLinks = headlines.slice(0, 5).map((article) => safeHttpsUrl(article.url) ? `<a href="${escapeAdminHtml(safeHttpsUrl(article.url))}" target="_blank" rel="noopener noreferrer">${escapeAdminHtml(article.source || '기사')} ↗</a>` : '').filter(Boolean).join(' · ');
    const primarySources = (draft.dataSignals?.primarySources || []).map((source) => safeHttpsUrl(source.url) ? `<a href="${escapeAdminHtml(safeHttpsUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escapeAdminHtml(source.publisher || '자료')}: ${escapeAdminHtml(source.title || '원자료')} ↗</a>` : '').filter(Boolean).join(' · ');
    const reviewNote = [draft.dataSignals?.aiProvider ? `생성 AI: ${draft.dataSignals.aiProvider} · ${draft.dataSignals.aiModel || ''}` : '', draft.dataSignals?.editorialReview].filter(Boolean).join('\n');
    const guidelineNote = draft.dataSignals?.guidelineVersion ? `<small>작성 지침 · ${escapeAdminHtml(draft.dataSignals.guidelineVersion)}</small>` : '<small>새 작성 지침 적용 전 후보</small>';
    const bingEvidence = `${bingLinks ? `<small>${bingLinks}</small>` : ''}${primarySources ? `<small>사실·논거 확인 자료 · ${primarySources}</small>` : '<small>원자료 확인 · 등록된 검증 자료 없음 (승인 전 확인 필요)</small>'}${guidelineNote}${reviewNote ? `<details><summary>AI 편집 검토 의견</summary><p style="white-space:pre-wrap">${escapeAdminHtml(reviewNote)}</p></details>` : ''}`;
    return `<article class="review-queue-item ${draft.id === activeDraftId ? 'selected' : ''}"><div><span class="ai-recommend-tag">${batchLabel} · 운영자 검토 필요</span><strong>${escapeAdminHtml(draft.title)}</strong><small>${escapeAdminHtml(draft.category)} · 출처 ${escapeAdminHtml(draft.source)}</small>${selectedField}${recency}${bingSummary}${bingEvidence}</div><button type="button" data-review-draft="${escapeAdminHtml(draft.id)}">${draft.id === activeDraftId ? '검토 중' : '검토하기'} <span>→</span></button></article>`;
  }).join('') || `<div class="empty-draft">${editorialState.pending.length ? '선택한 분야의 검토 대기 안건이 없습니다.' : '검토 대기 안건이 없습니다.'}</div>`;
  const scheduledMarkup = scheduledTopicQueue.length ? `<section class="scheduled-topic-queue"><h3>예약 공개 안건 ${scheduledTopicQueue.length}건</h3>${scheduledTopicQueue.map((topic) => `<article><strong>${escapeAdminHtml(topic.title)}</strong><span>${escapeAdminHtml(topic.category)} · ${new Date(topic.scheduled_for).toLocaleString('ko-KR')} 공개 예정</span></article>`).join('')}</section>` : '';
  queue.innerHTML = `${pendingMarkup}${scheduledMarkup}`;
  const draft = visibleDrafts.find((item) => item.id === activeDraftId);
  if (draft && activeDraftId !== draft.id) activeDraftId = draft.id;
  document.querySelector('#adminReviewWorkflow').classList.toggle('hidden', currentAdminPage !== 'reviews');
  document.querySelector('#adminPageContent').classList.toggle('hidden', currentAdminPage === 'reviews');
  editorialForm.classList.toggle('hidden', !draft);
  document.querySelector('.admin-preview-panel').classList.toggle('hidden', !draft);
  document.querySelector('#emptyDraftState').classList.toggle('hidden', Boolean(draft));
  document.querySelector('#draftStatus').classList.toggle('hidden', !draft);
  if (draft) {
    editorialFieldNames.forEach((name) => {
      const field = editorialForm.elements.namedItem(name);
      field.value = name === 'facts' ? draft.facts.join('\n') : draft[name] || '';
    });
    renderDraftVoteOptions(draft.voteOptions);
    updateAdminPreview();
  }
  renderEditorialHistory();
}

window.addEventListener('siseon-topic-candidates-loaded', (event) => {
  const candidates = Array.isArray(event.detail?.candidates) ? event.detail.candidates : [];
  scheduledTopicQueue = Array.isArray(event.detail?.scheduled) ? event.detail.scheduled : [];
  editorialState.pending = candidates;
  const selectedDraftStillPending = candidates.some((draft) => draft.id === activeDraftId);
  activeDraftId = selectedDraftStillPending ? activeDraftId : (candidates[0]?.id || null);
  saveEditorialState();
  if (currentAdminPage === 'reviews') renderReviewQueue();
});

window.addEventListener('siseon-topic-candidates-error', (event) => {
  const status = document.querySelector('#topicGenerationStatus');
  if (status) status.textContent = event.detail?.message || 'Supabase 안건 대기열을 불러오지 못했습니다.';
});

document.querySelector('#generateTopicCandidatesButton')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.querySelector('#topicGenerationStatus');
  const api = window.SISEON_TOPIC_ADMIN;
  if (!api) { status.textContent = '관리자 Supabase 연결을 먼저 확인해 주세요.'; return; }
  if (!window.confirm('새 후보 1~5개를 추가할까요? 기존 후보와 공개 투표는 유지됩니다.')) return;
  const topicField = document.querySelector('#topicGenerationField').value;
  button.disabled = true; status.textContent = '선택한 방식으로 질문과 선택지를 만들고 있습니다…';
  try {
    const result = await api.generate({ topicField, generationMode: document.querySelector('#topicGenerationMode').value, topicKeyword: document.querySelector('#topicGenerationKeyword').value, sourceText: document.querySelector('#topicGenerationSourceText').value, sourceUrl: document.querySelector('#topicGenerationSourceUrl').value, brief: document.querySelector('#topicGenerationBrief').value, existingTitles: activeIssueIds.map((id) => issues[id]?.title).filter(Boolean) });
    status.textContent = `후보 ${result.generatedCount}개를 추가했습니다. 질문·선택지·가상 표시와 참고 자료를 확인해 주세요.${result.discoveryWarnings?.length ? " 일부 검색에 실패하여 수집된 자료만 사용했습니다." : ""}`;
    renderReviewQueue();
  } catch (error) {
    status.textContent = `생성에 실패했습니다: ${error.message}`;
  } finally { button.disabled = false; }
});

function renderMembersTable() {
  const body = document.querySelector('#memberTableBody');
  if (!body) return;
  const query = document.querySelector('#memberSearch')?.value.trim().toLowerCase() || '';
  const status = document.querySelector('#memberStatusFilter')?.value || '전체';
  const members = adminOperations.members.filter((member) => (status === '전체' || member.status === status) && `${member.nickname} ${member.id}`.toLowerCase().includes(query));
  body.innerHTML = members.map((member) => `<tr><td><strong>${escapeAdminHtml(member.nickname)}</strong><small>${escapeAdminHtml(member.id)}</small></td><td>${escapeAdminHtml(member.joined)}</td><td><span class="admin-status ${member.status === '정상' ? 'status-good' : member.status === '7일 정지' ? 'status-blocked' : 'status-warn'}">${escapeAdminHtml(member.status)}</span></td><td>${member.reports}건</td><td><select class="member-role-select" data-member-role="${escapeAdminHtml(member.id)}" aria-label="${escapeAdminHtml(member.nickname)} 권한"><option ${!member.role || member.role === '일반 회원' ? 'selected' : ''}>일반 회원</option><option ${member.role === '신뢰 회원' ? 'selected' : ''}>신뢰 회원</option></select></td><td class="row-actions"><button data-admin-action="warn-member" data-id="${member.id}">경고</button><button data-admin-action="suspend-member" data-id="${member.id}">7일 정지</button>${member.status === '7일 정지' ? `<button data-admin-action="restore-member" data-id="${member.id}">정지 해제</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">검색 결과가 없습니다.</td></tr>';
}

function renderAdminPage(page = currentAdminPage) {
  currentAdminPage = page;
  document.querySelectorAll('.admin-nav').forEach((button) => button.classList.toggle('active', button.dataset.adminPage === page));
  const pollNavCount = document.querySelector('#navPollCount');
  if (pollNavCount) pollNavCount.textContent = String(activeIssueIds.length);
  document.querySelector('#navPendingCount').textContent = String(editorialState.pending.length);
  const reportNav = document.querySelector('[data-admin-page="reports"] .nav-alert');
  if (reportNav) reportNav.textContent = String(adminOperations.reports.filter((item) => item.status === '미검토').length);
  const inquiryNav = document.querySelector('[data-admin-page="inquiries"] b');
  if (inquiryNav) inquiryNav.textContent = String(adminOperations.inquiries.filter((item) => item.status !== '완료').length);
  const partnerNav = document.querySelector('[data-admin-page="partnerships"] b');
  if (partnerNav) partnerNav.textContent = String(adminOperations.partnerships.filter((item) => item.status !== '완료').length);
  const topicNav = document.querySelector('#navTopicSuggestionCount');
  if (topicNav) topicNav.textContent = String(adminOperations.topicSuggestions.filter((item) => item.status === '검토 대기').length);
  const talkNav = document.querySelector('#navOpenTalkCount');
  if (talkNav) talkNav.textContent = String(adminOperations.openTalkPosts.filter((item) => item.status === '공개').length);
  const content = document.querySelector('#adminPageContent');
  if (page === 'reviews') { renderReviewQueue(); return; }
  document.querySelector('#adminReviewWorkflow').classList.add('hidden');
  content.classList.remove('hidden');
  if (page === 'withdrawals') { renderWithdrawals(content); return; }
  const latestAudit = [...editorialState.history.map((entry) => ({ action: `안건 ${entry.status}`, target: entry.title, at: entry.at })), ...adminOperations.audit].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  const auditRows = (entries) => entries.length ? entries.map((entry) => `<div class="activity-row"><span class="activity-dot"></span><div><strong>${escapeAdminHtml(entry.action)} · ${escapeAdminHtml(entry.target)}</strong><small>${escapeAdminHtml(entry.operator || '운영 편집')} · ${new Date(entry.at).toLocaleString('ko-KR')}${entry.reason ? ` · ${escapeAdminHtml(entry.reason)}` : ''}</small></div></div>`).join('') : '<p class="table-empty">아직 운영 기록이 없습니다.</p>';
  const header = (eyebrow, title, description, action = '') => `<div class="admin-page-heading"><div><span class="section-kicker">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
  if (page === 'content-automation') {
    const issueId = history.state?.promoIssueId;
    const issue = issueId && getIssueData(issueId);
    if (!issue) { renderAdminPage('polls'); return; }
    content.innerHTML = `<button class="table-action" type="button" data-admin-page="polls">← 투표 관리</button>
      ${header('PROMOTION', escapeAdminHtml(issue.title), '이 안건의 채널별 초안, 예약과 발행 결과를 확인합니다.', `<button class="primary-button" type="button" data-poll-promo="${escapeAdminHtml(issueId)}">새 홍보 초안 만들기</button>`)}
      <section class="admin-card"><div id="contentAutomationRoot" data-issue-id="${escapeAdminHtml(issueId)}"><p>홍보 기록을 불러오는 중입니다.</p></div></section>`;
    window.SISEON_CONTENT_AUTOMATION?.loadContents();
    return;
  } else if (page === 'api-settings') {
    content.innerHTML = `${header('API & CHANNEL SETTINGS', 'API 설정', '사이트 기능과 마케팅 채널 연결을 분리해 관리합니다. 키와 토큰은 서버에 암호화해 보관합니다.')}<section class="admin-card"><div id="apiSettingsRoot"><p>연결 상태를 확인하고 있습니다.</p></div></section>`;
    window.SISEON_CONTENT_AUTOMATION?.renderApiSettings();
    return;
  } else if (page === 'overview') {
    const openReports = adminOperations.reports.filter((item) => item.status === '미검토').length;
    const unanswered = adminOperations.inquiries.filter((item) => item.status === '미답변').length;
    const openPartners = adminOperations.partnerships.filter((item) => item.status !== '완료').length;
    content.innerHTML = `${header('OPERATIONS OVERVIEW', '운영 대시보드', '오늘의 커뮤니티 현황과 우선 처리할 업무를 확인하세요.', '<span class="today-date">Supabase 운영 데이터</span>')}<div class="overview-metrics"><button class="overview-metric" data-admin-page="members"><span>총 회원수</span><strong>${memberTotalCount.toLocaleString('ko-KR')}<small>명</small></strong><em>인증 회원 프로필 집계</em><i>회원 관리 →</i></button><button class="overview-metric" data-admin-page="polls"><span>진행 중인 투표</span><strong>${activeIssueIds.length}<small>건</small></strong><em>30일 운영 · 승인 시 30개 유지</em><i>투표 관리 →</i></button><button class="overview-metric attention" data-admin-page="reviews"><span>검토할 AI 안건</span><strong>${editorialState.pending.length}<small>건</small></strong><em>관리자 승인 전에는 공개되지 않음</em><i>안건 검토 →</i></button><button class="overview-metric" data-admin-page="inquiries"><span>회원 문의 접수</span><strong>${adminOperations.inquiries.length}<small>건</small></strong><em>미답변 ${unanswered}건</em><i>문의 확인 →</i></button><button class="overview-metric" data-admin-page="partnerships"><span>제휴 문의 접수</span><strong>${adminOperations.partnerships.length}<small>건</small></strong><em>미완료 ${openPartners}건</em><i>제휴 검토 →</i></button><button class="overview-metric attention" data-admin-page="reports"><span>미검토 신고</span><strong>${openReports}<small>건</small></strong><em>모욕·혐오 표현 신고 포함</em><i>신고 처리 →</i></button></div><section class="admin-card" data-today-traffic style="margin-top:14px"><div class="admin-card-heading"><h2>오늘 방문자</h2><strong data-visit-total>—</strong></div><p class="admin-footnote">한국 시간 기준 · 브라우저별 하루 첫 유입</p><h3>유입 경로</h3><div class="activity-list" data-visit-paths aria-live="polite">방문 통계를 불러오는 중입니다.</div></section><div class="overview-columns"><section class="admin-card"><div class="admin-card-heading"><div><span class="section-kicker">NEEDS ATTENTION</span><h2>먼저 확인할 업무</h2></div></div><button class="priority-link" data-admin-page="reviews"><span class="priority-mark">✦</span><span><strong>AI 추천 안건 검토</strong><small>${editorialState.pending.length}건 · 출처와 양측 관점을 확인하고 승인</small></span><b>→</b></button><button class="priority-link" data-admin-page="reports"><span class="priority-mark danger">⚑</span><span><strong>회원 신고 검토</strong><small>${openReports}건 · 모욕·혐오·도배 신고 대기</small></span><b>→</b></button><button class="priority-link" data-admin-page="inquiries"><span class="priority-mark">✉</span><span><strong>미답변 문의</strong><small>${unanswered}건 · 접수 순으로 확인</small></span><b>→</b></button><button class="priority-link" data-admin-page="partnerships"><span class="priority-mark">◇</span><span><strong>제휴 문의 확인</strong><small>${openPartners}건 · 협력 제안 검토</small></span><b>→</b></button></section><section class="admin-card"><div class="admin-card-heading"><div><span class="section-kicker">RECENT ACTIVITY</span><h2>최근 운영 기록</h2></div><button data-admin-page="audit">전체 보기 →</button></div><div class="activity-list">${auditRows(latestAudit)}</div></section></div>`;
    void renderTodayTraffic(content.querySelector('[data-today-traffic]'));
  } else if (page === 'reviews') {
    document.querySelector('#adminPageContent').classList.add('hidden');
    renderReviewQueue();
    return;
  } else if (page === 'polls') {
    content.innerHTML = `${header('POLL MANAGEMENT', '투표 관리', `진행 중인 안건 ${activeIssueIds.length}건 · 안건별로 보관 또는 삭제를 선택할 수 있습니다.`)}<div class="table-toolbar"><span>진행 중 <b>${activeIssueIds.length}</b>건</span><input id="pollSearch" placeholder="투표 제목 검색" aria-label="투표 검색" /></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>주제</th><th>분야</th><th>상태</th><th>출처</th><th>관리</th></tr></thead><tbody>${activeIssueIds.map((id) => { const item = issues[id]; return `<tr><td><strong>${escapeAdminHtml(item.title)}</strong><small>${formatPollDeadline(item)} 마감 · 진행 중</small></td><td>${escapeAdminHtml(item.category)}</td><td><span class="admin-status status-good">진행 중</span></td><td>${escapeAdminHtml(item.source)}</td><td><div class="row-actions"><button data-poll-promo-manage="${escapeAdminHtml(id)}" class="table-action">홍보 관리</button><button data-poll-management="archive" data-id="${escapeAdminHtml(id)}" class="table-action">지난 투표로 이동</button><button data-poll-management="delete" data-id="${escapeAdminHtml(id)}" class="table-action danger-action" style="color:#a74d3a;border-color:#ead1ca">삭제</button></div><div class="poll-promo-status" data-promo-status="${escapeAdminHtml(id)}">홍보 상태 확인 중</div></td></tr>`; }).join('')}</tbody></table></div><p class="admin-footnote">‘지난 투표로 이동’은 공개 투표 목록에서 내리고 보관함에 남깁니다. ‘삭제’는 사용자 화면과 검색용 페이지에서 내립니다. 승인된 Supabase 안건은 서버에 저장되며, 서버 작업 시 운영 기록도 남습니다.</p>`;
    window.SISEON_CONTENT_AUTOMATION?.loadContents();
  } else if (page === 'archive') {
    content.innerHTML = `${header('PAST CONVERSATIONS', '지난 투표 보관함', '종료된 투표의 결과와 토론을 확인합니다. 보관 기간이 지난 투표는 읽기 전용으로 표시됩니다.')}<div class="archive-list admin-archive-list" id="adminArchiveList"></div>`;
    const adminList = document.querySelector('#adminArchiveList');
    const archiveRows = document.querySelector('#archivePageList');
    if (adminList && archiveRows) adminList.replaceChildren(...[...archiveRows.children].map((row) => row.cloneNode(true)));
    if (adminList && !adminList.children.length) adminList.innerHTML = '<div class="community-empty">보관된 투표가 없습니다.</div>';
  } else if (page === 'members') {
    content.innerHTML = `${header('COMMUNITY MEMBERS', '회원 관리', '회원별 신고 이력과 제재 상태를 살펴보고 필요한 조치를 기록합니다.')}<div class="member-summary"><span>회원 <b>${memberTotalCount.toLocaleString('ko-KR')}명</b></span><span>정상 <b>${adminOperations.members.filter((m) => m.status === '정상').length}명</b></span><span>주의·정지 <b>${adminOperations.members.filter((m) => m.status !== '정상').length}명</b></span></div><div class="table-toolbar"><input id="memberSearch" placeholder="닉네임 또는 회원 번호 검색" aria-label="회원 검색" /><select id="memberStatusFilter"><option>전체</option><option>정상</option><option>검토 중</option><option>주의</option><option>7일 정지</option></select></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>회원</th><th>가입일</th><th>상태</th><th>신고</th><th>권한</th><th>조치</th></tr></thead><tbody id="memberTableBody"></tbody></table></div><p class="admin-footnote">제재 조치에는 구체적인 운영 사유를 남기고, 회원에게 안내할 이의 제기 절차를 제공하세요.</p>`;
    renderMembersTable();
  } else if (page === 'reports') {
    content.innerHTML = `${header('SAFETY & MODERATION', '신고·게시글 관리', '신고 맥락을 확인하고 게시글과 회원에 각각 비례한 조치를 적용하세요.')}<div class="moderation-guidance"><strong>검토 기준</strong><span>비판 의견과 인격 모독을 구분하고, 표현의 맥락·반복성·피해 정도를 살핀 뒤 사유를 기록합니다.</span></div><div class="report-list">${adminOperations.reports.map((report) => `<article class="report-card"><div class="report-card-top"><span class="report-reason">${escapeAdminHtml(report.reason)}</span><span class="admin-status ${report.status === '미검토' ? 'status-warn' : 'status-good'}">${escapeAdminHtml(report.status)}</span></div>${report.postTitle ? `<p class="reported-object">신고 대상 글: ${escapeAdminHtml(report.postTitle)}</p>` : ''}<h2>${escapeAdminHtml(report.summary)}</h2><p>${escapeAdminHtml(report.area)} · 작성자 ${escapeAdminHtml(report.nickname)} · 신고 ${report.count}건 · 게시글 ${escapeAdminHtml(report.postStatus)}</p><details class="report-detail"><summary>신고 맥락과 검토 안내</summary><p>신고된 원문은 시연 화면에서 일부 가려져 있습니다. 앞뒤 대화, 반복 여부, 대상이 된 회원의 설명과 기존 운영 기록을 함께 확인한 뒤 조치하세요. 이 예시 데이터에는 실제 회원 게시물이 포함되어 있지 않습니다.</p></details><div class="report-actions"><button data-admin-action="dismiss-report" data-id="${report.id}">위반 아님</button>${report.postStatus !== '공개' ? `<button data-admin-action="restore-post" data-id="${report.id}">게시글 복구</button>` : `<button data-admin-action="hide-post" data-id="${report.id}">게시글 숨김</button><button data-admin-action="delete-post" data-id="${report.id}">삭제 처리</button>`}<button class="danger-action" data-admin-action="suspend-member" data-id="${escapeAdminHtml(report.memberId)}">회원 제재 검토</button></div></article>`).join('')}</div>`;
  } else if (page === 'inquiries' || page === 'partnerships') {
    const isInquiry = page === 'inquiries'; const items = isInquiry ? adminOperations.inquiries : adminOperations.partnerships;
    content.innerHTML = `${header(isInquiry ? 'SUPPORT INBOX' : 'PARTNERSHIPS', isInquiry ? '회원 문의' : '제휴 문의', isInquiry ? '접수 내용을 확인하고 답변 진행 상태를 관리하세요.' : '협력 목적과 기대 효과를 확인하고 내부 검토 상태를 기록하세요.')}<div class="table-toolbar"><span>전체 <b>${items.length}</b>건 접수</span><select id="inboxStatusFilter"><option>전체</option><option>미답변</option><option>답변 중</option><option>미확인</option><option>검토 중</option><option>완료</option></select></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>접수 내용</th><th>분류</th><th>보낸 사람</th><th>접수 시각</th><th>상태·처리</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${escapeAdminHtml(item.title)}</strong><small>접수번호 ${escapeAdminHtml(item.id)}</small><details class="inbox-message"><summary>접수 내용${item.reply ? ' · 답변/메모 확인' : ' 보기'}</summary><p>${escapeAdminHtml(item.message || '기존 시연 문의의 상세 본문입니다.')}</p>${item.reply ? `<p class="saved-reply"><b>운영 답변·메모</b>${escapeAdminHtml(item.reply)}</p>` : ''}</details></td><td>${escapeAdminHtml(item.type)}</td><td>${escapeAdminHtml(item.sender)}</td><td>${escapeAdminHtml(item.received)}</td><td><span class="admin-status status-warn">${escapeAdminHtml(item.status)}</span><div class="row-actions"><button data-admin-action="progress-${page}" data-id="${item.id}">검토 시작</button><button data-admin-action="${isInquiry ? 'reply-inquiries' : 'note-partnerships'}" data-id="${item.id}">${isInquiry ? '답변하기' : '내부 메모'}</button><button data-admin-action="complete-${page}" data-id="${item.id}">완료 처리</button></div></td></tr>`).join('')}</tbody></table></div>`;
  } else if (page === 'announcements') {
    const edit = adminOperations.announcements.find((item) => item.id === editingAnnouncementId);
    content.innerHTML = `${header('PUBLIC INFORMATION', '공지사항 관리', '게시할 공지를 작성하고 사용자 화면 노출과 상단 고정을 관리합니다.')}<div class="admin-announcement-layout"><form class="announcement-editor" id="announcementEditor"><h2>${edit ? '공지 수정' : '새 공지 작성'}</h2><label for="announcementTitle">제목</label><input id="announcementTitle" name="title" maxlength="100" required value="${escapeAdminHtml(edit?.title || '')}" placeholder="공지 제목"/><label for="announcementCategory">분류</label><select id="announcementCategory" name="category"><option ${edit?.category === '운영 원칙' ? 'selected' : ''}>운영 원칙</option><option ${edit?.category === '이용 안내' ? 'selected' : ''}>이용 안내</option><option ${edit?.category === '신고와 제재' ? 'selected' : ''}>신고와 제재</option><option ${edit?.category === '투표 안내' ? 'selected' : ''}>투표 안내</option><option ${edit?.category === '안전과 개인정보' ? 'selected' : ''}>안전과 개인정보</option><option ${edit?.category === '서비스 소식' ? 'selected' : ''}>서비스 소식</option></select><label for="announcementSummary">목록 요약</label><input id="announcementSummary" name="summary" maxlength="180" required value="${escapeAdminHtml(edit?.summary || '')}" placeholder="목록과 상단 공지에 보일 한 줄 요약"/><label for="announcementBody">본문</label><textarea id="announcementBody" name="body" required placeholder="공지 내용을 입력하세요">${escapeAdminHtml(edit?.body || '')}</textarea><label class="announcement-check"><input type="checkbox" name="pinned" ${edit?.pinned ? 'checked' : ''}/> 상단 공지로 고정</label><div class="announcement-editor-actions"><button class="primary-button" type="submit">${edit ? '수정 저장' : '저장하고 게시'}</button>${edit ? '<button type="button" data-announcement-action="cancel-edit">취소</button>' : ''}</div><p class="admin-footnote">게시된 공지는 사용자 화면 상단 한 줄 공지와 공지 목록에 바로 반영됩니다.</p></form><section class="announcement-admin-list"><h2>등록 공지 ${adminOperations.announcements.length}건</h2>${[...adminOperations.announcements].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map((item) => `<article class="announcement-admin-item"><strong>${escapeAdminHtml(item.title)}</strong><small>${escapeAdminHtml(item.category)} · ${item.published ? '게시 중' : '내림'}${item.pinned ? ' · 상단 고정' : ''}</small><div class="announcement-row-actions"><button data-announcement-action="edit" data-id="${escapeAdminHtml(item.id)}">수정</button><button data-announcement-action="toggle-publish" data-id="${escapeAdminHtml(item.id)}">${item.published ? '게시 내리기' : '게시하기'}</button><button data-announcement-action="toggle-pin" data-id="${escapeAdminHtml(item.id)}">${item.pinned ? '고정 해제' : '상단 고정'}</button></div></article>`).join('')}</section></div>`;
  } else if (page === 'topic-suggestions') {
    const pending = adminOperations.topicSuggestions.filter((item) => item.status === '검토 대기');
    content.innerHTML = `${header('COMMUNITY EDITORIAL', '이용자 주제 제안', `검토 대기 ${pending.length}건 · 관심 수는 편집 판단의 참고 자료입니다.`)}<div class="moderation-guidance"><strong>검토 기준</strong><span>최신성·사실 확인 가능성·찬반 관점의 균형·선거 관련 여부를 확인한 뒤 편집 검토로 보냅니다. 관심 수만으로 자동 채택하지 않습니다.</span></div><div class="topic-admin-list">${adminOperations.topicSuggestions.map((item) => `<article class="topic-admin-card"><div class="topic-admin-top"><span class="announcement-category">${escapeAdminHtml(item.category)}</span><span class="admin-status ${item.status === '검토 대기' ? 'status-warn' : item.status === '편집 검토 중' ? 'status-good' : ''}">${escapeAdminHtml(item.status)}</span></div><h2>${escapeAdminHtml(item.title)}</h2><p>${escapeAdminHtml(item.rationale)}</p><div class="suggestion-balance"><p><b>찬성 관점</b>${escapeAdminHtml(item.forText)}</p><p><b>반대 관점</b>${escapeAdminHtml(item.againstText)}</p></div><small>제안 ${escapeAdminHtml(item.sender || '익명')} · 관심 ${item.interestCount}명 · ${new Date(item.createdAt).toLocaleString('ko-KR')}${safeHttpsUrl(item.sourceUrl) ? ` · <a href="${escapeAdminHtml(safeHttpsUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">출처 확인 ↗</a>` : ' · 참고 출처 없음'}</small>${item.reviewNote ? `<p>검토 메모: ${escapeAdminHtml(item.reviewNote)}</p>` : ''}${item.status === '검토 대기' ? `<div class="row-actions"><button data-topic-action="send-to-editorial" data-id="${escapeAdminHtml(item.id)}">편집 검토로 보내기</button><button data-topic-action="reject" data-id="${escapeAdminHtml(item.id)}">반려</button></div>` : ''}</article>`).join('') || '<div class="community-empty">등록된 제안이 없습니다.</div>'}</div>`;
  } else if (page === 'discussion-management') {
    const submittedPosts = adminDiscussionPosts.map(item=>({...item,issueTitle:issues[item.issueId]?.title||'이슈 토론'}));
    content.innerHTML = `${header('DISCUSSION REVIEW', '이슈 토론 글', '이용자가 작성한 찬반 글·질문·자료·정정 요청을 확인하고 게시 상태를 관리합니다.')}<div class="moderation-guidance"><strong>검토 기준</strong><span>주장 비판은 허용하고 인격 공격·혐오·개인정보 노출은 제한합니다. 신고 여부와 별개로 조치 사유를 기록하고, 숨긴 글은 검토 후 복구할 수 있습니다.</span></div><div class="topic-admin-list">${submittedPosts.map((item) => { const hidden = adminOperations.hiddenDiscussionPosts.includes(item.id) || adminOperations.reports.some((report) => report.issueId === item.issueId && report.postId === item.id && report.postStatus !== '공개'); const kind = ({ opinion: '입장 글', question: '질문', source: '자료', correction: '정정 요청' })[item.kind || 'opinion']; return `<article class="topic-admin-card"><div class="topic-admin-top"><span class="announcement-category">${escapeAdminHtml(kind)}</span><span class="admin-status ${hidden ? 'status-warn' : 'status-good'}">${hidden ? '숨김' : '공개'}</span></div><small>${escapeAdminHtml(item.issueTitle)} · ${escapeAdminHtml(item.stance)} · ${escapeAdminHtml(item.author || '참여자')} · ${new Date(item.createdAt || Date.now()).toLocaleString('ko-KR')}</small><h2>${escapeAdminHtml(item.title)}</h2><p>${escapeAdminHtml(item.content)}</p>${safeHttpsUrl(item.sourceUrl) ? `<a class="candidate-source" href="${escapeAdminHtml(safeHttpsUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">참고 출처 ↗</a>` : ''}<div class="row-actions"><button data-discussion-action="${hidden ? 'restore' : 'hide'}" data-issue-id="${escapeAdminHtml(item.issueId)}" data-id="${escapeAdminHtml(item.id)}">${hidden ? '게시글 복구' : '게시글 숨김'}</button></div></article>`; }).join('') || '<div class="community-empty">아직 이용자가 작성한 이슈 토론 글이 없습니다.</div>'}</div>`;
  } else if (page === 'open-talk') {
    content.innerHTML = `${header('COMMUNITY MODERATION', '익명 자유토론 관리', '공개 상태와 신고 내역을 살펴보고 게시글 조치를 관리합니다. 익명 계정의 내부 연결값은 데모 환경에서만 사용됩니다.')}<div class="moderation-guidance"><strong>운영 기준</strong><span>이용자 투표로 제재하지 않습니다. 신고 맥락을 확인하고, 같은 기준으로 게시물 숨김·복구 여부를 결정합니다.</span></div><div class="topic-admin-list">${[...adminOperations.openTalkPosts].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map((item) => `<article class="topic-admin-card"><div class="topic-admin-top"><span class="announcement-category">${escapeAdminHtml(item.category)}</span><span class="admin-status ${item.status === '공개' ? 'status-good' : 'status-warn'}">${escapeAdminHtml(item.status)}</span></div><h2>${escapeAdminHtml(item.title)}</h2><p>${escapeAdminHtml(item.body)}</p><small>${escapeAdminHtml(item.author)} · ${new Date(item.createdAt).toLocaleString('ko-KR')} · 댓글 ${(item.comments || []).length}개 · 신고 ${adminOperations.reports.filter((report) => report.issueId === 'open-talk' && report.postId === item.id).length}건</small><details class="report-detail"><summary>댓글 확인</summary>${(item.comments || []).map((comment) => `<p><b>${escapeAdminHtml(comment.author)}</b> ${escapeAdminHtml(comment.text)}</p>`).join('') || '<p>등록된 댓글이 없습니다.</p>'}</details><div class="row-actions"><button data-open-talk-action="${item.status === '공개' ? 'hide' : 'restore'}" data-id="${escapeAdminHtml(item.id)}">${item.status === '공개' ? '게시글 숨김' : '게시글 복구'}</button><button data-admin-page="reports">신고함 보기</button></div></article>`).join('') || '<div class="community-empty">아직 자유토론 글이 없습니다.</div>'}</div>`;
  } else {
    const auditEntries = [...editorialState.history.map((entry) => ({ action: `안건 ${entry.status}`, target: entry.title, reason: entry.replacedTitle ? `교체되어 보관: ${entry.replacedTitle}` : '', operator: '운영 관리자', at: entry.at })), ...adminOperations.audit];
    content.innerHTML = `${header('AUDIT LOG', '운영 기록', '회원 제재, 게시글 조치, 안건 승인과 고객 문의 상태 변경 기록입니다.')}<div class="audit-filters"><span>최근 처리 내역 ${auditEntries.length}건</span><button id="exportAuditButton">기록 내려받기</button></div><div class="audit-list">${auditRows(auditEntries.length ? auditEntries : latestAudit)}</div>`;
  }
}

function saveCurrentDraft() {
  if (!editorialState.pending.length) return null;
  const draft = currentDraftFromForm();
  const selectedIndex = editorialState.pending.findIndex((item) => item.id === activeDraftId);
  editorialState.pending[selectedIndex < 0 ? 0 : selectedIndex] = draft;
  saveEditorialState();
  updateAdminPreview();
  return draft;
}

async function handleAdminAction(action, id) {
  if (action === 'warn-member' || action === 'suspend-member') {
    const member = adminOperations.members.find((item) => item.id === id);
    if (!member) return;
    const reason = window.prompt(`${member.nickname} 회원 ${action === 'warn-member' ? '경고' : '7일 이용 정지'} 사유를 입력해 주세요.`);
    if (!reason?.trim()) return;
    member.status = action === 'warn-member' ? '주의' : '7일 정지';
    await memberAuth.from('member_profiles').update({status:action==='warn-member'?'warned':'suspended'}).eq('user_id',member.id);
    logAdminAction(action === 'warn-member' ? '회원 경고' : '회원 7일 정지', member.nickname, reason.trim());
  } else if (action === 'restore-member') {
    const member = adminOperations.members.find((item) => item.id === id);
    if (!member || !window.confirm(`${member.nickname} 회원의 이용 정지를 해제할까요?`)) return;
    member.status = '정상';
    await memberAuth.from('member_profiles').update({status:'active'}).eq('user_id',member.id);
    logAdminAction('회원 정지 해제', member.nickname, '운영자 확인');
  } else if (['hide-post', 'delete-post', 'restore-post', 'dismiss-report'].includes(action)) {
    const report = adminOperations.reports.find((item) => item.id === id);
    if (!report) return;
    const actionLabel = action === 'hide-post' ? '게시글 숨김' : action === 'delete-post' ? '게시글 삭제(복구 가능)' : action === 'restore-post' ? '게시글 복구' : '위반 아님 처리';
    const reason = window.prompt(`${actionLabel} 사유를 입력해 주세요.`);
    if (!reason?.trim()) return;
    if (action === 'hide-post') { report.postStatus = '숨김'; report.status = '조치 완료'; }
    if (action === 'delete-post') { report.postStatus = '삭제됨'; report.status = '조치 완료'; }
    if (action === 'restore-post') { report.postStatus = '공개'; report.status = '재검토 완료'; }
    if (report.issueId === 'open-talk') {
      const openTalkPost = adminOperations.openTalkPosts.find((item) => item.id === report.postId);
      if (openTalkPost && action === 'hide-post') openTalkPost.status = '숨김';
      if (openTalkPost && action === 'delete-post') openTalkPost.status = '삭제됨';
      if (openTalkPost && action === 'restore-post') {
        openTalkPost.status = '공개';
        adminOperations.reports.filter((item) => item.issueId === 'open-talk' && item.postId === openTalkPost.id).forEach((item) => { item.postStatus = '공개'; item.status = '재검토 완료'; });
      }
    } else if (report.postId) {
      adminOperations.hiddenDiscussionPosts = adminOperations.hiddenDiscussionPosts.filter((postId) => postId !== report.postId);
      if (action === 'hide-post' || action === 'delete-post') adminOperations.hiddenDiscussionPosts.push(report.postId);
    }
    if (action === 'dismiss-report') report.status = '위반 아님';
    const dbStatus=action==='dismiss-report'?'dismissed':action==='restore-post'?'resolved':'resolved';
    if(action!=='dismiss-report'){
      const table=report.issueId==='open-talk'?'open_talk_posts':'issue_posts';
      const status=action==='hide-post'?'hidden':action==='delete-post'?'removed':'published';
      await memberAuth.from(table).update({status}).eq('id',report.postId);
    }
    await memberAuth.from('user_reports').update({status:dbStatus,reviewed_at:new Date().toISOString(),reviewed_by:memberSession.user.id}).eq('id',report.id);
    logAdminAction(actionLabel, `${report.nickname} · ${report.area}`, reason.trim());
  } else if (action.startsWith('progress-') || action.startsWith('complete-') || action.startsWith('reply-') || action.startsWith('note-')) {
    const collection = action.endsWith('inquiries') ? adminOperations.inquiries : adminOperations.partnerships;
    const item = collection.find((entry) => entry.id === id);
    if (!item) return;
    if (action === 'reply-inquiries') {
      if (!item.memberId) { window.alert('계정과 연결되지 않은 예전 문의는 마이페이지로 답변을 전달할 수 없습니다.'); return; }
      openInquiryReply(item);
      return;
    }
    if (action.startsWith('note-')) {
      const reply = window.prompt(action.startsWith('reply-') ? '답변 초안 내용을 입력해 주세요.' : '내부 검토 메모를 입력해 주세요.', item.reply || '');
      if (!reply?.trim()) return;
      item.reply = reply.trim();
      item.status = action.startsWith('reply-') ? '답변 중' : '검토 중';
      const table=action.endsWith('inquiries')?'user_inquiries':'partnership_inquiries';
      await memberAuth.from(table).update({status:action.startsWith('reply-')?'answered':'reviewing',admin_note:item.reply}).eq('id',item.id);
      logAdminAction(action.startsWith('reply-') ? '문의 답변 초안 저장' : '제휴 검토 메모 저장', item.title, `${item.sender} · ${item.id}`);
    } else {
      item.status = action.startsWith('complete-') ? '완료' : (action.endsWith('inquiries') ? '답변 중' : '검토 중');
      const table=action.endsWith('inquiries')?'user_inquiries':'partnership_inquiries';
      const status=action.startsWith('complete-')?'closed':action.endsWith('inquiries')?(item.answeredAt?'answered':'pending'):'reviewing';
      await memberAuth.from(table).update({status}).eq('id',item.id);
      logAdminAction(action.startsWith('complete-') ? '문의 완료 처리' : '문의 검토 시작', item.title, `${item.sender} · ${item.id}`);
    }
  }
  saveAdminOperations();
  renderAdminPage(currentAdminPage);
}

document.querySelector('.admin-sidebar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-admin-page]');
  if (button) { pushAppRoute('admin', { adminPage: button.dataset.adminPage }); renderAdminPage(button.dataset.adminPage); }
});
document.querySelector('#adminPageContent').addEventListener('click', async (event) => {
  const pollManagementButton = event.target.closest('[data-poll-management]');
  if (pollManagementButton) {
    managePollFromAdmin(pollManagementButton.dataset.id, pollManagementButton.dataset.pollManagement, pollManagementButton);
    return;
  }
  const promoManage = event.target.closest('[data-poll-promo-manage]');
  if (promoManage) {
    pushAppRoute('admin', { adminPage:'content-automation', promoIssueId:promoManage.dataset.pollPromoManage });
    renderAdminPage('content-automation');
    return;
  }
  const pollPromoButton = event.target.closest('[data-poll-promo]');
  if (pollPromoButton) {
    const issueId = pollPromoButton.dataset.pollPromo; const issue = issues[issueId];
    if (!issue) return;
    const automation = window.SISEON_CONTENT_AUTOMATION;
    if (!automation) { window.alert('콘텐츠 자동화 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); return; }
    pollPromoButton.disabled = true;
    automation.getIntegrations().then((rows) => {
      const statuses = new Map(rows.map((row) => [row.provider, row]));
      const providers = [
        ['instagram','인스타그램'], ['threads','Threads'], ['facebook','Facebook']
      ];
      const options = providers.map(([key,label]) => {
        const row = statuses.get(key); const active = row?.status === 'connected';
        return `<label class="promo-platform-choice ${active ? '' : 'inactive'}"><input type="checkbox" name="platform" value="${key}" ${active ? 'checked' : 'disabled'}><span class="connection-light ${active ? 'is-on' : 'is-off'}"></span>${label}<small>${active ? escapeAdminHtml(row.accountLabel || '연결됨') : 'API 설정에서 연결 필요'}</small></label>`;
      }).join('');
      const dialog = document.createElement('dialog'); dialog.className = 'promo-compose-dialog';
      dialog.innerHTML = `<form method="dialog" class="promo-dialog-close"><button aria-label="닫기">×</button></form><h2>투표 홍보 콘텐츠 만들기</h2><p>${escapeAdminHtml(issue.title)}</p><span class="section-kicker">게시할 채널</span><form id="pollPromoForm"><div class="promo-platform-list">${options}<label class="promo-platform-choice"><input type="checkbox" name="platform" value="naver_blog"><span class="connection-light is-manual"></span>네이버 블로그<small>초안 복사 후 수동 게시</small></label></div><p class="admin-footnote">선택한 채널별 초안을 생성해 검토 대기 상태로 저장합니다. 이미지가 필요한 채널은 초안의 이미지 안내를 확인하고, 최종 승인 후 게시하세요.</p><div class="promo-dialog-actions"><button type="button" class="table-action" data-promo-cancel>취소</button><button class="primary-button" type="submit">초안 생성 및 검토</button></div></form>`;
      document.body.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
      dialog.querySelector('[data-promo-cancel]')?.addEventListener('click', () => dialog.close());
      dialog.querySelector('#pollPromoForm')?.addEventListener('submit', async (submitEvent) => {
        submitEvent.preventDefault();
        const selected = [...new FormData(submitEvent.currentTarget).getAll('platform')];
        if (!selected.length) { window.alert('게시할 채널을 하나 이상 선택해 주세요.'); return; }
        const submit = submitEvent.submitter; submit.disabled = true; submit.textContent = '초안을 만들고 있습니다…';
        const facts = (issue.facts || []).map((fact) => `• ${fact}`).join('\n');
        const forView = (issue.forArguments || []).map(([heading,body]) => `${heading}: ${body}`).join('\n');
        const againstView = (issue.againstArguments || []).map(([heading,body]) => `${heading}: ${body}`).join('\n');
        try {
          const result = await automation.generateForPoll({ issueId, title: issue.title, summary: `${issue.intro}\n\n확인된 사실\n${facts}`, forView, againstView, sources: issue.sourceUrl ? [issue.sourceUrl] : [] }, selected, () => { submit.textContent = '홍보 이미지를 만들고 있습니다…'; });
          if (result.imageErrors?.length) window.alert('글 초안은 저장했습니다. 이미지는 홍보 관리에서 다시 생성할 수 있습니다.\n' + result.imageErrors.join('\n'));
          dialog.close();
          if (history.state?.promoIssueId !== issueId) pushAppRoute('admin', {adminPage:'content-automation', promoIssueId:issueId});
          renderAdminPage('content-automation');
        } catch (error) { window.alert(error.message || '콘텐츠 초안을 만들지 못했습니다.'); submit.disabled = false; submit.textContent = '초안 생성 및 검토'; }
      });
    }).catch((error) => window.alert(`연결 상태를 확인하지 못했습니다: ${error.message}`)).finally(() => { pollPromoButton.disabled = false; });
    return;
  }
  const discussionAction = event.target.closest('[data-discussion-action]');
  if (discussionAction) {
    const hidden = discussionAction.dataset.discussionAction === 'hide';
    const reason = window.prompt(hidden ? '토론 글을 숨길 사유를 기록해 주세요.' : '토론 글 복구 사유를 기록해 주세요.');
    if (!reason?.trim()) return;
    const postId = discussionAction.dataset.id;
    const post = adminDiscussionPosts.find((item) => item.id === postId);
    if (!post) return;
    adminOperations.hiddenDiscussionPosts = adminOperations.hiddenDiscussionPosts.filter((id) => id !== postId);
    if (hidden) adminOperations.hiddenDiscussionPosts.push(postId);
    if (!hidden) adminOperations.reports.filter((report) => report.issueId === discussionAction.dataset.issueId && report.postId === postId && report.postStatus !== '공개').forEach((report) => { report.postStatus = '공개'; report.status = '재검토 완료'; });
    const update=await memberAuth.from('issue_posts').update({status:hidden?'hidden':'published'}).eq('id',postId);
    if(update.error){showUserActionToast(`게시물 상태를 저장하지 못했습니다: ${update.error.message}`);return;}
    post.status=hidden?'숨김':'공개';
    logAdminAction(hidden ? '이슈 토론 글 숨김' : '이슈 토론 글 복구', post.title, reason.trim());
    saveAdminOperations(); renderAdminPage('discussion-management'); return;
  }
  const topicAction = event.target.closest('[data-topic-action]');
  if (topicAction) {
    const suggestion = adminOperations.topicSuggestions.find((item) => item.id === topicAction.dataset.id);
    if (!suggestion || suggestion.status !== '검토 대기') return;
    if (topicAction.dataset.topicAction === 'send-to-editorial') {
      const draft = { id: `community-${suggestion.id}`, category: suggestion.category, title: suggestion.title, intro: suggestion.rationale, facts: ['이용자 제안 내용입니다. 공개 전 공식 자료와 최신 현황을 확인해 주세요.', '찬반 관점과 출처의 신뢰성을 편집자가 별도로 검토해야 합니다.'], source: suggestion.sourceUrl ? '제안자가 제출한 출처 · 편집자 확인 필요' : '출처 추가 필요', sourceUrl: suggestion.sourceUrl || '', forText: suggestion.forText, againstText: suggestion.againstText };
      if (!editorialState.pending.some((item) => item.id === draft.id)) editorialState.pending.unshift(draft);
      suggestion.status = '편집 검토 중'; activeDraftId = draft.id; saveEditorialState();
      await memberAuth.from('topic_suggestions').update({status:'approved'}).eq('id',suggestion.id);
      logAdminAction('이용자 제안을 편집 검토로 전달', suggestion.title, `관심 ${suggestion.interestCount}명 · 수동 사실 확인 필요`);
      saveAdminOperations(); renderHomeCommunityBoard(); renderAdminPage('reviews'); return;
    }
    const reason = window.prompt('제안 반려 사유를 기록해 주세요.');
    if (!reason?.trim()) return;
    suggestion.status = '반려'; suggestion.reviewNote = reason.trim();
    await memberAuth.from('topic_suggestions').update({status:'rejected'}).eq('id',suggestion.id);
    logAdminAction('이용자 주제 제안 반려', suggestion.title, reason.trim()); saveAdminOperations(); renderHomeCommunityBoard(); renderAdminPage('topic-suggestions'); return;
  }
  const talkAction = event.target.closest('[data-open-talk-action]');
  if (talkAction) {
    const post = adminOperations.openTalkPosts.find((item) => item.id === talkAction.dataset.id);
    if (!post) return;
    const hidden = talkAction.dataset.openTalkAction === 'hide';
    const reason = window.prompt(hidden ? '익명 게시글을 숨길 사유를 기록해 주세요.' : '게시글 복구 사유를 기록해 주세요.');
    if (!reason?.trim()) return;
    post.status = hidden ? '숨김' : '공개';
    const {error}=await memberAuth.from('open_talk_posts').update({status:hidden?'hidden':'published'}).eq('id',post.id);
    if(error){showUserActionToast(`게시글 상태를 저장하지 못했습니다: ${error.message}`);return;}
    if (!hidden) adminOperations.reports.filter((report) => report.issueId === 'open-talk' && report.postId === post.id && report.postStatus !== '공개').forEach((report) => { report.postStatus = '공개'; report.status = '재검토 완료'; });
    logAdminAction(hidden ? '익명 자유토론 게시글 숨김' : '익명 자유토론 게시글 복구', post.title, reason.trim());
    saveAdminOperations(); renderAdminPage('open-talk'); renderOpenTalkList(); renderHomeCommunityBoard(); return;
  }
  const announcementAction = event.target.closest('[data-announcement-action]');
  if (announcementAction) {
    const item = adminOperations.announcements.find((entry) => entry.id === announcementAction.dataset.id);
    if (announcementAction.dataset.announcementAction === 'cancel-edit') editingAnnouncementId = null;
    else if (item && announcementAction.dataset.announcementAction === 'edit') editingAnnouncementId = item.id;
    else if (item && announcementAction.dataset.announcementAction === 'toggle-publish') { item.published = !item.published; await memberAuth.from('announcements').update({published:item.published}).eq('id',item.id); logAdminAction(item.published ? '공지 게시' : '공지 게시 내림', item.title); }
    else if (item && announcementAction.dataset.announcementAction === 'toggle-pin') { item.pinned = !item.pinned; await memberAuth.from('announcements').update({pinned:item.pinned}).eq('id',item.id); logAdminAction(item.pinned ? '공지 상단 고정' : '공지 고정 해제', item.title); }
    saveAdminOperations(); renderAnnouncementTicker(); renderAdminPage('announcements'); return;
  }
  const pageButton = event.target.closest('[data-admin-page]');
  if (pageButton) { pushAppRoute('admin', { adminPage: pageButton.dataset.adminPage }); renderAdminPage(pageButton.dataset.adminPage); return; }
  const draftButton = event.target.closest('[data-review-draft]');
  if (draftButton) { activeDraftId = draftButton.dataset.reviewDraft; renderAdminPage('reviews'); return; }
  const actionButton = event.target.closest('[data-admin-action]');
  if (actionButton) { handleAdminAction(actionButton.dataset.adminAction, actionButton.dataset.id); return; }
  const issueButton = event.target.closest('[data-open-issue]');
  if (issueButton) { openIssue(issueButton.dataset.openIssue); return; }
  if (event.target.closest('#exportAuditButton')) {
    const rows = [...editorialState.history.map((entry) => ({ action: `안건 ${entry.status}`, target: entry.title, operator: '운영 관리자', reason: entry.replacedTitle || '', at: entry.at })), ...adminOperations.audit];
    const csv = ['처리,대상,운영자,사유,시각', ...rows.map((row) => [row.action, row.target, row.operator, row.reason, row.at].map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); link.download = 'siseon-admin-audit.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
});

document.querySelector('#adminPageContent').addEventListener('submit', async (event) => {
  if (event.target.id !== 'announcementEditor') return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = adminOperations.announcements.find((item) => item.id === editingAnnouncementId);
  const payload={category:values.category,title:values.title.trim(),summary:values.summary.trim(),body:values.body.trim(),published:existing?.published??true,pinned:values.pinned==='on',created_by:memberSession?.user?.id||null};
  let result;
  if(existing) result=await memberAuth.from('announcements').update(payload).eq('id',existing.id).select('id,created_at').single();
  else result=await memberAuth.from('announcements').insert(payload).select('id,created_at').single();
  if(result.error){showUserActionToast(`공지를 저장하지 못했습니다: ${result.error.message}`);return;}
  const item={id:result.data.id,...payload,createdAt:result.data.created_at};
  if (existing) Object.assign(existing,item); else adminOperations.announcements.unshift(item);
  logAdminAction(existing ? '공지 수정' : '공지 작성·게시', item.title);
  editingAnnouncementId = null; saveAdminOperations(); renderAnnouncementTicker(); renderAdminPage('announcements');
});
document.querySelector('#reviewQueueList').addEventListener('click', (event) => {
  const draftButton = event.target.closest('[data-review-draft]');
  if (!draftButton) return;
  activeDraftId = draftButton.dataset.reviewDraft;
  renderAdminPage('reviews');
});
document.querySelector('#reviewCategoryFilter').addEventListener('change', (event) => {
  activeReviewCategory = event.target.value || '전체 분야';
  const matchingDraft = editorialState.pending.find((draft) => activeReviewCategory === '전체 분야' || draft.category === activeReviewCategory);
  activeDraftId = matchingDraft?.id || null;
  renderAdminPage('reviews');
});
document.querySelector('#adminPageContent').addEventListener('input', (event) => {
  if (event.target.id === 'memberSearch') renderMembersTable();
});
document.querySelector('#adminPageContent').addEventListener('change', async (event) => {
  if (event.target.id === 'memberStatusFilter') renderMembersTable();
  if (event.target.matches('[data-member-role]')) {
    const member = adminOperations.members.find((item) => item.id === event.target.dataset.memberRole);
    if (!member) return;
    const previousRole = member.role || '일반 회원';
    member.role = event.target.value;
    const {error}=await memberAuth.from('member_profiles').update({trust_level:member.role==='신뢰 회원'?'trusted':'member'}).eq('user_id',member.id);
    if(error){member.role=previousRole;showUserActionToast(`회원 권한을 저장하지 못했습니다: ${error.message}`);renderAdminPage('members');return;}
    logAdminAction('회원 권한 변경', member.nickname, `${previousRole} → ${member.role}`);
    renderAdminPage('members');
  }
  if (event.target.id === 'inboxStatusFilter') {
    const rows = [...document.querySelectorAll('.admin-table tbody tr')];
    rows.forEach((row) => { const badge = row.querySelector('.admin-status'); row.hidden = event.target.value !== '전체' && badge?.textContent !== event.target.value; });
  }
});

adminEntryButton.addEventListener('click', showAdminView);
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-open-admin-login]')) {
    event.preventDefault();
    closeSiteMap();
    const dialog = document.querySelector('#adminLoginDialog');
    if (dialog && !dialog.open) dialog.showModal();
  }
  if (event.target.closest('[data-close-admin-login]')) document.querySelector('#adminLoginDialog')?.close();
});
window.addEventListener('siseon-admin-authenticated', () => {
  const wasVerified = isVerifiedAdmin;
  isVerifiedAdmin = true;
  adminEntryButton.classList.remove('hidden');
  const dialog = document.querySelector('#adminLoginDialog');
  const isLoggingIn = Boolean(dialog?.open);
  if (isLoggingIn) dialog.close();
  if (!wasVerified || isLoggingIn) showAdminView();
});
window.addEventListener('siseon-admin-signed-out', () => {
  isVerifiedAdmin = false;
  adminEntryButton.classList.add('hidden');
  adminView.classList.add('hidden');
  restoreHomeView();
});
document.querySelector('#adminBackButton').addEventListener('click', () => {
  goBackWithinApp();
});
editorialForm.addEventListener('input', updateAdminPreview);
document.querySelector('#saveDraftButton').addEventListener('click', async () => {
  const draft = saveCurrentDraft();
  if (!draft) return;
  if (!window.SISEON_TOPIC_ADMIN) { document.querySelector('#draftStatus').textContent = 'Supabase 안건 검토 연결을 확인해 주세요.'; return; }
  const saveButton = document.querySelector('#saveDraftButton');
  saveButton.disabled = true;
  document.querySelector('#draftStatus').textContent = '수정 내용을 Supabase에 저장하고 있습니다…';
  try {
    await window.SISEON_TOPIC_ADMIN.save(draft);
    document.querySelector('#draftStatus').textContent = '수정 내용이 Supabase에 저장됐습니다.';
  } catch (error) {
    document.querySelector('#draftStatus').textContent = `저장 실패: ${error.message}`;
    window.alert(`안건 수정 내용을 저장하지 못했습니다.\n\n${error.message}`);
  } finally { saveButton.disabled = false; }
});
document.querySelector('#rejectDraftButton').addEventListener('click', async () => {
  const draft = saveCurrentDraft();
  if (!draft) return;
  if (!window.SISEON_TOPIC_ADMIN) { document.querySelector('#draftStatus').textContent = 'Supabase 안건 검토 연결을 확인해 주세요.'; return; }
  try {
    await window.SISEON_TOPIC_ADMIN.save(draft);
    await window.SISEON_TOPIC_ADMIN.review(draft.id, 'reject', '운영자 반려');
  } catch (error) { document.querySelector('#draftStatus').textContent = `반려 처리 실패: ${error.message}`; return; }
  editorialState.pending = editorialState.pending.filter((item) => item.id !== draft.id);
  editorialState.history.push({ status: '반려', draftId: draft.id, title: draft.title, category: draft.category, at: new Date().toISOString() });
  activeDraftId = editorialState.pending[0]?.id || null;
  saveEditorialState();
  renderAdminDashboard();
});
document.querySelector('#approveDraftButton').addEventListener('click', async (event) => {
  event.preventDefault();
  document.querySelector('#draftStatus').textContent = '승인할 내용을 확인하고 있습니다…';
  const draft = currentDraftFromForm();
  const requiredFields = [
    ['카테고리', draft.category], ['투표 제목', draft.title], ['주제 설명', draft.intro],
    ['출처 이름과 날짜', draft.source], ['찬성 관점', draft.forText], ['반대 관점', draft.againstText]
  ];
  const missing = requiredFields.find(([, value]) => !String(value || '').trim());
  const sourceUrl = safeHttpsUrl(draft.sourceUrl) || (draft.dataSignals?.generationMode === 'fun' && !String(draft.sourceUrl || '').trim());
  const factsValid = draft.facts.length >= 2 && draft.facts.length <= 3;
  if (missing || !sourceUrl || !factsValid) {
    const reason = missing ? `${missing[0]}을 입력해 주세요.` : !factsValid ? '사실 또는 가정 조건을 2~3개 입력해 주세요.' : '출처 링크는 https:// 주소여야 합니다.';
    document.querySelector('#draftStatus').textContent = `승인 전 확인: ${reason}`;
    window.alert(`안건을 승인하기 전에 확인해 주세요.\n\n${reason}`);
    const focusName = missing ? ({ '카테고리': 'category', '투표 제목': 'title', '주제 설명': 'intro', '출처 이름과 날짜': 'source', '찬성 관점': 'forText', '반대 관점': 'againstText' })[missing[0]] : (!factsValid ? 'facts' : 'sourceUrl');
    editorialForm.elements.namedItem(focusName)?.focus();
    return;
  }
  const batchAlternatives = draft.batchId ? editorialState.pending.filter((item) => item.batchId === draft.batchId && item.id !== draft.id) : [];
  const siblingNote = batchAlternatives.length ? ` 같은 배포의 나머지 후보 ${batchAlternatives.length}개는 미선택 처리됩니다.` : '';
  if (!window.confirm(`이 안건을 승인해 Supabase 안건 기록에 등록할까요? 승인이 끝나면 승인 상태로 공개 안건 목록에 등록됩니다. 같은 묶음의 나머지 후보는 미선택 처리됩니다.${siblingNote}`)) {
    document.querySelector('#draftStatus').textContent = '승인이 취소됐습니다.';
    return;
  }
  if (!window.SISEON_TOPIC_ADMIN) { document.querySelector('#draftStatus').textContent = 'Supabase 안건 검토 연결을 확인해 주세요.'; return; }
  const approveButton = document.querySelector('#approveDraftButton');
  approveButton.disabled = true;
  document.querySelector('#draftStatus').textContent = 'Supabase에 저장하고 승인하는 중입니다…';
  let scheduledFor = null;
  try {
    await window.SISEON_TOPIC_ADMIN.save(draft);
    const reviewResult = await window.SISEON_TOPIC_ADMIN.review(draft.id, 'approve', '운영자 승인');
    scheduledFor = reviewResult.scheduledFor;
  } catch (error) {
    document.querySelector('#draftStatus').textContent = `승인 실패: ${error.message}`;
    window.alert(`안건 승인이 완료되지 않았습니다.\n\n${error.message}`);
    approveButton.disabled = false;
    return;
  }
  editorialState.history.push({ status: '승인 · 공개 예약', draftId: draft.id, title: draft.title, category: draft.category, at: new Date().toISOString(), scheduledFor });
  editorialState.pending = editorialState.pending.filter((item) => item.id !== draft.id && (!draft.batchId || item.batchId !== draft.batchId));
  batchAlternatives.forEach((alternative) => editorialState.history.push({ status: '미선택', draftId: alternative.id, title: alternative.title, category: alternative.category, at: new Date().toISOString(), selectedTitle: draft.title }));
  activeDraftId = editorialState.pending[0]?.id || null;
  saveEditorialState();
  document.querySelector('#draftStatus').textContent = scheduledFor
    ? `승인 완료 · ${new Date(scheduledFor).toLocaleString('ko-KR')}에 공개됩니다.`
    : '승인 완료 · 공개 예약 시각을 표시하지 못했습니다. Supabase 예약 상태를 확인해 주세요.';
  document.querySelector('#draftStatus').classList.remove('hidden');
  if (scheduledFor) window.alert(`안건 승인과 공개 예약이 완료됐습니다.\n\n공개 예정: ${new Date(scheduledFor).toLocaleString('ko-KR')}`);
  renderEditorialArchives();
  renderAdminDashboard();
});
document.querySelector('#publishDraftNowButton').addEventListener('click', async () => {
  const draft = currentDraftFromForm();
  const requiredFields = [
    ['카테고리', draft.category], ['투표 제목', draft.title], ['주제 설명', draft.intro],
    ['출처 이름과 날짜', draft.source], ['찬성 관점', draft.forText], ['반대 관점', draft.againstText]
  ];
  const missing = requiredFields.find(([, value]) => !String(value || '').trim());
  const sourceUrl = safeHttpsUrl(draft.sourceUrl) || (draft.dataSignals?.generationMode === 'fun' && !String(draft.sourceUrl || '').trim());
  const factsValid = draft.facts.length >= 2 && draft.facts.length <= 3;
  if (missing || !sourceUrl || !factsValid) {
    const reason = missing ? `${missing[0]}을 입력해 주세요.` : !factsValid ? '확인된 사실을 2~3개 입력해 주세요.' : '출처 링크는 https:// 주소여야 합니다.';
    document.querySelector('#draftStatus').textContent = `즉시 등록 전 확인: ${reason}`;
    window.alert(`안건을 즉시 등록하기 전에 확인해 주세요.\n\n${reason}`);
    const focusName = missing ? ({ '카테고리': 'category', '투표 제목': 'title', '주제 설명': 'intro', '출처 이름과 날짜': 'source', '찬성 관점': 'forText', '반대 관점': 'againstText' })[missing[0]] : (!factsValid ? 'facts' : 'sourceUrl');
    editorialForm.elements.namedItem(focusName)?.focus();
    return;
  }
  if (!window.SISEON_TOPIC_ADMIN?.publishNow) {
    document.querySelector('#draftStatus').textContent = '즉시 등록 기능을 사용하려면 GitHub와 content-admin 함수를 최신 버전으로 배포해 주세요.';
    return;
  }
  if (!window.confirm(`“${draft.title}” 안건을 지금 공개할까요?\n\n이 후보만 즉시 등록되며, 같은 생성 묶음의 다른 후보는 삭제하거나 미선택 처리하지 않고 검토 대기 상태로 남습니다. 즉시 공개 후 30일이 지나면 보관함으로 이동합니다.`)) {
    document.querySelector('#draftStatus').textContent = '즉시 등록이 취소됐습니다.';
    return;
  }
  const button = document.querySelector('#publishDraftNowButton');
  button.disabled = true;
  document.querySelector('#draftStatus').textContent = '안건을 즉시 공개하는 중입니다…';
  try {
    await window.SISEON_TOPIC_ADMIN.save(draft);
    await window.SISEON_TOPIC_ADMIN.publishNow(draft.id);
    editorialState.history.push({ status: '즉시 등록', draftId: draft.id, title: draft.title, category: draft.category, at: new Date().toISOString() });
    saveEditorialState();
    publishedTopicsPromise = null;
    const topics = await loadPublishedTopics();
    topics.forEach((issue) => { issues[issue.id] = issue; });
    activeIssueIds = topics.filter((issue) => issue.status === 'approved').map((issue) => issue.id).slice(0, 30);
    renderPollCards(); renderPollBoard(); renderEditorialArchives(); syncPollCarousel();
    document.querySelector('#draftStatus').textContent = `즉시 등록 완료 · “${draft.title}”이 지금 공개되었습니다. 같은 묶음의 다른 후보는 검토 대기에 남아 있습니다.`;
    document.querySelector('#draftStatus').classList.remove('hidden');
    window.alert(`안건이 즉시 등록되었습니다.\n\n${draft.title}\n\n같은 묶음의 다른 후보는 삭제되지 않았으며, 검토 대기 상태로 남아 있습니다.`);
    renderAdminDashboard();
  } catch (error) {
    document.querySelector('#draftStatus').textContent = `즉시 등록 실패: ${error.message}`;
    window.alert(`안건을 즉시 등록하지 못했습니다.\n\n${error.message}`);
  } finally { button.disabled = false; }
});
document.querySelector('#backButton').addEventListener('click', () => {
  goBackWithinApp();
});
loginButton.addEventListener('click', () => showMemberPage());
document.querySelector('#menuButton').addEventListener('click', () => {
  const panel = document.querySelector('#siteMapPanel');
  const button = document.querySelector('#menuButton');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', String(opening));
  button.setAttribute('aria-label', opening ? '사이트맵 닫기' : '사이트맵 열기');
});
document.querySelector('#siteMapClose').addEventListener('click', closeSiteMap);
document.addEventListener('click', (event) => {
  if (!event.target.closest('#siteMapPanel') && !event.target.closest('#menuButton')) closeSiteMap();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSiteMap(); });
document.querySelector('.issue-nav .icon-button').addEventListener('click', openLogin);
document.querySelector('.dialog-close').addEventListener('click', () => { pendingVote = null; pendingMemberAction = null; loginDialog.close(); });
loginDialog.addEventListener('click', (event) => {
  if (event.target === loginDialog) { pendingVote = null; pendingMemberAction = null; loginDialog.close(); }
});
loginDialog.addEventListener('cancel', () => { pendingVote = null; pendingMemberAction = null; });
document.querySelector('#kakaoLoginButton').addEventListener('click', async (event) => {
  if (!memberAuth) {
    document.querySelector('#authDialogMessage').textContent = 'Supabase 설정을 확인할 수 없습니다. 페이지를 새로고침하거나 관리자에게 문의해 주세요.';
    return;
  }
  const button = event.currentTarget;
  const message = document.querySelector('#authDialogMessage');
  button.disabled = true;
  button.textContent = '카카오로 이동 중…';
  message.textContent = '카카오 인증 화면으로 이동합니다.';
  if (pendingVote) sessionStorage.setItem('siseon:pending-auth-vote', pendingVote);
  sessionStorage.setItem('siseon:auth-return-path', stableMemberReturnUrl(window.location.href).href);
  const { error } = await memberAuth.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: memberAppRootUrl }
  });
  if (error) {
    button.disabled = false;
    button.textContent = '카카오로 계속하기';
    message.textContent = `로그인을 시작하지 못했습니다: ${error.message}`;
    sessionStorage.removeItem('siseon:pending-auth-vote');
    sessionStorage.removeItem('siseon:auth-return-path');
  }
});
document.querySelector('#nicknameDialogClose').addEventListener('click', () => nicknameDialog.close());
document.querySelector('#nicknameForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#memberNickname');
  const message = document.querySelector('#nicknameMessage');
  const button = event.currentTarget.querySelector('[type="submit"]');
  const nickname = input.value.normalize('NFC').trim();
  if ([...nickname].length < 2 || [...nickname].length > 16 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    message.textContent = '닉네임은 공백을 제외하고 2~16자로 입력해 주세요.';
    return;
  }
  if (!memberAuth || !memberSession?.user) {
    message.textContent = '로그인 상태를 확인할 수 없습니다. 카카오 로그인을 다시 해주세요.';
    return;
  }
  button.disabled = true;
  message.textContent = '저장하고 있습니다.';
  const { data, error } = await memberAuth.auth.updateUser({ data: { nickname } });
  button.disabled = false;
  if (error) {
    message.textContent = `닉네임을 저장하지 못했습니다: ${error.message}`;
    return;
  }
  const profileResult=await memberAuth.from('member_profiles').upsert({user_id:data.user.id,nickname},{onConflict:'user_id'});
  if(profileResult.error){message.textContent=`닉네임 프로필 저장 실패: ${profileResult.error.message}`;return;}
  memberSession = { ...memberSession, user: data.user };
  syncMemberAuth(memberSession);
  nicknameDialog.close();
  refreshMemberControls();
  renderCommunityAccess();
  if (activeIssueId) renderVoteState();
  if (isMemberSignedIn() && activeIssueId) resumePendingAuthVote();
  const resumeAction = pendingMemberAction;
  pendingMemberAction = null;
  if (resumeAction) resumeAction();
});
document.querySelector('#postDialogClose').addEventListener('click', () => postDialog.close());
document.querySelector('#postCancel').addEventListener('click', () => postDialog.close());

issueView.addEventListener('click', (event) => {
  const filterButton = event.target.closest('[data-discussion-filter]');
  if (filterButton) { applyDiscussionFilter(filterButton.dataset.discussionFilter); return; }
  const reportButton = event.target.closest('[data-report-post]');
  if (reportButton) {
    if (!isMemberSignedIn()) return openLogin();
    const article = reportButton.closest('.discussion-post');
    pendingReportContext = { issueId: activeIssueId, postId: article.dataset.postId, postTitle: article.dataset.postTitle, author: article.dataset.postAuthor };
    document.querySelector('#reportTargetTitle').textContent = `“${pendingReportContext.postTitle}” · ${pendingReportContext.author}`;
    document.querySelector('#userReportForm').reset();
    document.querySelector('#userReportDialog').showModal();
    return;
  }
  const titleToggle = event.target.closest('.post-title-toggle');
  if (titleToggle) {
    const expanded = titleToggle.closest('.discussion-post').querySelector('.post-expanded');
    const isExpanded = titleToggle.getAttribute('aria-expanded') === 'true';
    titleToggle.setAttribute('aria-expanded', String(!isExpanded));
    expanded.classList.toggle('hidden', isExpanded);
    titleToggle.querySelector('.post-toggle-icon').textContent = isExpanded ? '⌄' : '⌃';
    return;
  }
  const voteButton = event.target.closest('[data-vote]');
  if (voteButton) {
    const priorVote = memberVoteChoices.get(activeIssueId);
    if (priorVote) return;
    pendingVote = voteButton.dataset.vote;
    if (isMemberSignedIn()) castDemoVote(pendingVote);
    else openLogin();
    return;
  }
  if (event.target.closest('#writeButton')) {
    if (!isMemberSignedIn()) return openLogin();
    const choice = memberVoteChoices.get(activeIssueId) || (activeIssueIsArchived ? '판단 보류' : null);
    if (!choice) return;
    const stance = stanceInfo(choice);
    const preview = document.querySelector('#postStancePreview');
    preview.replaceChildren(createOpinionTag(stance));
    postDialog.showModal();
    document.querySelector('#postTitle').focus();
  }
});

issueView.addEventListener('submit', async (event) => {
  const form = event.target.closest('.comment-form');
  if (!form) return;
  event.preventDefault();
  const textarea = form.querySelector('textarea');
  const text = textarea.value.trim();
  if (!text || !activeIssueId || (!activeIssueIsArchived && !memberVoteChoices.get(activeIssueId)) || activeIssueIsReadOnly) return;
  const article = form.closest('.discussion-post');
  const commentList = article.querySelector('.comment-list');
  const comment = { author: getMemberNickname(), text };
  const { data, error } = await memberAuth.from('issue_comments').insert({ post_id: article.dataset.postId, author_id: memberSession.user.id, author_nickname: getMemberNickname(), body: text }).select('id,created_at').single();
  if (error) { showUserActionToast(`댓글을 저장하지 못했습니다: ${error.message}`); return; }
  comment.id = data.id; comment.createdAt = data.created_at;
  const cached = issueCommentsCache.get(activeIssueId) || {};
  (cached[article.dataset.postId] ||= []).push(comment); issueCommentsCache.set(activeIssueId,cached);
  appendCommentElement(commentList, comment);
  const meta = article.querySelector('.discussion-post-meta');
  const commentCount = Number(meta.dataset.commentCount || '0') + 1;
  meta.dataset.commentCount = String(commentCount);
  meta.textContent = `${meta.textContent.split(' · 댓글 ')[0]} · 댓글 ${commentCount}`;
  form.reset();
});

function createOpinionTag(stance) {
  const tag = document.createElement('span');
  tag.className = `tag ${stance.className}`;
  const icon = document.createElement('i');
  icon.className = 'opinion-icon';
  icon.textContent = stance.icon;
  tag.append(icon, document.createTextNode(stance.label));
  return tag;
}

document.querySelector('#postForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const choice = activeIssueId && (memberVoteChoices.get(activeIssueId) || (activeIssueIsArchived ? '판단 보류' : null));
  if (!choice) return postDialog.close();
  const title = document.querySelector('#postTitle').value.trim();
  const content = document.querySelector('#postContent').value.trim();
  if (!title || !content) return;
  const topicId = getPersistedTopicUuid(activeIssueId);
  if (!topicId || !memberSession?.user) { showUserActionToast('안건 데이터 연결을 확인할 수 없습니다.'); return; }
  const payload = { topic_id: topicId, author_id: memberSession.user.id, author_nickname: getMemberNickname(), stance: choice, kind: document.querySelector('#postKind').value, title, body: content, source_url: safeHttpsUrl(document.querySelector('#postSourceUrl').value) };
  const { data, error } = await memberAuth.from('issue_posts').insert(payload).select('id,created_at').single();
  if (error) { showUserActionToast(`게시글을 저장하지 못했습니다: ${error.message}`); return; }
  const post = { id: data.id, stance: choice, kind: payload.kind, title, content, sourceUrl: payload.source_url, author: getMemberNickname(), createdAt: data.created_at };
  issuePostsCache.set(activeIssueId,[post,...(issuePostsCache.get(activeIssueId)||[])]);
  document.querySelector('#discussionPosts').prepend(createDiscussionPost(post));
  document.querySelector('#postForm').reset();
  postDialog.close();
});

function showUserActionToast(message) {
  const toast = document.querySelector('#userActionToast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showUserActionToast.timer);
  showUserActionToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

document.querySelector('#userReportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingReportContext) return;
  const form = event.currentTarget;
  const reason = form.elements.reason.value;
  const details = form.elements.details.value.trim();
  const issue = getIssueData(pendingReportContext.issueId);
  const targetType=pendingReportContext.issueId==='open-talk'?'open_talk_post':'issue_post';
  const {error}=await memberAuth.from('user_reports').insert({reporter_id:memberSession?.user?.id||null,target_type:targetType,target_id:pendingReportContext.postId,reason,details:details||`“${pendingReportContext.postTitle}” 게시글 신고 · ${issue?.title||'익명 자유토론장'}`});
  if(error){showUserActionToast(`신고를 접수하지 못했습니다: ${error.message}`);return;}
  document.querySelector('#userReportDialog').close();
  pendingReportContext = null;
  showUserActionToast('신고가 접수됐습니다. 운영자가 내용을 검토하겠습니다.');
});

let activeContactMode = 'inquiries';
document.querySelector('footer').addEventListener('click', (event) => {
  const contactButton = event.target.closest('[data-user-contact]');
  if (!contactButton) return;
  event.preventDefault();
  activeContactMode = contactButton.dataset.userContact;
  const isPartnership = activeContactMode === 'partnerships';
  if (!isPartnership && !isMemberSignedIn()) { openLogin(() => contactButton.click()); return; }
  document.querySelector('#contactDialogTitle').textContent = isPartnership ? '제휴 문의 접수' : '회원 문의 접수';
  document.querySelector('#contactSenderLabel').textContent = isPartnership ? '기관·회사명' : '닉네임';
  document.querySelector('#contactSender').placeholder = isPartnership ? '기관 또는 회사 이름' : '닉네임 또는 담당자명';
  const typeSelect = document.querySelector('#contactType');
  [...typeSelect.options].forEach((option) => { option.hidden = isPartnership ? !['콘텐츠 제휴', '자료 협력', '학술 협력', '기타'].includes(option.value) : ['콘텐츠 제휴', '자료 협력', '학술 협력'].includes(option.value); });
  typeSelect.value = isPartnership ? '콘텐츠 제휴' : '서비스 이용';
  document.querySelector('#contactForm').reset();
  if (!isPartnership) document.querySelector('#contactSender').value = getMemberNickname();
  typeSelect.value = isPartnership ? '콘텐츠 제휴' : '서비스 이용';
  document.querySelector('#contactDialog').showModal();
});

document.querySelector('#contactForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const isPartnership = activeContactMode === 'partnerships';
  if (!isPartnership && !isMemberSignedIn()) { showUserActionToast('로그인 후 회원 문의를 접수해 주세요.'); return; }
  const table=isPartnership?'partnership_inquiries':'user_inquiries';
  const payload=isPartnership?{user_id:memberSession?.user?.id||null,category:values.type,title:values.title.trim(),organization:values.sender.trim(),message:values.message.trim()}:{user_id:memberSession?.user?.id||null,category:values.type,title:values.title.trim(),sender:values.sender.trim(),message:values.message.trim()};
  const {error}=await memberAuth.from(table).insert(payload);
  if(error){showUserActionToast(`접수하지 못했습니다: ${error.message}`);return;}
  document.querySelector('#contactDialog').close();
  form.reset();
  showUserActionToast(isPartnership ? '제휴 문의를 접수했습니다.' : '문의가 접수됐습니다. 답변은 마이페이지의 내 문의에서 확인할 수 있습니다.');
  if (!document.querySelector('#memberView').classList.contains('hidden')) renderMemberPage();
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

const pollTrack = document.querySelector('#activePollList');
const pollPrevious = document.querySelector('#pollPrevious');
const pollNext = document.querySelector('#pollNext');
const pollPosition = document.querySelector('#pollPosition');

function syncPollCarousel() {
  if (!pollTrack) return;
  const cards = [...pollTrack.querySelectorAll('.poll-card')];
  const gap = Number.parseFloat(getComputedStyle(pollTrack).columnGap) || 0;
  const stride = (cards[0]?.getBoundingClientRect().width || pollTrack.clientWidth) + gap;
  const first = Math.min(cards.length - 1, Math.max(0, Math.round(pollTrack.scrollLeft / stride)));
  const visible = window.matchMedia('(max-width: 700px)').matches ? 1 : 2;
  pollPrevious.disabled = pollTrack.scrollLeft <= 2;
  pollNext.disabled = pollTrack.scrollLeft + pollTrack.clientWidth >= pollTrack.scrollWidth - 2;
  pollPosition.textContent = `${first + 1}–${Math.min(first + visible, cards.length)} / ${cards.length}`;
}

pollPrevious.addEventListener('click', () => pollTrack.scrollBy({ left: -pollTrack.clientWidth, behavior: 'smooth' }));
pollNext.addEventListener('click', () => pollTrack.scrollBy({ left: pollTrack.clientWidth, behavior: 'smooth' }));
pollTrack.addEventListener('scroll', syncPollCarousel, { passive: true });
window.addEventListener('resize', syncPollCarousel);
renderPollCards();
renderEditorialArchives();
renderAnnouncementTicker();
renderHomeCommunityBoard();
renderCommunityAccess();
refreshAnnouncementsFromSupabase(false);
refreshCommunityFromSupabase();
refreshMemberControls();
syncPollCarousel();
const sharedTopicId = new URLSearchParams(window.location.search).get('share');
const initialIssueId = new URLSearchParams(window.location.search).get('issue');
const initialView = new URLSearchParams(window.location.search).get('view');
const rootUrl = new URL(window.location.href);
rootUrl.searchParams.delete('issue'); rootUrl.searchParams.delete('view'); rootUrl.searchParams.delete('notice'); rootUrl.searchParams.delete('share');
const rootLocation = `${rootUrl.pathname}${rootUrl.search}${rootUrl.hash}`;
window.history.replaceState({ siseonRoute: 'home', siseonRoot: true }, '', rootLocation);
window.history.pushState({ siseonRoute: 'home', siseonExitGuard: true }, '', rootLocation);
syncSeoMetadata(null, 'none');
if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sharedTopicId || '')) showPublicSharedPoll(sharedTopicId);
else if (initialIssueId && getIssueData(initialIssueId)) openIssue(initialIssueId, 'replace');
else if (initialIssueId?.startsWith('topic-')) openIssue(initialIssueId, 'replace').catch(() => restoreHomeView());
else if (initialView === 'poll-board') showPollBoard(false);
else if (initialView === 'archive') showArchiveBoard(false);
else if (initialView === 'open-talk' || initialView === 'suggestions') showCommunitySubpage(initialView, false);
else if (initialView === 'announcements') { pushAppRoute('announcements', {}, true); openAnnouncements(null, false); }
else if (initialView === 'member' || initialView === 'profile') showMemberPage(initialView, false);
else if (['about','principles','privacy'].includes(initialView)) { pushAppRoute(initialView, {}, true); openSiteInfo(initialView, false); }
else if (initialView === 'admin') showAdminView(false);
else restoreHomeView();

loadPublishedTopics().then((topics) => {
  topics.forEach((issue) => { issues[issue.id] = issue; });
  const serverActive = topics.filter((issue) => issue.status === 'approved');
  const serverTitles = new Set(serverActive.map((issue) => issue.title.trim().toLocaleLowerCase('ko-KR')));
  const legacyDuplicateIds = editorialState.approved
    .filter((entry) => serverTitles.has(String(entry.issue?.title || '').trim().toLocaleLowerCase('ko-KR')))
    .map((entry) => entry.id);
  if (legacyDuplicateIds.length) {
    activeIssueIds = activeIssueIds.filter((id) => !legacyDuplicateIds.includes(id));
    editorialState.approved = editorialState.approved.filter((entry) => !legacyDuplicateIds.includes(entry.id));
    saveEditorialState();
  }
  activeIssueIds = serverActive.map((issue) => issue.id).slice(0, 30);
  renderPollCards(); renderPollBoard(); renderEditorialArchives(); syncPollCarousel();
  if (isVerifiedAdmin) renderAdminPage(currentAdminPage);
}).catch((error) => console.warn('공개 안건 동기화 실패:', error.message));

const exitConfirmDialog = document.querySelector('#exitConfirmDialog');
document.querySelector('#stayOnSiteButton').addEventListener('click', () => exitConfirmDialog.close());
document.querySelector('#leaveSiteButton').addEventListener('click', () => {
  exitConfirmDialog.close();
  let destination = 'about:blank';
  if (document.referrer) {
    try {
      const previousPage = new URL(document.referrer);
      if (['http:', 'https:'].includes(previousPage.protocol) && previousPage.href !== window.location.href) destination = previousPage.href;
    } catch { /* Use the blank page when the referrer is unavailable or invalid. */ }
  }
  window.location.replace(destination);
});

window.addEventListener('popstate', (event) => {
  const state = event.state || {};
  if (state.siseonRoot && !state.siseonExitGuard) {
    restoreRouteFromHistory(state);
    return;
  }
  restoreRouteFromHistory(state);
});


function showMemberPage(page = 'member', pushHistory = true) {
  closeSiteMap();
  setTopNavActive('member');
  [homeView, issueView, pollBoardView, announcementsView, archiveView, openTalkView, topicSuggestionsView, adminView].forEach(view => view.classList.add('hidden'));
  if (pushHistory) pushAppRoute(page);
  else window.history.replaceState({siseonRoute:page}, '', routeUrl(page));
  document.querySelector('#memberView').classList.remove('hidden');
  renderMemberPage();
  window.scrollTo({top:0,behavior:'instant'});
}
function renderMemberPage() {
  const view = document.querySelector('#memberView');
  const request = ++memberPageLoad;
  const back = '<button type="button" class="member-back" data-member="back">← 뒤로</button>';
  if (!memberSession?.user) {
    view.innerHTML = `${back}<h1>마이페이지</h1><div class="member-card"><h2>나의 시선을 모아보세요</h2><p>로그인하면 내 정보와 참여 기록을 확인할 수 있어요.</p><button class="primary-button" data-member="login">카카오로 로그인 · 가입</button></div>`;
    return;
  }
  const user = memberSession.user;
  const profile = window.history.state?.siseonRoute === 'profile';
  const nickname = escapeSiteText(getMemberNickname() || '닉네임을 설정해 주세요');
  const kakao = user.identities?.some(identity => identity.provider === 'kakao');
  view.innerHTML = `${back}<h1>${profile ? '내 정보 수정' : '마이페이지'}</h1><p class="member-caption">${profile ? '시선에서 사용할 정보를 관리하세요.' : '내가 참여한 이야기와 나의 기록'}</p>
    <section class="member-card"><div class="member-avatar" aria-hidden="true">${escapeSiteText([...getMemberNickname()][0] || '시')}</div><h2>${nickname}</h2><p>${kakao ? '카카오 계정으로 연결됨' : '회원 계정으로 연결됨'}</p>
    ${profile ? `<dl class="member-details"><div><dt>닉네임</dt><dd>${nickname} <button data-member="nickname">변경</button></dd></div><div><dt>가입일</dt><dd>${new Date(user.created_at).toLocaleDateString('ko-KR')}</dd></div><div><dt>로그인 방식</dt><dd>${kakao ? '카카오 로그인' : '이메일 로그인'}</dd></div></dl>` : '<button class="member-row" data-member="profile">내 정보 수정 <span>→</span></button>'}</section>
    ${profile ? '' : '<section class="member-card"><h2>내 문의</h2><button class="member-row" data-member="contact">회원 문의 접수 <span>→</span></button><div id="memberInquiries" aria-live="polite">문의 내역을 불러오고 있습니다.</div></section><section class="member-card"><h2>내 활동</h2><p class="member-caption">최근 참여 기록을 확인하세요.</p><div id="memberActivity" role="status">기록을 불러오고 있습니다.</div></section><section class="member-card"><h2>알림 설정</h2><p class="member-caption">알림 수신 선호를 저장합니다. 기기 푸시 알림은 앱 연결 후 제공됩니다.</p><div id="memberPreferences" role="status">설정을 불러오고 있습니다.</div></section>'}
    <section class="member-card"><h2>도움 및 계정</h2><button class="member-row" data-member="contact">회원 문의 <span>→</span></button><button class="member-row" data-member="logout">로그아웃 <span>→</span></button><button class="member-row" data-member="withdraw">탈퇴 요청 <span>→</span></button></section>`;
  if (!profile) {
    loadMemberPageData(user.id, request);
    loadMyInquiries(user.id, request);
  }
}
async function loadMemberPageData(userId, request) {
  const queries = [
    memberAuth.from('topic_votes').select('topic_id,choice,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(20),
    memberAuth.from('open_talk_posts').select('title,created_at').eq('author_id',userId).order('created_at',{ascending:false}).limit(20),
    memberAuth.from('issue_posts').select('title,created_at').eq('author_id',userId).order('created_at',{ascending:false}).limit(20),
    memberAuth.from('topic_suggestions').select('title,created_at').eq('author_id',userId).order('created_at',{ascending:false}).limit(20),
    memberAuth.from('notification_preferences').select('new_topics,comments_on_my_posts,replies_to_my_comments').eq('user_id',userId).maybeSingle()
  ];
  try {
    const results = await Promise.all(queries);
    if(request !== memberPageLoad || memberSession?.user?.id !== userId) return;
    const labels=['참여한 투표','자유토론 글','토론 의견','제안한 안건'];
    document.querySelector('#memberActivity').innerHTML=results.slice(0,4).map((result,index)=>`<details class="member-activity"><summary>${labels[index]} · 최근 ${result.data?.length || 0}건</summary>${result.error ? '<p>기록을 불러오지 못했습니다. 잠시 후 다시 열어주세요.</p>' : (result.data || []).map(row=>`<div class="member-record">${escapeSiteText(row.title || getIssueData('topic-'+row.topic_id)?.title || '참여한 투표')}${row.choice ? ` <strong>${escapeSiteText(row.choice)}</strong>` : ''}<small>${new Date(row.created_at).toLocaleDateString('ko-KR')}</small></div>`).join('') || '<p>아직 활동 기록이 없습니다.</p>'}</details>`).join('');
    const pref = results[4];
    document.querySelector('#memberPreferences').innerHTML=pref.error ? '<p>설정을 불러오지 못했습니다. 잠시 후 다시 열어주세요.</p>' : [['new_topics','새 투표 등록'],['comments_on_my_posts','내 글에 새 댓글'],['replies_to_my_comments','내 댓글에 답글']].map(([key,label])=>`<label class="member-toggle"><span>${label}</span><input type="checkbox" data-member-pref="${key}" ${pref.data?.[key] !== false ? 'checked' : ''}></label>`).join('');
  } catch { if(request===memberPageLoad) document.querySelector('#memberActivity').textContent='기록을 불러오지 못했습니다. 다시 시도해 주세요.'; }
}
document.querySelector('#memberPageLink').addEventListener('click',event=>{event.preventDefault();showMemberPage();});
document.querySelector('#memberView').addEventListener('click',async event=>{
  const button=event.target.closest('[data-member]'); if(!button)return;
  switch(button.dataset.member){
    case 'back': goBackWithinApp();break;
    case 'login': openLogin();break;
    case 'profile': showMemberPage('profile');break;
    case 'nickname': openNicknameSetup();break;
    case 'contact': document.querySelector('footer [data-user-contact="inquiries"]')?.click();break;
    case 'logout': await signOutMember(button); break;
    case 'withdraw': document.querySelector('#withdrawForm').reset(); document.querySelector('#withdrawMessage').textContent=''; document.querySelector('#withdrawDialog').showModal(); break;
  }
});
document.querySelector('#memberView').addEventListener('change',async event=>{
  const input=event.target.closest('[data-member-pref]');if(!input || !memberSession?.user)return;
  const key=input.dataset.memberPref;
  if(!['new_topics','comments_on_my_posts','replies_to_my_comments'].includes(key))return;
  input.disabled=true;
  try{
    const {error}=await memberAuth.from('notification_preferences').upsert({user_id:memberSession.user.id,...Object.fromEntries([...document.querySelectorAll('[data-member-pref]')].map(control=>[control.dataset.memberPref,control.checked])),updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
    showUserActionToast('알림 설정을 저장했습니다.');
  }catch(error){input.checked=!input.checked;showUserActionToast('저장하지 못했습니다: '+error.message);}
  finally{input.disabled=false;}
});

function renderDraftVoteOptions(options = ['찬성','반대','판단 보류']) {
  const target=document.querySelector('#draftVoteOptions');
  target.replaceChildren();
  for(const option of options){
    const row=document.createElement('div');row.className='topic-option-row';
    const input=document.createElement('input');input.name='voteOption';input.required=true;input.maxLength=60;input.value=option;input.setAttribute('aria-label','투표 선택지');
    const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',()=>{if(target.children.length<=2){showUserActionToast('선택지는 최소 2개가 필요합니다.');return;}row.remove();});
    row.append(input,remove);target.append(row);
  }
}
document.querySelector('#addVoteOptionButton').addEventListener('click',()=>{
  const inputs=[...document.querySelectorAll('#draftVoteOptions input')];
  if(inputs.length>=10){showUserActionToast('선택지는 최대 10개까지 가능합니다.');return;}
  renderDraftVoteOptions([...inputs.map(input=>input.value),'']);
  document.querySelector('#draftVoteOptions .topic-option-row:last-child input').focus();
});
document.querySelector('#topicGenerationMode').addEventListener('change',event=>{
  const material=['material','community'].includes(event.target.value);
  document.querySelector('#topicSourceInputs').classList.toggle('hidden',!material);
  document.querySelector('#topicGenerationStatus').textContent=event.target.value==='fun' ? '뉴스 출처 없이 재미 투표를 만듭니다. 가상 표시를 붙이고 관리자가 직접 승인합니다.' : material ? '참고 링크와 핵심 내용을 입력하세요. 원문 자동 수집은 하지 않습니다. 관리자가 직접 확인 후 승인합니다.' : '선택한 분야와 키워드로 뉴스를 찾습니다. 정치·재판·증시 주제는 관리자가 직접 승인합니다.';
});


async function loadMyInquiries(userId, request) {
  const target = document.querySelector('#memberInquiries');
  const { data, error } = await memberAuth.rpc('get_my_siseon_inquiries');
  if (!target.isConnected || request !== memberPageLoad || memberSession?.user?.id !== userId) return;
  if (error) { target.textContent = '문의 내역을 불러오지 못했습니다. 마이페이지를 다시 열어 주세요.'; return; }
  target.innerHTML = (data || []).map(item => `<details class="member-activity"><summary>${escapeSiteText(item.title)} · ${item.answered_at ? '답변 완료' : '답변 대기'}</summary><p class="member-caption">${new Date(item.created_at).toLocaleString('ko-KR')}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeSiteText(item.message)}</p>${item.answered_at ? `<div class="member-record"><strong>[운영자]</strong><small>${new Date(item.answered_at).toLocaleString('ko-KR')}</small><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeSiteText(item.reply)}</p></div>` : ''}</details>`).join('') || '<p class="member-caption">접수한 문의가 없습니다.</p>';
}

function openInquiryReply(item) {
  const dialog = document.querySelector('#inquiryReplyDialog');
  const form = dialog.querySelector('form');
  const message = dialog.querySelector('[role=status]');
  form.elements.reply.value = item.answeredAt ? item.reply : '';
  message.textContent = '';
  form.onsubmit = async event => {
    event.preventDefault();
    const reply = form.elements.reply.value.trim();
    if (!reply) { message.textContent = '답변 내용을 입력해 주세요.'; return; }
    const send = form.querySelector('[type=submit]');
    send.disabled = true;
    try {
      const answeredAt = new Date().toISOString();
      const { error } = await memberAuth.from('user_inquiries')
        .update({status:'answered', admin_note:reply, answered_at:answeredAt})
        .eq('id', item.id).select('id').single();
      if (error) throw error;
      Object.assign(item, {reply, answeredAt, status:'답변 완료'});
      dialog.close();
      renderAdminPage(currentAdminPage);
      showUserActionToast('회원의 내 문의에 답변을 전송했습니다.');
    } catch (error) {
      message.textContent = '답변 전송 실패: ' + error.message;
    } finally { send.disabled = false; }
  };
  dialog.showModal();
}

function openSiteInfo(page, pushHistory = true) {
  setTopNavActive('info');
  [homeView, issueView, pollBoardView, announcementsView, archiveView, openTalkView, topicSuggestionsView, adminView].forEach(view => view.classList.add('hidden'));
  closeSiteMap();
  if (pushHistory) pushAppRoute(page);
  const view = document.querySelector('#siteInfoView');
  view.classList.remove('hidden');
  view.querySelectorAll('.site-info-article').forEach(article => article.classList.toggle('hidden', article.id !== 'site-info-' + page));
  window.scrollTo(0, 0);
}
document.addEventListener('click', event => {
  const link = event.target.closest('[data-info-page]');
  if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openSiteInfo(link.dataset.infoPage);
});

function createReactionBar(board, id) {
  const bar = document.createElement('div');
  bar.className = 'post-reactions';
  bar.dataset.reactionPost = id;
  const options = board === 'issue' ? [['like','공감해요'],['differ','다르게 생각해요']] : [['like','공감해요']];
  for (const [reaction,label] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.reaction = reaction;
    button.dataset.label = label;
    button.disabled = true;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click', async () => {
      for (const control of bar.children) control.disabled = true;
      const container = board === 'issue' ? document.querySelector('#discussionPosts') : document.querySelector('#openTalkDetail');
      const {error} = await memberAuth.rpc('set_post_reaction',{p_board:board,p_post:id,p_reaction:button.getAttribute('aria-pressed') === 'true' ? null : reaction});
      if (error) showUserActionToast('반응을 저장하지 못했습니다. 다시 시도해 주세요.');
      else await refreshPostReactions(container, board);
      if (bar.isConnected) for (const control of bar.children) control.disabled = false;
    });
    bar.append(button);
  }
  return bar;
}

async function refreshPostReactions(container, board) {
  const userId = memberSession?.user?.id;
  const bars = [...container.querySelectorAll('[data-reaction-post]')];
  if (!userId || !bars.length) return;
  const ids = bars.map(bar => bar.dataset.reactionPost);
  const requests = [];
  for (let i = 0; i < ids.length; i += 500) requests.push(memberAuth.rpc('get_post_reactions',{p_board:board,p_posts:ids.slice(i,i+500)}));
  const results = await Promise.all(requests);
  if (!container.isConnected || memberSession?.user?.id !== userId || !bars.some(bar=>bar.isConnected)) return;
  const byId = new Map(results.flatMap(result=>result.data || []).map(row=>[row.post_id,row]));
  for (const bar of bars) {
    const row = byId.get(bar.dataset.reactionPost);
    if (!row || !bar.isConnected) continue;
    for (const button of bar.children) {
      button.textContent = button.dataset.label + ' ' + (button.dataset.reaction === 'like' ? row.likes : row.differs);
      button.setAttribute('aria-pressed',String(row.mine === button.dataset.reaction));
      button.disabled = false;
    }
  }
  const popular = container.querySelector('.popular-opinions');
  if (!popular) return;
  const ranked = bars.filter(bar=>bar.isConnected && Number(byId.get(bar.dataset.reactionPost)?.likes)>0)
    .sort((a,b)=>Number(byId.get(b.dataset.reactionPost).likes)-Number(byId.get(a.dataset.reactionPost).likes)).slice(0,3);
  popular.classList.toggle('hidden',!ranked.length);
  popular.replaceChildren();
  if (!ranked.length) return;
  const title = document.createElement('h3');
  title.textContent = '공감 많이 받은 의견';
  const list = document.createElement('ol');
  for (const bar of ranked) {
    const article = bar.closest('.discussion-post');
    const row = byId.get(bar.dataset.reactionPost);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = article.dataset.postTitle + ' · 공감 ' + row.likes + ' · 다르게 생각해요 ' + row.differs;
    button.addEventListener('click',()=>{
      const toggle = article.querySelector('.post-title-toggle');
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      toggle.focus({preventScroll:true});
      article.scrollIntoView({block:'center'});
    });
    item.append(button);
    list.append(item);
  }
  popular.append(title,list);
}

async function signOutMember(button) {
  if (!memberSession?.user || !window.confirm('로그아웃하시겠습니까?')) return;
  button.disabled = true;
  try {
    const { error } = await memberAuth.auth.signOut();
    if (error) throw error;
    pendingVote = null;
    pendingMemberAction = null;
    sessionStorage.removeItem('siseon:pending-auth-vote');
    showUserActionToast('로그아웃했습니다.');
  } catch (error) {
    showUserActionToast('로그아웃하지 못했습니다: ' + error.message);
  } finally {
    button.disabled = false;
  }
}
document.querySelector('#headerLogoutButton').addEventListener('click', event => signOutMember(event.currentTarget));

document.querySelector('#withdrawForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const reason = form.elements.reason.value.trim();
  const status = document.querySelector('#withdrawMessage');
  const button = form.querySelector('[type=submit]');
  if (reason.length < 2) { status.textContent='탈퇴 사유를 두 글자 이상 입력해 주세요.'; return; }
  if (!window.confirm('계정을 삭제하고 탈퇴할까요? 삭제한 계정은 복구할 수 없습니다.')) return;
  button.disabled = true;
  const {error} = await memberAuth.rpc('withdraw_siseon_member',{p_reason:reason});
  if (error) { status.textContent='탈퇴를 완료하지 못했습니다. 계정은 유지됩니다.'; button.disabled=false; return; }
  try { await memberAuth.auth.signOut({scope:'local'}); }
  finally { window.location.replace(memberAppRootUrl); }
});
async function renderWithdrawals(content, today=false, offset=0) {
  content.innerHTML='<h1>탈퇴 회원 관리</h1><p>불러오는 중입니다.</p>';
  const {data,error}=await memberAuth.rpc('get_siseon_withdrawals',{p_today:today,p_offset:offset});
  if(currentAdminPage!=='withdrawals')return;
  if(error){content.innerHTML='<h1>탈퇴 회원 관리</h1><p>기록을 불러오지 못했습니다.</p>';return;}
  content.innerHTML='<h1>탈퇴 회원 관리</h1><p>최근 90일 · 한국 시간 기준</p><div class="row-actions"><button data-wd-all>전체 '+data.total+'건</button><button data-wd-day>당일 '+data.today+'건</button></div>'+
    (data.rows.length ? '<ul>'+data.rows.map(row=>'<li><time>'+new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'</time><p>'+escapeSiteText(row.reason)+'</p></li>').join('')+'</ul>' : '<p>탈퇴 기록이 없습니다.</p>')+
    '<div class="row-actions">'+(offset>0?'<button data-wd-prev>이전</button>':'')+(offset+30<(today?data.today:data.total)?'<button data-wd-next>다음</button>':'')+'</div>';
  content.querySelector('[data-wd-all]').onclick=()=>renderWithdrawals(content);
  content.querySelector('[data-wd-day]').onclick=()=>renderWithdrawals(content,true);
  content.querySelector('[data-wd-prev]')?.addEventListener('click',()=>renderWithdrawals(content,today,offset-30));
  content.querySelector('[data-wd-next]')?.addEventListener('click',()=>renderWithdrawals(content,today,offset+30));
}

async function showPublicSharedPoll(uuid) {
  const view = document.querySelector('#publicSharedPoll');
  homeView.style.setProperty('display', 'none', 'important');
  homeView.classList.add('hidden');
  view.style.setProperty('display', 'block', 'important');
  view.classList.remove('hidden');
  pushAppRoute('public-share', { uuid }, true);
  document.documentElement.classList.remove('opening-public-share');
  const content = view.querySelector('article');
  try {
    const id = 'topic-' + uuid.toLowerCase();
    const topic = (await loadPublishedTopics()).find(item => item.id === id);
    if (!topic) { content.textContent = '공개 중인 안건을 찾을 수 없습니다.'; return; }
    const archived = topic.status === 'archived';
    const options = topic.voteOptions || ['찬성','반대','판단 보류'];
    const escape = escapeSiteText;
    const url = new URL(memberAppRootUrl);
    url.searchParams.set('issue',id);
    const source = safeHttpsUrl(topic.sourceUrl);
    const perspective = (label, text, side) => `<section class="shared-perspective ${side}"><h3>${label}</h3>${renderReadablePoints(text)}</section>`;
    content.innerHTML = `
      <section class="shared-poll-heading">
        <div class="shared-poll-meta"><span>${escape(topic.category)}</span><span>${escape(archived ? '투표 종료' : '마감 ' + formatPollDeadline(topic))}</span></div>
        <h1>${escape(topic.title)}</h1>
        ${renderReadableParagraphs(topic.intro, 'shared-poll-intro')}
      </section>
      <section class="shared-poll-panel">
        <h2>${topic.isHypothetical ? '가상 상황의 조건' : '배경과 확인할 내용'}</h2>
        <ul>${(topic.facts || []).map(fact => `<li>${escape(fact)}</li>`).join('')}</ul>
        ${source ? `<a class="shared-poll-source" href="${escape(source)}" rel="noopener noreferrer">${escape(topic.source || '참고 자료')} ↗</a>` : ''}
      </section>
      <section class="shared-poll-views">
        <h2>선택 전에 생각해 볼 관점</h2>
        <div class="shared-perspective-grid">${perspective('고려할 관점 1', topic.cardFor, 'side-one')}${perspective('고려할 관점 2', topic.cardAgainst, 'side-two')}</div>
      </section>
      ${archived ? '<section class="shared-poll-panel" data-final-results><h2>최종 투표 결과</h2><p>집계를 불러오는 중입니다.</p></section>' : ''}
      <section class="shared-poll-panel shared-poll-choices">
        <h2>투표 선택지</h2>
        <ol>${options.map(option => `<li>${escape(option)}</li>`).join('')}</ol>
        <a class="primary-button shared-poll-cta" href="${escape(url.href)}">${archived ? '보관된 토론 보기' : '투표 참여하기'} <span aria-hidden="true">→</span></a>
      </section>`;
    document.title=topic.title+' | 시선';
    if (!archived) return;
    const target = content.querySelector('[data-final-results]');
    const {data,error} = await memberAuth.rpc('get_archived_share_results',{p_topics:[uuid]});
    if(error){target.querySelector('p').textContent='최종 집계를 불러오지 못했습니다.';return;}
    const counts=new Map((data || []).map(row=>[row.choice,Number(row.vote_count)]));
    const total=[...counts.values()].reduce((sum,n)=>sum+n,0);
    target.innerHTML='<h2>최종 투표 결과</h2><p>총 '+total+'명 참여</p><ul>'+options.map(option=>{
      const count=counts.get(option)||0;
      return '<li>'+escape(option)+' · '+count+'표 ('+(total?100*count/total:0).toFixed(1)+'%)</li>';
    }).join('')+'</ul>';
  } catch { content.textContent='안건을 불러오지 못했습니다. 새로고침해 주세요.'; }
}
