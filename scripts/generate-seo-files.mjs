import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicUrl = process.env.SITE_URL;
if (!publicUrl) throw new Error('SITE_URL을 호스팅의 공개 주소로 설정해야 사이트맵을 만들 수 있습니다.');

const site = new URL(publicUrl);
if (site.protocol !== 'https:') throw new Error('SITE_URL은 HTTPS 공개 주소여야 합니다.');
if (!site.pathname.endsWith('/')) site.pathname += '/';
site.search = '';
site.hash = '';

const config = await readFile(path.join(root, 'supabase-config.js'), 'utf8');
const projectUrl = config.match(/url:\s*["']([^"']+)["']/)?.[1];
const publishableKey = config.match(/publishableKey:\s*["']([^"']+)["']/)?.[1];
if (!projectUrl || !publishableKey) throw new Error('supabase-config.js에 Supabase 공개 URL과 publishable key가 필요합니다.');

const response = await fetch(`${projectUrl.replace(/\/$/, '')}/functions/v1/content-admin`, {
  method: 'POST',
  headers: { apikey: publishableKey, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'topics-public' })
});
if (!response.ok) throw new Error(`승인된 안건을 가져오지 못했습니다 (HTTP ${response.status}).`);
const { topics = [] } = await response.json();
if (!Array.isArray(topics)) throw new Error('공개 안건 응답 형식이 올바르지 않습니다.');

const archivedIds = topics.filter(topic => topic.status === 'archived').map(topic => topic.id).slice(0, 100);
const resultsByTopic = new Map();
if (archivedIds.length) {
  const results = await fetch(new URL('/rest/v1/rpc/get_archived_share_results', projectUrl), {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ p_topics: archivedIds })
  });
  if (!results.ok) throw new Error('보관 투표의 최종 집계를 불러오지 못했습니다.');
  for (const row of await results.json()) {
    if (!resultsByTopic.has(row.topic_id)) resultsByTopic.set(row.topic_id, new Map());
    resultsByTopic.get(row.topic_id).set(row.choice, Number(row.vote_count));
  }
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeHttps = (value) => /^https:\/\//i.test(String(value || '')) ? escapeHtml(value) : '';
const xmlEscape = (value) => escapeHtml(value);
const descriptionFor = (topic) => `${topic.intro || ''} 선택의 조건과 다양한 관점을 살펴보세요.`.slice(0, 160);
const slugFor = (title) => String(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/g, '');
const topicPaths = [];
const seoRoot = path.join(root, 'topics');
await rm(seoRoot, { recursive: true, force: true });
await mkdir(seoRoot, { recursive: true });

for (const topic of topics.filter((item) => item.status === 'approved' || item.status === 'archived')) {
  const id = String(topic.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !topic.title || !topic.intro) continue;
  const topicPath = `topics/${id}/`;
  const legacyPath = `topics/${slugFor(topic.title)}-${id}/`;
  const pageUrl = new URL(topicPath, site).href;
  const appUrl = new URL(site.href);
  appUrl.searchParams.set('issue', `topic-${id}`);
  const facts = Array.isArray(topic.facts) ? topic.facts : [];
  const archived = topic.status === 'archived';
  const options = topic.vote_options || ['찬성','반대','판단 보류'];
  const counts = resultsByTopic.get(id) || new Map();
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const finalResults = archived ? `<section><h2>최종 투표 결과</h2><p>총 ${total}명 참여</p><ul>${options.map(option => {
    const count = counts.get(option) || 0;
    const percent = total ? (100 * count / total).toFixed(1) : '0.0';
    return `<li>${escapeHtml(option)} · ${count}표 (${percent}%)</li>`;
  }).join('')}</ul><p class="note">시선 참여자 집계입니다.</p></section>` : '';
  const deadline = topic.expires_at ? new Intl.DateTimeFormat('ko-KR', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(topic.expires_at)) : '';
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(topic.title)} | 시선</title><meta name="description" content="${escapeHtml(descriptionFor(topic))}">
<meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="시선"><meta property="og:title" content="${escapeHtml(topic.title)} | 시선"><meta property="og:description" content="${escapeHtml(descriptionFor(topic))}"><meta property="og:url" content="${escapeHtml(pageUrl)}"><meta property="og:image" content="${escapeHtml(new URL('assets/siseon-share.svg', site).href)}">
<meta name="twitter:card" content="summary"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: topic.title, description: descriptionFor(topic), datePublished: topic.published_at || topic.decided_at, mainEntityOfPage: pageUrl, articleSection: topic.category, publisher: { '@type': 'Organization', name: '시선' } }).replaceAll('<', '\\u003c')}</script>
<style>body{margin:0;background:#f7f7f4;color:#19231e;font:17px/1.8 system-ui,'Noto Sans KR',sans-serif}.wrap{max-width:820px;margin:0 auto;padding:28px 22px 64px}header,article,section{background:white;border:1px solid #e4e5dd;border-radius:16px;padding:24px;margin:18px 0}header{padding:16px 22px}a{color:#285b4d}.brand{font-weight:800;text-decoration:none;font-size:20px;color:#173b35}.category{color:#285b4d;font-weight:700}.lead{color:#58645c}h1{font-size:clamp(30px,7vw,44px);line-height:1.3;letter-spacing:-.04em}h2{font-size:24px}li{margin:10px 0}.side{border-left:4px solid #386b87;padding:5px 16px;margin:18px 0}.against{border-color:#b66a4d}.cta{display:inline-block;padding:12px 18px;background:#173b35;color:white;border-radius:9px;text-decoration:none;font-weight:700}.note{color:#727b73;font-size:14px}</style></head>
<body><div class="wrap"><header><a class="brand" href="${escapeHtml(site.href)}">시선</a></header><main><article><div class="category">${escapeHtml(topic.category || '토론 안건')}</div><h1>${escapeHtml(topic.title)}</h1><p class="lead">${escapeHtml(topic.intro)}</p><p>${archived ? '투표 종료' : deadline ? `마감 ${escapeHtml(deadline)} (한국 시간)` : '진행 중인 투표'}</p></article>
<section><h2>${topic.is_hypothetical ? '가상 상황의 조건' : '배경과 확인할 내용'}</h2><ul>${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>${(topic.fact_sources || []).length ? `<h3>사실·논거 확인 자료</h3><ul>${topic.fact_sources.map((source) => `<li><a href="${safeHttps(source.url)}" rel="nofollow noopener">${escapeHtml(source.publisher)} · ${escapeHtml(source.title)}</a>${source.supports ? ` — ${escapeHtml(source.supports)}` : ''}</li>`).join('')}</ul>` : `<p class="note">${topic.is_hypothetical ? '가상 상황을 바탕으로 만든 투표입니다.' : '참고 자료는 별도 확인이 필요합니다.'} 참고 링크: ${safeHttps(topic.source_url) ? `<a href="${safeHttps(topic.source_url)}" rel="nofollow noopener">${escapeHtml(topic.source || '기사 열기')}</a>` : '등록된 참고 링크가 없습니다.'}</p>`}</section>
<section><h2>참고 자료·소재</h2>${(topic.coverage_sources || []).length ? `<ul>${topic.coverage_sources.map((source) => `<li><a href="${safeHttps(source.url)}" rel="nofollow noopener">${escapeHtml(source.publisher)} · ${escapeHtml(source.title)}</a>${source.publishedAt ? ` <span class="note">(${escapeHtml(source.publishedAt)})</span>` : ''}</li>`).join('')}</ul><p class="note">보도 수는 사실의 진실성이나 여론의 대표성을 뜻하지 않습니다.</p>` : (safeHttps(topic.source_url) ? `<p><a href="${safeHttps(topic.source_url)}" rel="nofollow noopener">${escapeHtml(topic.source || '관련 보도 열기')}</a></p>` : `<p class="note">${topic.is_hypothetical ? '가상 상황 투표로 뉴스 출처를 사용하지 않았습니다.' : '등록된 참고 링크가 없습니다.'}</p>`)}</section>
<section><h2>고려할 관점 1</h2><p class="side">${escapeHtml(topic.for_text)}</p><h2>고려할 관점 2</h2><p class="side against">${escapeHtml(topic.against_text)}</p><p class="note">이 글은 토론을 위한 양측 주장과 확인 자료를 제공합니다. 투표 집계와 댓글은 로그인 후, 진행 중인 투표는 투표를 마친 뒤 앱에서 확인할 수 있습니다.</p></section>
${finalResults}<section><h2>투표 선택지</h2><ul>${(topic.vote_options || ['찬성','반대','판단 보류']).map(option=>`<li>${escapeHtml(option)}</li>`).join('')}</ul></section><p><a class="cta" href="${escapeHtml(appUrl.href)}">${archived ? '보관된 토론 보기' : '투표 참여하기'}</a></p></main></div></body></html>`;
  const directory = path.join(root, topicPath);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html, 'utf8');
  if (legacyPath !== topicPath) {
    const legacyDirectory = path.join(root, legacyPath);
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, 'index.html'), html, 'utf8');
  }
  topicPaths.push({ url: pageUrl, date: String(topic.published_at || topic.decided_at || '').slice(0, 10) });
}

const app = await readFile(path.join(root, 'app.js'), 'utf8');
const issueBlock = app.split('const issues = {')[1]?.split('\n};')[0] || '';
const topicBlock = app.split('const curatedTopics = [')[1]?.split('\n];')[0] || '';
const issueIds = new Set([
  ...[...issueBlock.matchAll(/^\s{2}'([^']+)':\s*\{/gm)].map((match) => match[1]),
  ...[...topicBlock.matchAll(/^\s*\['([^']+)'/gm)].map((match) => match[1]),
  'archive-public-bikes', 'archive-market-closure', 'archive-pet-registration'
]);
const urls = [site.href, ...[...issueIds].map((id) => { const url = new URL(site.href); url.searchParams.set('issue', id); return url.href; }), ...topicPaths.map((item) => item.url)];
const date = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc><lastmod>${date}</lastmod></url>`).join('\n')}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', site).href}\n`;
await Promise.all([writeFile(path.join(root, 'sitemap.xml'), sitemap, 'utf8'), writeFile(path.join(root, 'robots.txt'), robots, 'utf8')]);
console.log(`사이트맵·robots.txt·안건 SEO 페이지 ${topicPaths.length}개 생성 완료 · ${site.href}`);

