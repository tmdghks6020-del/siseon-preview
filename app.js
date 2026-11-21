const homeView = document.querySelector('#homeView');
const issueView = document.querySelector('#issueView');
const announcementsView = document.querySelector('#announcementsView');
const archiveView = document.querySelector('#archiveView');
const openTalkView = document.querySelector('#openTalkView');
const topicSuggestionsView = document.querySelector('#topicSuggestionsView');
const loginDialog = document.querySelector('#loginDialog');
const postDialog = document.querySelector('#postDialog');
const loginButton = document.querySelector('#loginButton');
const previousStoragePrefix = 'dugyeon:';
const storagePrefix = 'siseon:';
const previousStorageKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key) => key?.startsWith(previousStoragePrefix));
previousStorageKeys.forEach((key) => {
  const migratedKey = `${storagePrefix}${key.slice(previousStoragePrefix.length)}`;
  if (localStorage.getItem(migratedKey) === null) localStorage.setItem(migratedKey, localStorage.getItem(key));
  localStorage.removeItem(key);
});
const authKey = `${storagePrefix}demo-auth`;
let activeIssueId = null;
let activeIssueIsArchived = false;
let activeIssueIsReadOnly = false;
let pendingVote = null;
let pendingReportContext = null;

function setTopNavActive(key) {
  document.querySelectorAll('.desktop-nav [data-nav-key], .site-map-panel [data-nav-key]').forEach((link) => {
    const active = link.dataset.navKey === key;
    link.classList.toggle('nav-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
setTopNavActive('polls');

function showCommunitySubpage(page) {
  homeView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden'); adminView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden');
  closeSiteMap();
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
  homeView.classList.remove('hidden');
  issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); archiveView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden');
  adminView.classList.add('hidden');
  activeIssueId = null;
  activeIssueIsArchived = false; activeIssueIsReadOnly = false;
  syncSeoMetadata(null, 'replace');
  setTopNavActive('polls');
  closeSiteMap();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('.brand').forEach((brand) => brand.addEventListener('click', (event) => { event.preventDefault(); goHome(); }));
document.querySelector('#issueHomeButton').addEventListener('click', goHome);

const issues = {
  'delivery-platform': {
    category: '경제 · 자영업',
    title: '배달앱의 입점업체 거래조건을 더 강하게 규제해야 할까?',
    intro: '공정위의 최근 제재 발표를 계기로 입점업체의 거래 자유, 플랫폼 경쟁, 소비자 선택을 함께 살펴봅니다.',
    facts: [
      '공정위는 2026년 11월 9일 배민과 쿠팡에 시정명령 및 잠정 과징금 부과를 발표했습니다.',
      '발표 자료는 최혜대우 요구 등 배달앱 거래 관행을 주요 쟁점으로 다룹니다.',
      '공정위 발표 기준 잠정 과징금은 배민 3,311억 원, 쿠팡 3,008억 원입니다.'
    ],
    source: '공정거래위원회 발표 · 2026.11.09',
    sourceUrl: 'https://m.korea.kr/briefing/pressReleaseView.do?newsId=156788431&pWiseMinistry=ministryNews&repCode=C00001&repCodeType=%EC%A0%95%EB%B6%80%EB%B6%80%EC%B2%98',
    forArguments: [
      ['입점업체의 선택권', '거래조건을 플랫폼이 좌우하면 소상공인이 가격과 판매 방식을 자율적으로 정하기 어렵다는 주장입니다.'],
      ['공정한 경쟁', '플랫폼 간 조건을 맞추도록 요구하면 신규·소규모 서비스의 경쟁 기회가 줄 수 있다는 우려입니다.'],
      ['거래의 투명성', '수수료와 노출·할인 조건을 명확히 공개하도록 해 분쟁을 줄일 수 있다는 입장입니다.']
    ],
    againstArguments: [
      ['서비스 선택의 폭', '플랫폼별 할인과 상품 구성이 제한되면 소비자가 누리는 혜택이 줄 수 있다는 주장입니다.'],
      ['운영 비용과 혁신', '규제가 세부 운영까지 제한하면 새로운 배달·구독 서비스 실험이 위축될 수 있다는 우려입니다.'],
      ['비용 전가 가능성', '플랫폼의 준수 비용이 늘어나면 입점업체나 소비자에게 일부 부담이 옮겨갈 수 있다는 입장입니다.']
    ],
    demoResults: [43, 41, 16],
    samplePosts: [
      { id: 'delivery-sample-1', stance: '찬성', title: '입점업체가 가격을 직접 정할 수 있어야 합니다', author: '동네가게', content: '플랫폼마다 수수료와 노출 조건이 다르면 작은 가게는 여러 조건을 따르느라 메뉴 가격이나 영업 방식을 스스로 결정하기 어렵습니다. 거래 조건을 투명하게 공개하고 가게가 선택할 수 있어야 장기적으로 다양한 가게가 살아남을 수 있다고 생각합니다.', initialComments: ['가게 규모에 따라 협상력이 다른 점도 함께 봐야겠네요.'] },
      { id: 'delivery-sample-2', stance: '반대', title: '플랫폼별 할인 혜택도 소비자의 선택입니다', author: '자주주문', content: '플랫폼이 각자 다른 할인과 멤버십 혜택을 제공하는 것도 경쟁의 한 방식이라고 봅니다. 거래 조건을 지나치게 같게 만들면 신규 서비스가 차별화하기 어려워지고, 그 비용이 결국 이용자에게 돌아올 수 있습니다.', initialComments: ['소상공인의 선택권과 할인 혜택을 어떻게 함께 지킬지 궁금합니다.'] }
    ]
  },
  'household-debt': {
    category: '경제 · 금융',
    title: '가계부채 관리를 위해 신규 대출을 더 제한해야 할까?',
    intro: '가계신용 증가와 금융 위험 관리, 주거·생활 자금이 필요한 사람의 대출 접근성을 함께 생각해봅니다.',
    facts: [
      '한국은행에 따르면 2026년 3분기 말 가계신용 잔액은 2,030.5조 원입니다.',
      '가계신용은 전 분기 말보다 9.8조 원 증가했습니다.',
      '이 통계는 가계대출과 판매신용을 합한 잔액이며, 증가만으로 개별 가구의 상환 능력을 판단할 수는 없습니다.'
    ],
    source: '한국은행 가계신용 통계 · 2026.11.18',
    sourceUrl: 'https://www.bok.or.kr/portal/bbs/B0000501/view.do?depth=201264&menuNo=201264&nttId=11066748&oldMenuNo=201150&programType=newsData&relate=Y',
    forArguments: [
      ['가계 위험 완화', '상환 능력을 넘어서는 대출을 미리 관리하면 금리·소득 충격에 취약한 가구를 줄일 수 있다는 주장입니다.'],
      ['금융 안정성', '부채 증가가 계속되면 금융시장 충격이 가계와 금융기관에 함께 번질 수 있다는 우려입니다.'],
      ['책임 있는 대출', '소득과 상환 능력을 더 엄격히 살피면 장기 연체와 과도한 이자 부담을 줄일 수 있다는 입장입니다.']
    ],
    againstArguments: [
      ['실수요자의 자금 접근', '일률적인 한도 축소는 주거 마련이나 꼭 필요한 생활 자금을 구하는 사람에게 부담이 될 수 있습니다.'],
      ['차주별 차이', '소득·자산·대출 목적이 다른데 총량 기준만 강화하면 상환 여력이 있는 사람도 불이익을 받을 수 있다는 주장입니다.'],
      ['대체 금융 위험', '제도권 대출이 막힌 사람이 더 높은 금리의 대출로 이동할 가능성을 살펴야 한다는 입장입니다.']
    ],
    demoResults: [48, 37, 15],
    samplePosts: [
      { id: 'debt-sample-1', stance: '찬성', title: '대출은 늘기 전에 상환 능력을 더 꼼꼼히 봐야 합니다', author: '살림하는사람', content: '대출을 받을 때는 지금 갚을 수 있는지뿐 아니라 금리가 오르거나 소득이 줄었을 때도 버틸 수 있는지 살펴야 합니다. 위험이 커진 뒤에 대응하기보다 상환 능력에 맞춰 미리 관리하는 편이 가계와 금융시장 모두에 낫다고 생각합니다.', initialComments: ['소득이 불안정한 차주를 어떤 기준으로 보호할지도 중요하겠습니다.'] },
      { id: 'debt-sample-2', stance: '반대', title: '정책 한도가 실수요자까지 막지 않도록 해야 합니다', author: '첫집준비', content: '대출 총량만 보고 한도를 줄이면 이미 소득과 상환 계획이 있는 실수요자도 필요한 자금을 구하기 어려워질 수 있습니다. 차주의 소득과 대출 목적을 더 세밀하게 보고, 무리한 대출과 꼭 필요한 대출을 구분했으면 합니다.', initialComments: ['목적별 심사가 실제로 공정하게 운영될 방법도 같이 논의하면 좋겠어요.'] }
    ]
  },
  'exam-security': {
    category: '교육 · 기술',
    title: 'AI 부정행위를 막기 위해 시험장 검사를 더 강화해야 할까?',
    intro: 'AI 기기를 이용한 부정행위 대응과 시험의 공정성, 수험생의 사생활 보호를 함께 살펴봅니다.',
    facts: [
      '정부는 2026년 11월 16일 AI 스마트안경 등 스마트기기 부정행위 대응을 위한 관계부처 회의를 열었습니다.',
      '교육당국은 2027학년도 수능을 앞두고 시험장 스마트기기 관리와 점검을 강화하는 대책을 발표했습니다.',
      '검사 기준을 만들 때는 부정행위 방지와 일반 안경·의료기기를 착용하는 응시자의 권리를 함께 고려해야 합니다.'
    ],
    source: '관계부처 발표 · 2026.11.16',
    sourceUrl: 'https://www.korea.kr/briefing/pressReleaseView.do?newsId=156789436',
    forArguments: [
      ['시험의 공정성', '새로운 기기를 이용한 부정행위가 가능해진 만큼 감독 방식도 강화해야 한다는 주장입니다.'],
      ['응시자 간 신뢰', '정당하게 시험을 치르는 수험생이 불이익을 받지 않도록 예방 조치가 필요하다는 입장입니다.'],
      ['명확한 기준', '기기 반입과 검사 절차를 분명히 안내하면 현장 혼란과 자의적 판단을 줄일 수 있다는 주장입니다.']
    ],
    againstArguments: [
      ['사생활과 신체의 권리', '안경과 소지품을 넓게 확인하면 응시자의 사생활과 신체적 권리를 침해할 수 있다는 우려입니다.'],
      ['오인과 위축', '일반 안경이나 보조기기를 의심 대상으로 보면 무고한 수험생에게 불안과 불이익을 줄 수 있습니다.'],
      ['비례성 있는 대응', '모든 응시자에게 같은 강도의 검사를 적용하기보다 위험과 의심 정도에 맞춘 조치가 필요하다는 입장입니다.']
    ],
    demoResults: [57, 29, 14],
    samplePosts: [
      { id: 'exam-sample-1', stance: '찬성', title: '공정한 시험을 위해 검사 기준을 분명히 해야 합니다', author: '수험생가족', content: '기술을 이용한 부정행위가 실제로 가능해졌다면 시험 감독도 그 변화에 맞춰야 합니다. 어떤 기기가 금지되는지 미리 알리고 현장에서 같은 기준을 적용하면, 정당하게 준비한 응시자들의 결과를 보호하는 데 도움이 된다고 생각합니다.', initialComments: ['기준을 미리 공개하고 예외 상황도 안내해야겠습니다.'] },
      { id: 'exam-sample-2', stance: '반대', title: '일반 안경을 쓴 사람까지 위축되지 않게 해야 합니다', author: '안경쓴사람', content: '부정행위를 막는 일은 중요하지만, 외관만으로 의심하거나 모든 응시자에게 과도한 검사를 하면 일반 안경이나 보조기기를 쓰는 사람도 불편을 겪을 수 있습니다. 의심 근거와 검사 절차를 좁고 명확하게 정해야 합니다.', initialComments: ['의료기기 착용자는 별도 안내가 있으면 좋겠어요.'] }
    ]
  },
  'cabbage-market': {
    category: '생활 · 농업',
    title: '배추 가격 급락 때 정부가 산지 출하를 조절해 농가를 지원해야 할까?',
    intro: '농가의 가격 하락 부담과 소비자 가격, 농산물 시장 개입의 범위를 함께 생각해봅니다.',
    facts: [
      '농식품부는 2026년 가을배추 생산량 증가로 가격이 하락하자 수매 비축과 산지 출하 조절 대책을 발표했습니다.',
      '정부 발표는 농가의 가격 부담과 소비자의 장바구니 부담을 함께 고려한 수급 대책이라고 설명합니다.',
      '출하 조절은 공급량과 시장 가격에 영향을 줄 수 있으므로 정책 효과와 비용을 함께 살펴야 합니다.'
    ],
    source: '농림축산식품부 발표 · 2026.11.11',
    sourceUrl: 'https://m.korea.kr/news/policyNewsView.do?cateId=&newsId=148975496&pageIndex=1&repCode_P=&smenu=',
    forArguments: [
      ['농가 소득 보호', '풍작으로 가격이 급락할 때 출하를 조절하면 생산자의 급격한 손실을 줄일 수 있다는 주장입니다.'],
      ['생산 기반 유지', '가격 변동이 반복되면 다음 해 재배를 포기하는 농가가 늘 수 있어 안정 장치가 필요하다는 입장입니다.'],
      ['수급 충격 대응', '기상과 작황에 따른 공급 급변을 완화해 농가와 소비자 모두의 예측 가능성을 높일 수 있습니다.']
    ],
    againstArguments: [
      ['시장 가격 신호', '가격은 수요와 공급을 반영하므로 출하 조절이 시장 신호를 흐릴 수 있다는 우려입니다.'],
      ['재정과 보관 비용', '수매와 비축에는 공공 비용이 들며, 보관·폐기 과정의 부담도 고려해야 한다는 주장입니다.'],
      ['소비자 가격 영향', '공급을 줄이는 조치가 소비자가 낮은 가격으로 농산물을 살 기회를 줄일 수 있다는 입장입니다.']
    ],
    demoResults: [51, 35, 14],
    samplePosts: [
      { id: 'cabbage-sample-1', stance: '찬성', title: '풍작이 농가의 손해로 이어지지 않도록 해야 합니다', author: '농촌생활', content: '한 해 동안 기후와 비용을 감수해 생산했는데 수확기에 가격이 급락하면 농가가 다음 해 재배를 줄일 수 있습니다. 일시적인 공급 과잉을 완화하고 생산 기반을 유지할 수 있도록 출하 조절을 검토할 필요가 있습니다.', initialComments: ['다음 작기 공급까지 고려해야 한다는 점에 공감합니다.'] },
      { id: 'cabbage-sample-2', stance: '반대', title: '가격이 내려간 만큼 소비자도 혜택을 봐야 합니다', author: '장보는사람', content: '풍작으로 가격이 내려가는 것은 소비자가 식재료를 저렴하게 살 기회이기도 합니다. 정부가 반복해서 출하를 제한하면 세금과 보관 비용이 들고, 시장 가격이 수요와 공급을 반영하는 기능도 약해질 수 있습니다.', initialComments: ['지원이 필요하다면 출하 제한 외에 다른 방법도 비교해보면 좋겠어요.'] }
    ]
  }
};

const archivedSampleIssues = {
  'archive-public-bikes': {
    category: '교통 · 생활', title: '공공 자전거 대여소를 더 늘려야 할까?',
    intro: '이전 투표의 보관 기록입니다. 가까운 이동 수단을 늘리는 효과와 설치·운영 부담을 함께 살펴봅니다.',
    facts: ['공공 자전거는 지자체가 대여소와 자전거를 운영하는 단거리 이동 수단입니다.', '대여소 위치와 이용량, 유지 비용은 지역별 여건에 따라 달라질 수 있습니다.'],
    source: '서울특별시 교통정보', sourceUrl: 'https://news.seoul.go.kr/traffic/',
    forArguments: [['대중교통 연결', '대여소가 늘면 역과 주거지 사이의 이동이 편해지고 짧은 거리를 자동차 대신 자전거로 이동할 수 있습니다.'], ['이용 기회 확대', '대여소가 적은 지역에 설치하면 더 많은 주민이 비용 부담이 낮은 이동 수단을 이용할 수 있습니다.'], ['생활권 이동', '가까운 거리의 이동 선택지가 늘어 보행과 대중교통을 보완할 수 있습니다.']],
    againstArguments: [['운영·정비 비용', '자전거와 거치 시설의 구매, 정비, 재배치에 드는 예산을 함께 고려해야 합니다.'], ['이용 편차', '수요가 적은 곳에 설치하면 자전거가 오래 방치되거나 필요한 곳에 부족해질 수 있습니다.'], ['보행 공간', '보도와 도로 여건을 살피지 않고 대여소를 늘리면 보행자와 자전거 이용자의 안전을 해칠 수 있습니다.']],
    demoResults: [46, 40, 14], samplePosts: [
      { id: 'archive-bikes-for', stance: '찬성', title: '환승이 불편한 구간에 대여소가 더 필요합니다', author: '출퇴근길', content: '역에서 집이나 직장까지 걷기 애매한 거리에 대여소가 있으면 대중교통을 이용하기 쉬워집니다. 이용 데이터로 위치를 정하고 정비도 같이 늘리면 실용적인 이동 수단이 될 수 있다고 생각합니다.', initialComments: ['설치 수요를 먼저 조사하는 방식이 좋겠습니다.'] },
      { id: 'archive-bikes-against', stance: '반대', title: '늘리기 전에 지금 있는 대여소부터 살펴야 합니다', author: '동네산책', content: '대여소가 늘어도 자전거가 부족하거나 고장 난 상태라면 이용하기 어렵습니다. 신규 설치보다 이용량이 낮은 곳의 위치를 조정하고 정비 체계를 안정시키는 일이 먼저라고 봅니다.', initialComments: ['지역별 이용률을 공개하면 판단에 도움이 되겠네요.'] }
    ]
  },
  'archive-market-closure': {
    category: '경제 · 소비', title: '대형마트 의무휴업을 유지해야 할까?',
    intro: '이전 투표의 보관 기록입니다. 근로자의 휴식과 지역 상권 보호, 소비자의 선택과 영업 자율을 비교합니다.',
    facts: ['대형마트 의무휴업은 유통산업 관련 제도에 따라 지역별로 운영됩니다.', '휴업일의 영향은 주변 상권 구성과 온라인 장보기 이용 정도에 따라 달라질 수 있습니다.'],
    source: '국가법령정보센터 · 유통산업발전법', sourceUrl: 'https://www.law.go.kr/법령/유통산업발전법',
    forArguments: [['휴식권 보장', '정기 휴업일은 유통업 종사자의 휴식 시간을 보장하는 장치가 될 수 있습니다.'], ['지역 상권 보호', '대형 점포의 영업을 조정하면 주변 중소 상점과 전통시장이 경쟁할 여지를 확보할 수 있다는 주장입니다.'], ['예측 가능한 운영', '정기적인 휴업일은 근무 일정을 계획하고 휴일을 보장하는 데 도움이 될 수 있습니다.']],
    againstArguments: [['소비자 선택', '휴업일에 장을 봐야 하는 가구와 이동이 불편한 소비자의 선택지가 줄어들 수 있습니다.'], ['효과의 범위', '온라인 주문과 다른 유통 채널이 커진 상황에서 오프라인 영업 제한이 지역 상권을 돕는 효과가 제한적일 수 있습니다.'], ['영업 자율성', '지역별 소비 패턴과 사업장 운영 여건이 다른 만큼 획일적 휴업보다 현장에 맞춘 방식을 택할 수 있다는 입장입니다.']],
    demoResults: [45, 41, 14], samplePosts: [
      { id: 'archive-market-for', stance: '찬성', title: '정기 휴업은 일하는 사람의 휴식에도 필요합니다', author: '동네상인', content: '소비자 편의도 중요하지만 대형 점포에서 일하는 사람도 가족과 함께 쉴 수 있는 날이 필요합니다. 지역 상권이 변화에 적응할 시간을 주는 효과도 함께 평가해야 합니다.', initialComments: ['휴업 효과와 노동 환경을 나눠서 보면 좋겠어요.'] },
      { id: 'archive-market-against', stance: '반대', title: '휴업일이 지역 상권에 도움이 되는지 다시 확인해야 합니다', author: '주말장보기', content: '휴업일에 소비가 다른 곳이나 온라인으로 옮겨갈 수 있어 주변 상점 매출이 실제로 늘었는지 살펴야 합니다. 소비자가 불편을 겪는 만큼 효과가 분명한 대안을 비교해야 한다고 봅니다.', initialComments: ['지역마다 결과가 다를 수 있다는 점에 공감합니다.'] }
    ]
  },
  'archive-pet-registration': {
    category: '반려생활 · 제도', title: '반려동물 등록제를 강화해야 할까?',
    intro: '이전 투표의 보관 기록입니다. 유실 동물의 신속한 보호와 보호자의 의무, 등록 부담을 함께 논의합니다.',
    facts: ['반려견 등록 제도는 보호자와 동물 정보를 연결해 유실 시 반환과 책임 확인을 돕기 위한 제도입니다.', '등록 방식과 관리 절차를 안내하고 실제 정보가 최신 상태인지 확인하는 일이 필요합니다.'],
    source: '국가동물보호정보시스템', sourceUrl: 'https://www.animal.go.kr/',
    forArguments: [['유실 시 반환', '등록 정보가 최신이면 보호자와 연락해 동물을 돌려보내는 데 도움이 될 수 있습니다.'], ['책임 의식', '등록을 통해 보호자의 기본 책임을 알리고 유기 방지를 위한 제도 인식을 높일 수 있습니다.'], ['정책 자료', '정확한 등록 정보는 지역의 보호·돌봄 정책을 계획하는 데 참고가 될 수 있습니다.']],
    againstArguments: [['비용과 절차 부담', '등록 비용과 방문 절차가 부담이 되면 등록이 늦어지거나 제도 참여가 어려운 보호자가 생길 수 있습니다.'], ['등록 이후 관리', '등록만 강화하고 정보 갱신과 유실 동물 대응을 개선하지 않으면 체감 효과가 작을 수 있습니다.'], ['개인정보 보호', '보호자 정보와 동물 식별 정보를 다루는 만큼 수집 범위와 보관·접근 기준을 명확히 해야 합니다.']],
    demoResults: [52, 34, 14], samplePosts: [
      { id: 'archive-pets-for', stance: '찬성', title: '유실 동물을 가족에게 돌려보낼 가능성을 높여야 합니다', author: '반려가족', content: '동물이 길을 잃었을 때 보호자를 찾을 단서가 있으면 구조와 반환이 빨라질 수 있습니다. 등록을 편하게 하고 정보 갱신을 안내하면 보호자 책임을 확인하는 데도 도움이 됩니다.', initialComments: ['등록 접근성을 낮추는 방안도 같이 필요해요.'] },
      { id: 'archive-pets-against', stance: '반대', title: '등록 의무보다 사후 관리와 지원을 먼저 강화했으면 합니다', author: '동물돌봄', content: '등록을 늘리는 것만으로 유기나 학대 문제가 해결되지는 않습니다. 등록 비용과 절차를 낮추고 정보 관리와 보호 체계를 먼저 개선한 뒤 추가 의무를 논의해야 한다고 생각합니다.', initialComments: ['제도의 실효성을 확인할 지표가 필요하겠네요.'] }
    ]
  }
};

// Editor-curated active topics: four established topics plus 26 cross-category issues.
// These are discussion prompts, not endorsements or a measure of public opinion.
const curatedTopics = [
  ['ai-music', '연예 · 음악', 'AI로 만든 음악은 청취자에게 표시해야 할까?', 'AI 생성 음원이 차트와 창작 현장에 등장하며 표시와 권리 기준에 대한 논의가 이어지고 있습니다.', 'AI 활용 음악의 저작권 등록 기준을 둘러싼 공론화와 업계 논의가 진행 중입니다.', '한국저작권위원회 저작권 동향 · 2026.11', 'https://welcon.kocca.kr/ko/info/trend/1959298', 'AI 사용 정보를 알리면 청취자가 알고 선택하고 창작 기여를 논의하기 쉽습니다.', 'AI 사용 범위가 넓고 기준이 모호해 일률적 표시가 창작 실험을 위축시킬 수 있습니다.'],
  ['artist-minors', '연예 · 권리', '미성년 연예인의 활동 시간과 휴식 기준을 더 엄격히 해야 할까?', '성장기 청소년의 건강과 학업, 본인이 선택한 활동 기회 사이의 기준을 생각해봅니다.', '대중문화예술 분야에서 미성년자의 권리와 계약 환경은 업계와 사회가 함께 살펴야 할 쟁점입니다.', '한국콘텐츠진흥원 콘텐츠산업 동향', 'https://www.kocca.kr/', '촬영·공연 일정의 상한과 휴식 기준을 두면 협상력이 약한 청소년을 보호할 수 있습니다.', '개인별 상황이 다른데 획일적 기준은 활동 기회를 줄이고 당사자의 선택을 제한할 수 있습니다.'],
  ['celebrity-privacy', '연예 · 사생활', '공항 등 공공장소에서 연예인을 촬영하는 관행에 제한이 필요할까?', '대중의 관심과 취재·표현의 자유, 이동과 안전을 위한 사생활 보호를 함께 다룹니다.', '공공장소 촬영은 사생활·안전·표현의 자유가 맞물려 구체적 맥락에 따라 판단이 달라집니다.', '개인정보보호위원회 개인정보 보호 안내', 'https://www.pipc.go.kr/', '밀집 촬영과 동선 추적을 제한하면 당사자와 주변 이용자의 안전을 지킬 수 있습니다.', '공인이라는 이유로 촬영을 넓게 제한하면 정당한 취재와 시민의 표현까지 위축될 수 있습니다.'],
  ['crypto-cold-wallet', '가상자산 · 보안', '거래소는 고객 가상자산을 가능한 한 많이 콜드월렛에 보관해야 할까?', '해킹 위험을 줄이는 보안과 빠른 입출금·운영 편의의 균형을 생각해봅니다.', '금융위원회는 2026년 11월 가상자산 업권 보안 대책회의에서 콜드월렛 보관 비중 확대 등을 논의했습니다.', '금융위원회 보안 대책회의 · 2026.11.12', 'https://www.fsc.go.kr/po010102/88133?curPage=&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=', '오프라인 보관 비중을 높이면 온라인 침해가 고객 자산 손실로 이어질 위험을 낮출 수 있습니다.', '보관 비중을 일률적으로 정하면 출금 지연과 운영 부담이 커질 수 있어 위험에 맞춘 기준이 낫습니다.'],
  ['crypto-insurance', '가상자산 · 소비자', '가상자산 거래소에 해킹 피해 보상 보험·준비금을 더 늘리도록 해야 할까?', '피해 이용자 구제의 실효성과 사업자의 비용, 보험으로 해결하기 어려운 위험을 살펴봅니다.', '금융당국은 최근 업권 보안 논의에서 보험 보상한도와 준비금 확충 방향을 다뤘습니다.', '금융위원회 보안 대책회의 · 2026.11.12', 'https://www.fsc.go.kr/po010102/88133?curPage=&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=', '사고 뒤 신속한 보상 재원을 확보하면 이용자 피해를 줄이고 사업자의 예방 책임도 높입니다.', '보험료와 준비금 비용은 거래 수수료나 서비스 축소로 이용자에게 전가될 수 있습니다.'],
  ['crypto-freeze', '가상자산 · 이용자 보호', '해킹이 의심되면 거래소가 고객 출금을 먼저 막을 수 있어야 할까?', '사고 확산을 막는 신속한 조치와 고객 자산을 통제받지 않을 권리를 비교합니다.', '금융당국은 침해사고 의심 때 선제적 입출금 차단이 가능한 대응 방안을 논의했습니다.', '금융위원회 보안 대책회의 · 2026.11.12', 'https://www.fsc.go.kr/po010102/88133?curPage=&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=', '짧은 차단은 공격자가 자산을 빼내는 것을 막고 전체 고객 피해를 줄일 수 있습니다.', '오탐이나 불투명한 결정으로 출금이 장기간 막히지 않도록 기간·통지·이의 절차가 필요합니다.'],
  ['crypto-staking', '가상자산 · 투자', '거래소의 스테이킹·가상자산 대여 상품을 더 엄격히 제한해야 할까?', '상품 선택권과 수익 기회, 원금 손실·유동성 위험을 이용자가 이해할 수 있는지 다룹니다.', '가상자산 서비스의 보안과 이용자 자산 보호 기준이 최근 정책 논의의 중심에 있습니다.', '금융위원회 가상자산 보안 정책 논의', 'https://www.fsc.go.kr/po010102/88133?curPage=&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=', '복잡한 상품의 판매와 설명을 엄격히 관리하면 위험을 모르는 이용자의 손실을 줄일 수 있습니다.', '위험을 충분히 공개하고 선택을 허용하면 이용자 선택권과 시장의 서비스 혁신을 지킬 수 있습니다.'],
  ['stock-volatility', '주식 · 시장', '급등락이 큰 종목은 거래 정지 기준을 더 자주 적용해야 할까?', '시장 혼란을 멈추는 장치와 투자자의 거래 선택, 가격 발견 기능을 살펴봅니다.', '최근 증권시장에서는 AI·반도체 종목 변동성이 주목받으며 투자 위험 관리가 논의되고 있습니다.', 'KB증권 주간 시황 · 2026.11.20', 'https://rdata.kbsec.com/pdf_data/20261120164756967K.pdf', '급격한 쏠림 때 잠시 멈추면 투자자가 정보를 확인하고 무질서한 거래를 줄일 수 있습니다.', '정지 기준이 잦거나 예측하기 어려우면 정상 거래를 방해하고 가격 발견을 늦출 수 있습니다.'],
  ['stock-afterhours', '주식 · 투자환경', '국내 주식의 거래 가능 시간을 더 늘리는 것이 투자자에게 도움이 될까?', '거래 편의와 해외 시장 대응, 개인 투자자의 피로와 유동성 분산을 비교합니다.', '거래시간 확대는 시장 편의뿐 아니라 유동성·감시·시장 인프라에 미치는 영향을 함께 검토해야 합니다.', '한국거래소 시장제도 안내', 'https://www.krx.co.kr/', '직장인과 해외 정보에 대응하는 투자자가 편한 시간에 거래할 수 있습니다.', '거래가 길어지면 개인의 감시 부담과 야간 변동 위험, 거래량 분산이 커질 수 있습니다.'],
  ['stock-buyback', '주식 · 기업', '기업이 매입한 자사주는 원칙적으로 소각하도록 해야 할까?', '주주 환원과 지배구조 투명성, 기업의 자금 운용과 장기 투자 여력을 함께 생각합니다.', '자사주 활용은 주주 환원과 지배구조를 둘러싼 국내 자본시장 논의의 한 축입니다.', '금융위원회 자본시장 정책 자료', 'https://www.fsc.go.kr/', '소각 원칙은 자사주를 경영권 방어에 쓰는 관행을 줄이고 주주 환원을 분명히 합니다.', '일률적 소각은 인수·보상 등 합리적 활용까지 막아 기업의 자금 선택을 제한할 수 있습니다.'],
  ['stock-risk-label', '주식 · 소비자 보호', '고위험 투자상품은 매수 전에 위험 확인 절차를 더 강화해야 할까?', '손실 예방과 투자 접근성, 설명 절차가 형식화될 가능성을 논의합니다.', '투자상품의 복잡성과 손실 위험을 투자자가 이해할 수 있도록 하는 것은 금융소비자 보호의 핵심입니다.', '금융감독원 금융소비자 정보포털', 'https://fine.fss.or.kr/', '추가 확인과 이해도 점검은 상품 특성을 모른 채 큰 손실을 감수하는 일을 줄입니다.', '확인 절차가 지나치면 스스로 판단할 투자자의 선택을 막고 서류 작업만 늘릴 수 있습니다.'],
  ['food-price-label', '요리 · 외식', '외식 메뉴에 중량과 1인분 기준 가격을 함께 표시해야 할까?', '가격 비교의 편리함과 업주의 표시 부담, 메뉴 품질 차이를 어떻게 설명할지 생각해봅니다.', '식품 가격과 외식비 부담은 소비자가 체감하는 생활 물가의 주요 항목입니다.', '통계청 소비자물가 동향', 'https://kostat.go.kr/', '중량과 기준 가격을 알면 가격 인상이나 양 변화를 비교해 합리적으로 고를 수 있습니다.', '조리법과 재료 구성이 다른 메뉴를 단순한 단위 가격으로 비교하면 오해를 부를 수 있습니다.'],
  ['food-shrinkflation', '요리 · 소비자', '식품 용량이 줄면 포장 앞면에 변경 사실을 눈에 띄게 알려야 할까?', '가격을 유지한 용량 조정에 대한 투명성과 제조·유통 비용을 살펴봅니다.', '제품 가격뿐 아니라 용량 변화도 소비자의 실제 구매 비용에 영향을 줍니다.', '한국소비자원 소비자정보', 'https://www.kca.go.kr/', '변경 표시를 의무화하면 소비자가 이전 제품과 비교해 구매를 결정할 수 있습니다.', '표시 방식이 복잡해지면 포장 비용이 늘고 원재료 변화나 계절 조정까지 과도하게 규제할 수 있습니다.'],
  ['food-allergen', '요리 · 안전', '식당 알레르기 정보를 메뉴판과 주문 화면에 의무적으로 표시해야 할까?', '알레르기 사고 예방과 소규모 업장의 관리 부담, 교차오염 안내의 한계를 다룹니다.', '식품 알레르기 정보는 소비자의 안전한 선택에 중요하지만 조리 환경에 따라 교차 접촉 가능성이 달라집니다.', '식품의약품안전처 식품안전나라', 'https://www.foodsafetykorea.go.kr/', '알레르기 유발 재료를 미리 알리면 소비자가 위험을 피하고 필요한 질문을 할 수 있습니다.', '모든 메뉴의 원재료와 교차오염을 실시간 관리하기 어려운 업장에는 기준과 지원이 필요합니다.'],
  ['food-delivery-fee', '요리 · 배달', '배달비와 포장비를 주문 마지막이 아니라 메뉴 선택 때부터 표시해야 할까?', '초기 가격 비교와 소상공인의 가격 유연성, 배달 플랫폼 표시 구조를 살펴봅니다.', '온라인 주문에서 최종 결제 금액은 메뉴 가격 외에 배달·포장 조건에 따라 달라집니다.', '한국소비자원 소비자정보', 'https://www.kca.go.kr/', '처음부터 추가 비용을 알면 소비자가 총액을 비교하고 예상 밖 결제를 피할 수 있습니다.', '거리·시간·주문 규모에 따라 달라지는 비용을 처음부터 고정 표시하면 가격 운영이 경직될 수 있습니다.'],
  ['travel-crowding', '여행 · 지역', '관광객이 몰리는 명소에 예약제나 방문 인원 제한을 도입해야 할까?', '주민의 생활 환경과 방문객의 접근성, 지역 상권의 수입을 함께 고려합니다.', '2026년 방한 관광객이 2천만 명에 가까워지며 관광 수용력과 지역 분산이 주목받고 있습니다.', '제주관광협회 방한 관광객 동향 · 2026.11', 'https://visitjeju.or.kr/comm/other.htm?act=view&seq=59776', '혼잡을 관리하면 주민 불편과 환경 훼손을 줄이고 방문 경험을 개선할 수 있습니다.', '예약·인원 제한은 지역 상권의 기회를 줄이고 여행 접근성을 떨어뜨릴 수 있습니다.'],
  ['travel-visitor-levy', '여행 · 지역', '관광객이 많은 지역은 방문객에게 지역 관리 비용을 부과해도 될까?', '관광 인프라 비용을 이용자가 분담하는 방식과 여행 비용 증가를 논의합니다.', '관광객 증가에 맞춰 교통·환경·공공시설을 관리하는 비용과 혜택의 분배가 쟁점입니다.', '문화체육관광부 관광 동향', 'https://www.mcst.go.kr/', '방문객이 일부 비용을 분담하면 혼잡·청소·보전 인프라를 지속적으로 유지할 수 있습니다.', '부과금은 여행 비용을 올리고 지역 방문을 위축시키며 실제 개선에 쓰이는지 불신을 낳을 수 있습니다.'],
  ['travel-cancel', '여행 · 소비자', '여행 예약 취소 수수료는 출발일보다 예약 단계에서 더 쉽게 비교할 수 있어야 할까?', '사업자의 취소 손실과 소비자의 예측 가능한 환불 권리 사이의 기준을 다룹니다.', '항공·숙박·패키지 상품은 공급자별 취소 조건이 달라 결제 전 비교가 중요합니다.', '한국소비자원 여행 소비자 정보', 'https://www.kca.go.kr/', '수수료와 환불 시점을 한눈에 보여주면 취소 때 분쟁과 예상 밖 손실을 줄일 수 있습니다.', '취소 시점과 공급자의 실제 손실이 다른데 표준 표시가 세부 조건을 단순화할 수 있습니다.'],
  ['travel-local', '여행 · 지역경제', '인기 관광지를 분산하기 위해 지역 교통·숙박 지원을 더 늘려야 할까?', '지역 균형과 관광객의 선택, 지원 예산의 우선순위를 비교합니다.', '관광객 증가와 함께 수도권 외 지역으로 방문과 소비를 연결하는 방안이 논의됩니다.', '문화체육관광부 관광 동향', 'https://www.mcst.go.kr/', '교통과 숙박 지원은 방문객과 소비를 여러 지역으로 나누고 지역 사업자의 기회를 넓힙니다.', '지원이 실제 재방문과 지역 주민의 이익으로 이어지는지 불확실하고 공공 비용이 듭니다.'],
  ['auto-ev-support', '자동차 · 전기차', '전기차 보조금은 차량 가격보다 충전 편의가 부족한 지역에 더 집중해야 할까?', '보급 확대와 지역 간 형평성, 지원 예산의 효과를 생각해봅니다.', '산업부에 따르면 2026년 10월 국내 전기차 판매는 전년 동월보다 81.4% 증가했습니다.', '산업통상부 자동차산업 동향 · 2026.11', 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/172411/view?mno=&pageIndex=1', '충전 기반이 부족한 지역에 지원하면 실제 이용 장벽을 낮추고 보급 기회를 고르게 할 수 있습니다.', '지역별 보조금 차등은 기준이 복잡해지고 차량 가격 지원보다 효과가 작을 수 있습니다.'],
  ['auto-battery-health', '자동차 · 중고차', '중고 전기차를 팔 때 배터리 건강 상태를 표준 방식으로 공개해야 할까?', '구매자의 정보 접근과 진단 비용, 배터리 상태를 단일 수치로 설명할 수 있는지 다룹니다.', '전기차 거래가 늘면서 배터리 잔존 성능과 수리 이력은 구매 판단의 중요한 정보가 됩니다.', '한국교통안전공단 자동차 정보', 'https://www.kotsa.or.kr/', '표준 진단 결과는 구매자와 판매자 사이의 정보 차이를 줄이고 거래 신뢰를 높입니다.', '진단 기준이 실제 사용 조건을 다 담지 못할 수 있고 검사 비용과 수치 해석 부담이 생깁니다.'],
  ['auto-charging', '자동차 · 충전', '전기차 충전 요금은 주차 시간이 아니라 실제 충전량 기준으로 매겨야 할까?', '충전기 회전율과 공정한 요금, 충전 뒤 차량을 옮기기 어려운 상황을 함께 봅니다.', '전기차 이용이 늘며 충전기 이용 규칙과 요금 체계의 편의성이 중요해지고 있습니다.', '환경부 무공해차 통합누리집', 'https://ev.or.kr/', '충전량 기준은 실제 전력 사용과 비용을 연결해 이용자에게 이해하기 쉽습니다.', '충전 후 장시간 점유를 억제하기 어려워 충전 대기와 충전기 회전율이 나빠질 수 있습니다.'],
  ['auto-adas', '자동차 · 안전', '운전자 보조 기능을 켠 차량 사고의 책임 기준을 더 명확히 해야 할까?', '기술의 한계와 운전자 주의 의무, 제조사의 안내 책임을 나눠 생각합니다.', '운전자 보조 기능은 운전을 돕지만 운전자의 주의와 개입이 필요한 기능으로 안내됩니다.', '한국교통안전공단 자동차 안전 안내', 'https://www.kotsa.or.kr/', '기능별 책임과 기록 기준을 분명히 하면 사고 조사와 안전 설계 개선에 도움이 됩니다.', '상황마다 운전자와 시스템의 개입 정도가 달라 책임을 미리 나누면 실제 판단이 어려워질 수 있습니다.'],
  ['life-date-cost', '고민상담 · 관계', '연인 사이 데이트 비용은 번갈아 내기보다 소득에 맞춰 나누는 게 공정할까?', '각자의 형편과 호의, 금전 부담을 솔직하게 이야기하는 방법을 나눕니다.', '관계에서 비용 분담의 공정성은 정답보다 당사자 간 합의와 지속 가능성이 중요합니다.', '생활 토론 주제 · 경험과 관점 나눔', 'https://www.kca.go.kr/', '소득에 맞추면 한쪽의 부담을 줄이고 함께 즐길 수 있는 선택지를 넓힐 수 있습니다.', '소득 공개나 비례 분담이 부담스러울 수 있어 번갈아 내기처럼 단순한 방식이 편할 수 있습니다.'],
  ['life-housework', '고민상담 · 가족', '함께 사는 사람의 집안일은 시간 여유보다 일의 양을 기준으로 나눠야 할까?', '보이지 않는 계획·정리 노동과 각자의 근무시간·돌봄 상황을 함께 살펴봅니다.', '가사 분담은 실제 수행뿐 아니라 계획과 반복 관리까지 포함해 체감 부담이 달라질 수 있습니다.', '여성가족부 가족·생활 자료', 'https://www.mogef.go.kr/', '일의 양과 책임을 분명히 나누면 한 사람이 계속 챙기는 부담을 줄일 수 있습니다.', '근무 형태와 건강·돌봄 상황이 달라 동일한 양을 요구하면 오히려 불공정할 수 있습니다.'],
  ['life-work-chat', '고민상담 · 일상', '퇴근 뒤 업무 메신저 알림을 끄는 권리를 회사가 보장해야 할까?', '업무 연결성과 긴급 대응, 회복 시간과 직장 내 자율성을 다룹니다.', '상시 연결은 업무 편의와 함께 휴식 시간의 경계에 대한 논의를 불러옵니다.', '고용노동부 일·생활 균형 안내', 'https://www.worklife.kr/', '연락 가능한 시간을 정하면 휴식과 가족 시간을 지키고 번아웃을 줄이는 데 도움이 됩니다.', '직무와 고객 상황에 따라 유연한 연락이 필요하며 일괄 차단은 업무 공백을 만들 수 있습니다.']
];

curatedTopics.forEach(([id, category, title, intro, fact, source, sourceUrl, forText, againstText], index) => {
  issues[id] = {
    category, title, intro, facts: [fact, '아래 두 관점은 토론을 위한 요약이며, 각 사안에는 적용 범위와 예외가 있을 수 있습니다.'], source, sourceUrl,
    forArguments: [['기대되는 효과', forText]], againstArguments: [['고려할 점', againstText]],
    cardFor: forText, cardAgainst: againstText,
    demoResults: [38 + (index % 20), 40, 22 - (index % 20)],
    samplePosts: [
      { id: `${id}-sample-for`, stance: '찬성', title: `이 주제에 찬성하는 이유`, author: '생각나눔', content: forText, initialComments: ['다른 상황에서는 어떤 기준이 적절할지도 궁금합니다.'] },
      { id: `${id}-sample-against`, stance: '반대', title: '신중하게 적용해야 한다고 생각합니다', author: '차분한토론', content: againstText, initialComments: ['기대 효과와 함께 비용도 살펴봐야겠습니다.'] }
    ]
  };
});

const editorialStorageKey = `${storagePrefix}editorial-demo-state`;
const adminModeKey = `${storagePrefix}demo-admin`;
const samplePendingDraft = {
  id: 'smart-glasses-privacy',
  category: '기술 · 사생활',
  title: '공공장소에서 촬영하는 AI 스마트안경은 표시를 의무화해야 할까?',
  intro: 'AI 스마트안경이 일상 공간에 등장하면서 촬영을 알아볼 권리와 새로운 기기 사용의 자유가 함께 논의되고 있습니다.',
  facts: [
    'AI 스마트안경은 시험 부정행위 대응뿐 아니라 일상 촬영과 개인정보 보호 문제로도 논의되고 있습니다.',
    '촬영 표시의 실효성, 주변 사람의 동의, 기기 사용자의 표현·이용 권리를 함께 검토할 필요가 있습니다.'
  ],
  source: '연합뉴스 · 2026.11.14',
  sourceUrl: 'https://www.yna.co.kr/view/AKR20261113072900017',
  forText: '촬영 중이라는 점을 주변 사람이 알아볼 수 있어야 대화와 이동 중 사생활을 지키고, 원치 않는 촬영을 피할 선택권을 보장할 수 있습니다.',
  againstText: '표시 의무가 기기 사용과 설계를 과도하게 제한할 수 있고, 표시등만으로 몰래 촬영을 막기 어려워 실효성 있는 기준을 먼저 따져야 합니다.'
};
const additionalPendingDrafts = [
  { id: 'creator-ad-label', category: '연예 · 크리에이터', title: '인플루언서의 협찬·광고 표시는 영상 시작 때도 보여야 할까?', intro: '콘텐츠를 자연스럽게 보는 경험과 광고 여부를 알 권리 사이의 기준을 살펴봅니다.', facts: ['온라인 추천과 광고가 섞이는 콘텐츠에서 경제적 이해관계 표시가 소비자의 판단에 영향을 줍니다.', '표시 위치와 표현 방식이 실제 이용자에게 잘 보이는지 검토할 필요가 있습니다.'], source: '공정거래위원회 표시·광고 안내', sourceUrl: 'https://www.ftc.go.kr/', forText: '영상 앞부분과 추천 구간에 표시하면 시청자가 광고임을 알고 콘텐츠를 평가할 수 있습니다.', againstText: '반복 표시는 시청 경험을 해치고, 짧은 형식이나 여러 플랫폼에 일률적인 기준을 적용하기 어렵습니다.' },
  { id: 'crypto-stablecoin-rewards', category: '가상자산 · 금융', title: '원화 연동 코인에 예치 보상을 제공하는 서비스를 허용해야 할까?', intro: '이용자의 선택과 보상 기회, 예금으로 오인할 위험과 준비자산 투명성을 비교합니다.', facts: ['가상자산 서비스는 예금과 다른 법적·가격 위험을 가질 수 있어 이용자가 구조를 이해해야 합니다.', '보상 제공 방식과 준비자산 공개, 손실 책임 기준은 서비스별로 확인해야 합니다.'], source: '금융위원회 가상자산 정책 자료', sourceUrl: 'https://www.fsc.go.kr/', forText: '위험과 준비자산을 투명하게 공개하면 이용자가 다양한 디지털 금융 서비스를 선택할 수 있습니다.', againstText: '보상이 원금 보장 예금처럼 받아들여질 수 있고, 상환 압력이 커질 때 이용자 손실과 시장 불안이 커질 수 있습니다.' },
  { id: 'stock-app-gamification', category: '주식 · 투자자 보호', title: '주식 앱의 축하 효과·랭킹 기능을 제한해야 할까?', intro: '앱의 사용 편의와 참여를 돕는 설계, 잦은 매매를 부추길 가능성을 논의합니다.', facts: ['투자 앱의 알림·보상·순위 기능은 이용자의 거래 빈도와 판단 환경에 영향을 줄 수 있습니다.', '기능 제한의 효과는 투자자 유형과 실제 거래 자료를 함께 살펴야 합니다.'], source: '금융감독원 금융소비자 정보포털', sourceUrl: 'https://fine.fss.or.kr/', forText: '매매를 게임처럼 느끼게 하는 장치를 줄이면 충동 거래와 과도한 위험 감수를 낮출 수 있습니다.', againstText: '정보 접근과 앱 사용 편의까지 제한하지 않도록 이용자가 알림을 선택하고 끌 수 있게 하는 방식이 더 적절할 수 있습니다.' },
  { id: 'travel-total-price', category: '여행 · 소비자', title: '항공권 검색 결과에 수하물·좌석 비용을 포함한 총액을 먼저 보여야 할까?', intro: '가격 비교의 투명성과 항공사별 선택 서비스, 검색 결과의 단순성을 함께 살펴봅니다.', facts: ['항공권 최종 결제액은 운임 외에 수하물·좌석 지정 등 선택 서비스에 따라 달라질 수 있습니다.', '여행자는 필요한 서비스가 달라 총액 비교와 선택 옵션 표시를 함께 원할 수 있습니다.'], source: '한국소비자원 소비자정보', sourceUrl: 'https://www.kca.go.kr/', forText: '필수·선택 비용을 처음부터 합산해 보여주면 검색 가격과 결제 금액의 차이를 줄일 수 있습니다.', againstText: '짐이나 좌석 선택이 필요 없는 이용자에게 총액 중심 표시는 실제 선택 비용을 높게 보이게 할 수 있습니다.' }
];

const samplePendingDrafts = [samplePendingDraft, ...additionalPendingDrafts];

function loadEditorialState() {
  try {
    const stored = JSON.parse(localStorage.getItem(editorialStorageKey) || 'null');
    if (stored) return { pending: [], history: [], approved: [], archived: [], ...stored };
  } catch (error) {
    console.warn('편성 시연 기록을 불러오지 못했습니다.', error);
  }
  return { pending: samplePendingDrafts, history: [], approved: [], archived: [], activeIssueIds: null };
}

const editorialState = loadEditorialState();
const handledDraftTitles = new Set([...editorialState.history.map((entry) => entry.title), ...editorialState.approved.map((entry) => entry.issue?.title)]);
const handledDraftIds = new Set(editorialState.history.map((entry) => entry.draftId).filter(Boolean));
const pendingDraftIds = new Set(editorialState.pending.map((entry) => entry.id));
samplePendingDrafts.forEach((draft) => {
  if (!pendingDraftIds.has(draft.id) && !handledDraftIds.has(draft.id) && !handledDraftTitles.has(draft.title)) editorialState.pending.push(draft);
});
// Deployment-generated candidates are imported into the private review queue only.
// They remain hidden from public polls until an administrator explicitly approves them.
let deploymentDraftsAdded = false;
const deploymentDrafts = Array.isArray(window.SISEON_DEPLOYMENT_DRAFTS) ? window.SISEON_DEPLOYMENT_DRAFTS : [];
const electionTopicPattern = /선거|후보자|선거운동|공약 비교|투표 절차|투표 결과/;
deploymentDrafts.forEach((draft) => {
  const valid = draft && typeof draft.id === 'string' && typeof draft.category === 'string'
    && typeof draft.title === 'string' && typeof draft.intro === 'string'
    && Array.isArray(draft.facts) && draft.facts.length > 0
    && typeof draft.source === 'string' && /^https:\/\//i.test(draft.sourceUrl || '')
    && typeof draft.forText === 'string' && typeof draft.againstText === 'string'
    && !electionTopicPattern.test(`${draft.category} ${draft.title}`);
  if (!valid || pendingDraftIds.has(draft.id) || handledDraftIds.has(draft.id) || handledDraftTitles.has(draft.title)) return;
  editorialState.pending.push(draft);
  pendingDraftIds.add(draft.id);
  deploymentDraftsAdded = true;
});
editorialState.approved.forEach((entry) => {
  if (entry?.id && entry.issue) issues[entry.id] = entry.issue;
});
let activeIssueIds = Array.isArray(editorialState.activeIssueIds)
  ? editorialState.activeIssueIds.filter((id) => issues[id])
  : Object.keys(issues);
if (!activeIssueIds.length) activeIssueIds = Object.keys(issues);
if (deploymentDraftsAdded) localStorage.setItem(editorialStorageKey, JSON.stringify({ ...editorialState, activeIssueIds }));

let currentAdminPage = 'overview';
let activeDraftId = editorialState.pending[0]?.id || null;
let activeReviewCategory = '전체 분야';
const adminOperationsKey = `${storagePrefix}admin-operations-demo`;
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
  reports: [
    { id: 'r-221', memberId: 'm-1028', nickname: '한쪽만봐', area: '사회 · 복지 토론', summary: '특정 집단을 비하하는 표현이 포함되었다는 신고 (본문 일부 가림)', reason: '혐오·차별 표현', count: 4, status: '미검토', postStatus: '공개' },
    { id: 'r-220', memberId: 'm-1014', nickname: '동네기록자', area: '배달앱 거래조건 토론', summary: '주장 대신 다른 회원을 겨냥한 모욕 표현이 반복되었다는 신고', reason: '인격 모독', count: 3, status: '미검토', postStatus: '공개' },
    { id: 'r-219', memberId: 'm-0997', nickname: '편한말', area: 'AI 음악 토론', summary: '같은 홍보성 문장을 여러 게시물에 반복 게시했다는 신고', reason: '도배·홍보', count: 2, status: '조치 완료', postStatus: '숨김' },
    { id: 'r-218', memberId: 'm-0961', nickname: '오늘의질문', area: '자유 토론', summary: '근거가 불분명한 내용을 사실처럼 단정했다는 신고', reason: '허위 정보 우려', count: 1, status: '미검토', postStatus: '공개' }
  ],
  inquiries: [
    { id: 'q-508', type: '서비스 이용', title: '투표 선택을 바꿀 수 있나요?', sender: '참여자 483', received: '오늘 10:42', status: '미답변' },
    { id: 'q-507', type: '계정', title: '닉네임 변경 문의', sender: '참여자 217', received: '오늘 09:18', status: '미답변' },
    { id: 'q-506', type: '신고 처리', title: '신고한 글의 처리 상태 확인', sender: '참여자 091', received: '어제 17:30', status: '답변 중' },
    { id: 'q-505', type: '서비스 이용', title: '투표가 종료된 뒤 댓글 작성 문의', sender: '참여자 352', received: '어제 16:05', status: '미답변' },
    { id: 'q-504', type: '개인정보', title: '계정 탈퇴와 게시글 처리 요청', sender: '참여자 882', received: '어제 13:22', status: '미답변' },
    { id: 'q-503', type: '서비스 이용', title: '지난 투표 결과 출처 문의', sender: '참여자 110', received: '11.20 18:40', status: '답변 중' },
    { id: 'q-502', type: '기타', title: '접근성 개선 제안', sender: '참여자 039', received: '11.20 15:12', status: '미답변' },
    { id: 'q-501', type: '계정', title: '인증 오류 제보', sender: '참여자 621', received: '11.20 11:01', status: '완료' }
  ],
  partnerships: [
    { id: 'p-088', type: '자료 협력', title: '공공 통계 자료 연계 제안', sender: '데이터연구소', received: '오늘 08:50', status: '미확인' },
    { id: 'p-087', type: '콘텐츠 제휴', title: '균형 토론 콘텐츠 공동 제작', sender: '열린미디어', received: '어제 14:10', status: '검토 중' },
    { id: 'p-086', type: '학술 협력', title: '토론 품질 연구 협력 문의', sender: '사회연구모임', received: '11.20 12:25', status: '미확인' },
    { id: 'p-085', type: '기타 제휴', title: '지역 커뮤니티 협업 문의', sender: '마을네트워크', received: '11.19 16:40', status: '완료' }
  ],
  audit: [],
  hiddenDiscussionPosts: [],
  topicSuggestions: [
    { id: 'suggestion-demo-1', category: '요리 · 소비자', title: '식당 메뉴에 알레르기 정보를 표시해야 할까?', rationale: '외식과 배달을 자주 하는 이용자의 안전과 업장 운영 부담을 함께 생각해볼 수 있습니다.', forText: '알레르기 유발 재료와 교차 접촉 가능성을 미리 알리면 안전한 선택에 도움이 됩니다.', againstText: '재료와 조리 환경이 수시로 달라 작은 업장에 상시 표시를 요구하기 어렵습니다.', sourceUrl: 'https://www.foodsafetykorea.go.kr/', sender: '익명 제안자', interestCount: 18, status: '검토 대기', createdAt: '2026-11-20T09:30:00.000Z' },
    { id: 'suggestion-demo-2', category: '여행 · 지역', title: '관광객이 많은 명소에 방문 인원 예약제를 도입해야 할까?', rationale: '주민 생활 환경과 방문객 편의, 지역 상권의 이해가 함께 걸려 있는 주제입니다.', forText: '혼잡과 환경 훼손을 줄이고 주민의 생활 공간을 지킬 수 있습니다.', againstText: '예약이 어려운 방문객의 접근을 막고 지역 상권의 기회를 줄일 수 있습니다.', sourceUrl: '', sender: '익명 제안자', interestCount: 11, status: '검토 대기', createdAt: '2026-11-19T09:30:00.000Z' }
  ],
  openTalkPosts: [
    { id: 'open-talk-demo-1', category: '생활', title: '배달 용기, 다회용기로 바꾸기 어렵지 않나요?', body: '환경을 생각하면 다회용기가 좋다고 생각하지만 반납 장소가 멀면 잘 쓰지 않게 돼요. 반납 편의가 먼저일까요, 보증금 제도가 먼저일까요?', author: '익명 214', memberRef: 'demo-member-214', status: '공개', createdAt: '2026-11-21T08:00:00.000Z', comments: [] },
    { id: 'open-talk-demo-2', category: '취미', title: '취미는 꾸준히 해야 잘하는 걸까요?', body: '잘해야 한다는 생각 때문에 시작을 미루곤 합니다. 실력이 늘지 않아도 즐거우면 충분하다고 생각하시나요?', author: '익명 087', memberRef: 'demo-member-087', status: '공개', createdAt: '2026-11-20T11:00:00.000Z', comments: [] }
  ],
  announcements: [
    { id: 'notice-respect', category: '운영 원칙', title: '시선은 사람보다 주장에 집중합니다', summary: '근거를 나누고 서로 다른 관점을 존중하는 대화를 지향합니다.', body: '시선은 찬반 의견을 같은 기준으로 소개하고, 참여자가 근거를 살펴볼 수 있도록 운영합니다.\n\n비판은 주장·자료·정책을 대상으로 해 주세요. 의견이 다르다는 이유만으로 상대를 공격하거나 조롱하지 말고, 사실과 해석을 구분해 주세요. 운영진은 양측 의견의 분량과 순서를 균형 있게 관리하고, 오류가 확인되면 정정 내역을 안내합니다.', createdAt: '2026-11-21T09:00:00.000Z', published: true, pinned: true },
    { id: 'notice-pseudonym', category: '이용 안내', title: '익명 닉네임을 사용해도 서로를 비방할 수는 없습니다', summary: '실명 대신 닉네임으로 참여할 수 있으며, 타인을 향한 모욕과 괴롭힘은 금지됩니다.', body: '시선에서는 실명 공개 없이 닉네임으로 투표와 토론에 참여할 수 있습니다. 다만 익명성은 다른 회원을 모욕하거나 괴롭힐 권리를 뜻하지 않습니다.\n\n특정 회원을 겨냥한 욕설·조롱·협박, 집단에 대한 혐오·차별 표현, 주소·연락처 등 개인정보 공개, 반복적인 도배와 광고는 허용되지 않습니다. 위반 게시물은 맥락과 피해 정도를 확인해 숨김 또는 삭제할 수 있습니다.', createdAt: '2026-11-20T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-sanctions', category: '신고와 제재', title: '신고 접수와 단계별 조치 기준을 안내합니다', summary: '신고 내용을 검토한 뒤 위반 정도와 반복 여부에 따라 조치합니다.', body: '문제가 있는 게시글의 신고하기를 눌러 사유와 필요한 설명을 보내 주세요. 신고자 정보는 신고 대상 회원에게 공개하지 않습니다. 신고만으로 자동 제재하지 않고, 게시글과 앞뒤 대화의 맥락을 운영자가 확인합니다.\n\n조치는 위반 아님 처리, 안내 또는 경고, 게시글 숨김·삭제, 반복적이거나 중대한 위반에 대한 일시 이용 정지 순으로 검토합니다. 협박, 개인정보 노출, 혐오·차별 등 피해가 큰 사안은 즉시 임시 제한할 수 있습니다. 조치 사유는 기록하며, 회원 문의를 통해 재검토를 요청할 수 있습니다.', createdAt: '2026-11-19T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-voting', category: '투표 안내', title: '투표 결과는 투표한 뒤 확인할 수 있습니다', summary: '이슈마다 한 번 투표하고, 이후 결과와 토론을 확인할 수 있습니다.', body: '인증된 계정은 각 이슈에 한 번 투표할 수 있습니다. 투표 전에는 해당 이슈의 집계 결과를 볼 수 없고, 투표한 뒤 결과와 토론 글을 확인할 수 있습니다.\n\n각 투표는 30일간 진행된 뒤 지난 투표 보관함으로 이동합니다. 종료 후 6개월이 지나면 읽기 전용으로 전환되어 새 글과 댓글을 작성할 수 없습니다. 화면에 표시되는 투표 결과는 시선 참여자의 의견이며, 전체 국민의 여론이나 과학적 여론조사를 뜻하지 않습니다.', createdAt: '2026-11-18T09:00:00.000Z', published: true, pinned: false },
    { id: 'notice-reporting', category: '안전과 개인정보', title: '안전한 토론을 위해 신고와 개인정보를 보호합니다', summary: '신고 내용은 운영 검토에만 사용하고 개인정보 노출 게시물은 신속히 처리합니다.', body: '다른 회원의 전화번호, 주소, 계정 정보 등 개인을 식별하거나 찾아낼 수 있는 정보를 허락 없이 게시하지 마세요. 개인정보가 노출된 게시물은 피해 확산을 막기 위해 우선 숨긴 뒤 검토할 수 있습니다.\n\n신고 내용과 신고자 정보는 운영 업무에 필요한 범위에서만 확인합니다. 계정 정보 처리와 보관에 관한 상세한 내용은 개인정보 처리방침에서 안내합니다. 긴급한 위협이나 안전 문제가 있으면 신고와 함께 회원 문의로 알려 주세요.', createdAt: '2026-11-17T09:00:00.000Z', published: true, pinned: false }
  ]
};

function loadAdminOperations() {
  try {
    const stored = JSON.parse(localStorage.getItem(adminOperationsKey) || 'null');
    if (stored) {
      if (Array.isArray(stored.announcements)) {
        stored.announcements = stored.announcements.map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? value.replaceAll('두견', '시선') : value])));
      }
      return { ...JSON.parse(JSON.stringify(seedAdminOperations)), ...stored };
    }
  } catch (error) { console.warn('운영 시연 데이터를 불러오지 못했습니다.', error); }
  return JSON.parse(JSON.stringify(seedAdminOperations));
}
const adminOperations = loadAdminOperations();
let editingAnnouncementId = null;
const homeTalkExamples = [
  { id: 'home-talk-example-1', category: '여행', title: '여행 일정은 빽빽하게 짜는 편인가요?', body: '명소를 최대한 둘러보는 일정과 현지에서 여유롭게 보내는 여행 중 어떤 방식이 더 만족스러우셨나요?', author: '예시 글', status: '공개', createdAt: '2026-11-18T10:00:00.000Z', comments: [], sample: true },
  { id: 'home-talk-example-2', category: '관계', title: '친한 사이에도 약속 시간을 꼭 지켜야 할까요?', body: '가까운 사이일수록 편하게 이해할 수 있다는 생각과, 서로의 시간을 존중해야 한다는 생각이 있어요. 어디까지가 배려일까요?', author: '예시 글', status: '공개', createdAt: '2026-11-17T10:00:00.000Z', comments: [], sample: true },
  { id: 'home-talk-example-3', category: '문화', title: '영화는 개봉 직후 극장에서 보는 편이 좋을까요?', body: '큰 화면과 관객 반응을 즐기는 경험, 집에서 편한 시간에 보는 경험 중 어떤 쪽을 더 선호하세요?', author: '예시 글', status: '공개', createdAt: '2026-11-16T10:00:00.000Z', comments: [], sample: true },
  { id: 'home-talk-example-4', category: '생활', title: '동네 가게의 일회용품 사용을 줄이려면 무엇이 먼저일까요?', body: '다회용기 선택지를 늘리는 일과 반납·세척 시스템을 마련하는 일 중 무엇이 더 효과적일지 이야기해봐요.', author: '예시 글', status: '공개', createdAt: '2026-11-15T10:00:00.000Z', comments: [], sample: true },
  { id: 'home-talk-example-5', category: '취미', title: '취미를 수익으로 연결하면 더 즐거워질까요?', body: '좋아하는 일을 일이나 부업으로 발전시키는 즐거움과, 부담 없이 취미로 남겨두는 편안함을 비교해보고 싶어요.', author: '예시 글', status: '공개', createdAt: '2026-11-14T10:00:00.000Z', comments: [], sample: true }
];
const homeSuggestionExamples = [
  { id: 'home-suggestion-example-1', category: '자동차·교통', title: '아파트 단지 안 배달 오토바이 속도를 더 엄격히 제한해야 할까?', rationale: '보행자 안전과 배달 노동자의 이동 효율을 함께 살펴볼 수 있습니다.', forText: '보행자와 어린이의 안전을 위해 단지 안에서는 더 낮은 속도 기준이 필요합니다.', againstText: '획일적 제한은 단지 구조와 배달 동선을 고려하지 못해 불편과 지연을 키울 수 있습니다.', sourceUrl: '', sender: '예시 제안', interestCount: 6, status: '검토 대기', createdAt: '2026-11-18T09:30:00.000Z', sample: true },
  { id: 'home-suggestion-example-2', category: '기술·AI', title: '생성형 AI 결과물임을 플랫폼에서 표시해야 할까?', rationale: '창작 도구의 자유와 이용자가 콘텐츠 출처를 알 권리를 함께 논의할 수 있습니다.', forText: '표시는 이용자가 진위를 판단하고 창작 과정의 맥락을 이해하는 데 도움이 됩니다.', againstText: '표시 기준이 모호하면 일반 편집 도구까지 규제하거나 창작자의 표현을 위축시킬 수 있습니다.', sourceUrl: '', sender: '예시 제안', interestCount: 9, status: '검토 대기', createdAt: '2026-11-17T09:30:00.000Z', sample: true },
  { id: 'home-suggestion-example-3', category: '요리·식품', title: '배달 음식의 기본 반찬은 주문 단계에서 제외할 수 있어야 할까?', rationale: '음식물 쓰레기와 포장 부담을 줄이는 방법, 이용 편의 사이의 선택을 살펴봅니다.', forText: '원하지 않는 반찬을 줄이면 음식물 쓰레기와 포장재를 아낄 수 있습니다.', againstText: '선택 단계가 복잡해지고 기본 구성이 달라져 매장 운영과 주문 경험에 혼란이 생길 수 있습니다.', sourceUrl: '', sender: '예시 제안', interestCount: 4, status: '검토 대기', createdAt: '2026-11-16T09:30:00.000Z', sample: true },
  { id: 'home-suggestion-example-4', category: '여행', title: '인기 관광지의 입장 시간을 예약제로 운영해야 할까?', rationale: '혼잡 완화와 현장 방문의 자유, 지역 상권의 영향을 비교해볼 수 있습니다.', forText: '방문객을 분산하면 대기 시간을 줄이고 문화재와 주변 환경을 보호할 수 있습니다.', againstText: '예약이 어려운 사람의 접근을 제한하고 즉흥 여행의 편의를 낮출 수 있습니다.', sourceUrl: '', sender: '예시 제안', interestCount: 8, status: '검토 대기', createdAt: '2026-11-15T09:30:00.000Z', sample: true },
  { id: 'home-suggestion-example-5', category: '반려동물', title: '반려동물 동반 식당은 별도 구역을 의무적으로 마련해야 할까?', rationale: '반려인과 비반려인의 이용 편의, 위생·안전 관리 기준을 함께 다룰 수 있습니다.', forText: '구역을 나누면 반려인과 비반려인이 서로 편안하게 공간을 이용할 수 있습니다.', againstText: '작은 매장은 공간과 비용 부담이 커지고, 업종별 차이를 반영하기 어렵습니다.', sourceUrl: '', sender: '예시 제안', interestCount: 5, status: '검토 대기', createdAt: '2026-11-14T09:30:00.000Z', sample: true }
];

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
  let alias = localStorage.getItem(`${storagePrefix}anonymous-alias`);
  if (!alias) { alias = `익명 ${String(Math.floor(Math.random() * 900) + 100)}`; localStorage.setItem(`${storagePrefix}anonymous-alias`, alias); }
  return alias;
}

function renderOpenTalkList() {
  const list = document.querySelector('#openTalkList');
  const unavailable = new Set(adminOperations.reports.filter((item) => item.issueId === 'open-talk' && item.postStatus !== '공개').map((item) => item.postId));
  const posts = boardOpenTalkPosts().filter((post) => !unavailable.has(post.id));
  document.querySelector('#openTalkCount').textContent = `${posts.length}개 글`;
  list.innerHTML = posts.map((post) => `<article class="open-talk-card open-talk-list-row"><div class="open-talk-meta"><span>${escapeAdminHtml(post.category)}</span>${post.sample ? '<em class="suggestion-status">예시</em>' : ''}<time>${new Date(post.createdAt).toLocaleDateString('ko-KR')}</time></div><button type="button" class="open-talk-title-button" data-open-talk-open="${escapeAdminHtml(post.id)}">${escapeAdminHtml(post.title)} <span>상세 보기 →</span></button><div class="open-talk-row-foot">${post.sample ? '예시 글' : escapeAdminHtml(post.author)} · 댓글 ${(post.comments || []).length}개</div></article>`).join('') || '<div class="community-empty">아직 공개된 글이 없습니다. 첫 대화를 시작해 보세요.</div>';
}

function openOpenTalkDetail(id) {
  const post = boardOpenTalkPosts().find((item) => item.id === id);
  if (!post) return;
  document.querySelector('#openTalkBoardContent').classList.add('hidden');
  const detail = document.querySelector('#openTalkDetail');
  detail.classList.remove('hidden');
  detail.dataset.openTalkId = post.id;
  detail.innerHTML = `<button type="button" class="announcement-detail-back" data-open-talk-detail-back>← 자유토론 목록</button><div class="open-talk-detail-card"><div class="open-talk-meta"><span>${escapeAdminHtml(post.category)}</span><b>${post.sample ? '예시 글' : escapeAdminHtml(post.author)}</b><time>${new Date(post.createdAt).toLocaleDateString('ko-KR')}</time></div><h1>${escapeAdminHtml(post.title)}</h1>${post.sample ? '<p class="suggestion-example-note">화면 구성을 위한 예시 글입니다.</p>' : ''}<p class="open-talk-detail-body">${escapeAdminHtml(post.body)}</p><div class="open-talk-detail-comments"><h2>댓글 ${(post.comments || []).length}개</h2>${(post.comments || []).map((comment) => `<p><b>${escapeAdminHtml(comment.author)}</b>${escapeAdminHtml(comment.text)}</p>`).join('') || '<p class="home-no-comments">아직 댓글이 없습니다.</p>'}</div>${post.sample ? '' : `<form class="open-talk-comment-form"><input name="comment" maxlength="500" required placeholder="익명으로 댓글 남기기"/><button type="submit">등록</button></form><button type="button" class="open-talk-report" data-open-talk-report>신고하기</button>`}</div>`;
}

function renderTopicSuggestions() {
  const list = document.querySelector('#topicSuggestionList');
  const interested = new Set(readLocalList(`${storagePrefix}topic-interests`));
  const suggestions = boardTopicSuggestions();
  document.querySelector('#topicSuggestionCount').textContent = `${suggestions.length}개 제안`;
  list.innerHTML = suggestions.map((item) => `<article class="topic-suggestion-row"><div class="open-talk-meta"><span>${escapeAdminHtml(item.category)}</span>${item.sample ? '<em class="suggestion-status">예시</em>' : ''}<time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time></div><button type="button" class="topic-suggestion-title" data-topic-suggestion-open="${escapeAdminHtml(item.id)}">${escapeAdminHtml(item.title)} <span>상세 보기 →</span></button><div class="suggestion-footer"><small>${item.sample ? '예시 제안' : '이용자 제안'}</small><button type="button" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>토론해 보고 싶어요 · ${item.interestCount}</button></div></article>`).join('') || '<div class="community-empty">아직 등록된 제안이 없습니다.</div>';
}

function openTopicSuggestionDetail(id) {
  const item = boardTopicSuggestions().find((suggestion) => suggestion.id === id);
  if (!item) return;
  const interested = new Set(readLocalList(`${storagePrefix}topic-interests`));
  document.querySelector('#topicSuggestionBoardContent').classList.add('hidden');
  const detail = document.querySelector('#topicSuggestionDetail');
  detail.classList.remove('hidden');
  detail.innerHTML = `<button type="button" class="announcement-detail-back" data-suggestion-detail-back>← 제안 목록</button><div class="topic-suggestion-detail-card"><div class="open-talk-meta"><span>${escapeAdminHtml(item.category)}</span><b>${item.sample ? '예시 제안' : escapeAdminHtml(item.sender || '익명 제안자')}</b><time>${new Date(item.createdAt).toLocaleDateString('ko-KR')}</time></div><h1>${escapeAdminHtml(item.title)}</h1>${item.sample ? '<p class="suggestion-example-note">화면 구성을 위한 예시 제안입니다.</p>' : ''}<p class="suggestion-detail-rationale">${escapeAdminHtml(item.rationale)}</p><div class="suggestion-balance"><p><b>가능한 찬성 관점</b>${escapeAdminHtml(item.forText)}</p><p><b>가능한 반대 관점</b>${escapeAdminHtml(item.againstText)}</p></div>${safeHttpsUrl(item.sourceUrl) ? `<a class="candidate-source" href="${escapeAdminHtml(safeHttpsUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">참고 출처 열기 ↗</a>` : ''}<div class="suggestion-footer"><small>현재 관심 ${item.interestCount}명 · 관심 수는 편집팀 검토의 참고 자료입니다.</small><button type="button" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>${interested.has(item.id) ? '관심 표시됨' : '토론해 보고 싶어요'} · ${item.interestCount}</button></div></div>`;
}

function toggleTopicSuggestionInterest(id) {
  const item = adminOperations.topicSuggestions.find((suggestion) => suggestion.id === id);
  const interested = new Set(readLocalList(`${storagePrefix}topic-interests`));
  if (!item || item.status !== '검토 대기') return;
  if (interested.has(item.id)) { interested.delete(item.id); item.interestCount = Math.max(0, item.interestCount - 1); }
  else { interested.add(item.id); item.interestCount += 1; }
  localStorage.setItem(`${storagePrefix}topic-interests`, JSON.stringify([...interested]));
  saveAdminOperations();
  renderHomeCommunityBoard();
  renderTopicSuggestions();
  if (!document.querySelector('#topicSuggestionDetail').classList.contains('hidden')) openTopicSuggestionDetail(id);
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
  const interested = new Set(readLocalList(`${storagePrefix}topic-interests`));
  suggestionsBoard.innerHTML = filteredSuggestions.map((item) => `<article class="home-suggestion-row"><div class="home-suggestion-row-meta"><span>${escapeAdminHtml(item.category)}</span>${item.sample ? '<em>예시</em>' : ''}</div><button type="button" class="home-suggestion-title" data-topic-suggestion-open="${escapeAdminHtml(item.id)}">${escapeAdminHtml(item.title)}</button><button type="button" class="home-suggestion-interest" data-interest-id="${escapeAdminHtml(item.id)}" ${interested.has(item.id) ? 'class="interested"' : ''} ${item.sample || item.status !== '검토 대기' ? 'disabled' : ''}>토론해 보고 싶어요 · ${item.interestCount}</button></article>`).join('') || '<div class="community-empty">이 분야에 아직 제안이 없습니다.</div>';
}

function showHomeCommunityBoard(board) {
  homeView.classList.remove('hidden');
  issueView.classList.add('hidden'); announcementsView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  closeSiteMap();
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
document.querySelector('#communityBoards').addEventListener('submit', (event) => {
  const form = event.target.closest('.open-talk-comment-form');
  if (!form) return;
  event.preventDefault();
  if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
  const post = adminOperations.openTalkPosts.find((item) => item.id === form.closest('[data-open-talk-id]')?.dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim();
  if (!post || !text) return;
  post.comments ||= [];
  post.comments.push({ author: getDemoAnonymousAlias(), text });
  saveAdminOperations();
  renderHomeCommunityBoard();
  renderOpenTalkList();
});
document.querySelector('#communityBoards').addEventListener('click', (event) => {
  const interestButton = event.target.closest('[data-interest-id]');
  if (!interestButton) return;
  toggleTopicSuggestionInterest(interestButton.dataset.interestId);
});

document.querySelectorAll('[data-community-home]').forEach((button) => button.addEventListener('click', () => {
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); homeView.classList.remove('hidden'); setTopNavActive('polls'); window.scrollTo({ top: 0, behavior: 'instant' });
}));
document.querySelector('#openTalkForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
  adminOperations.openTalkPosts.unshift({ id: `talk-${Date.now()}`, category: values.category, title: values.title.trim(), body: values.body.trim(), author: getDemoAnonymousAlias(), memberRef: 'demo-current-account', status: '공개', createdAt: new Date().toISOString(), comments: [] });
  saveAdminOperations(); form.reset(); renderOpenTalkList(); renderHomeCommunityBoard(); showUserActionToast('익명 글이 게시됐습니다.');
});

document.querySelector('#openTalkList').addEventListener('submit', (event) => {
  const form = event.target.closest('.open-talk-comment-form'); if (!form) return;
  event.preventDefault();
  if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
  const card = form.closest('[data-open-talk-id]'); const post = adminOperations.openTalkPosts.find((item) => item.id === card.dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim(); if (!post || !text) return;
  post.comments ||= []; post.comments.push({ author: getDemoAnonymousAlias(), text }); saveAdminOperations(); renderOpenTalkList(); renderHomeCommunityBoard();
});
document.querySelector('#openTalkList').addEventListener('click', (event) => {
  const detailButton = event.target.closest('[data-open-talk-open]');
  if (detailButton) { openOpenTalkDetail(detailButton.dataset.openTalkOpen); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
  if (event.target.closest('[data-open-talk-report]')) {
    if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
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
    if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
    const post = adminOperations.openTalkPosts.find((item) => item.id === document.querySelector('#openTalkDetail').dataset.openTalkId);
    if (!post) return;
    pendingReportContext = { issueId: 'open-talk', postId: post.id, postTitle: post.title, author: post.author, memberRef: post.memberRef };
    document.querySelector('#reportTargetTitle').textContent = `“${post.title}” · ${post.author}`; document.querySelector('#userReportForm').reset(); document.querySelector('#userReportDialog').showModal();
  }
});
document.querySelector('#openTalkDetail').addEventListener('submit', (event) => {
  const form = event.target.closest('.open-talk-comment-form');
  if (!form) return;
  event.preventDefault();
  if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
  const post = adminOperations.openTalkPosts.find((item) => item.id === document.querySelector('#openTalkDetail').dataset.openTalkId);
  const text = new FormData(form).get('comment')?.trim();
  if (!post || !text) return;
  post.comments ||= [];
  post.comments.push({ author: getDemoAnonymousAlias(), text });
  saveAdminOperations();
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

document.querySelector('#topicSuggestionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (localStorage.getItem(authKey) !== 'true') { openLogin(); return; }
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
  if (/(선거|대선|총선|지방선거|공천)/.test(values.title)) { showUserActionToast('선거 관련 주제는 제안 대상에서 제외됩니다.'); return; }
  adminOperations.topicSuggestions.unshift({ id: `suggestion-${Date.now()}`, category: values.category, title: values.title.trim(), rationale: values.rationale.trim(), forText: values.forText.trim(), againstText: values.againstText.trim(), sourceUrl: safeHttpsUrl(values.sourceUrl), sender: '익명 제안자', memberRef: 'demo-current-account', interestCount: 0, status: '검토 대기', createdAt: new Date().toISOString() });
  saveAdminOperations(); form.reset(); renderTopicSuggestions(); renderHomeCommunityBoard(); showUserActionToast('주제 제안을 접수했습니다.');
});

function sortedPublicAnnouncements() {
  return adminOperations.announcements.filter((item) => item.published).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt) - new Date(a.createdAt));
}

function renderAnnouncementTicker() {
  const item = sortedPublicAnnouncements()[0];
  const title = document.querySelector('#announcementTickerTitle');
  const ticker = document.querySelector('#announcementTicker');
  if (!ticker || !title) return;
  if (!item) { ticker.classList.add('hidden'); return; }
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

function openAnnouncements(id = null) {
  setTopNavActive('announcements');
  homeView.classList.add('hidden'); issueView.classList.add('hidden'); archiveView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  announcementsView.classList.remove('hidden');
  renderAnnouncementList();
  if (id) openAnnouncementDetail(id); else backAnnouncementList();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function openAnnouncementDetail(id) {
  const item = sortedPublicAnnouncements().find((entry) => entry.id === id);
  if (!item) return backAnnouncementList();
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
function showArchiveBoard() {
  closeSiteMap();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  homeView.classList.add('hidden'); issueView.classList.add('hidden'); announcementsView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); adminView.classList.add('hidden');
  archiveView.classList.remove('hidden');
  setTopNavActive('archive');
  renderEditorialArchives();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.querySelectorAll('[data-open-archive]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); showArchiveBoard(); }));
document.querySelectorAll('.desktop-nav [data-nav-key]:not([data-open-announcements]):not([data-open-archive]), .site-map-panel [data-nav-key]:not([data-open-announcements]):not([data-open-archive])').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const key = link.dataset.navKey;
  if (key === 'open-talk' || key === 'suggestions') { showHomeCommunityBoard(key); return; }
  setTopNavActive(key);
  closeSiteMap();
  document.querySelector('.desktop-nav').classList.remove('mobile-open');
  announcementsView.classList.add('hidden'); archiveView.classList.add('hidden'); openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden'); issueView.classList.add('hidden'); adminView.classList.add('hidden'); homeView.classList.remove('hidden');
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
document.querySelector('#announcementBackHome').addEventListener('click', () => {
  announcementsView.classList.add('hidden'); homeView.classList.remove('hidden'); setTopNavActive('polls'); window.scrollTo({ top: 0, behavior: 'instant' });
});
document.querySelector('#archiveBackHome').addEventListener('click', goHome);
document.querySelector('#announcementListTop').addEventListener('click', backAnnouncementList);
document.querySelector('#announcementList').addEventListener('click', (event) => {
  const link = event.target.closest('[data-announcement-id]'); if (link) { event.preventDefault(); openAnnouncementDetail(link.dataset.announcementId); }
});
document.querySelector('#announcementDetailView').addEventListener('click', (event) => { if (event.target.closest('#announcementDetailBack')) backAnnouncementList(); });

function saveAdminOperations() {
  localStorage.setItem(adminOperationsKey, JSON.stringify(adminOperations));
}

function logAdminAction(action, target, reason = '') {
  adminOperations.audit.unshift({ action, target, reason, at: new Date().toISOString(), operator: '운영 관리자' });
  saveAdminOperations();
}

function saveEditorialState() {
  editorialState.activeIssueIds = activeIssueIds;
  localStorage.setItem(editorialStorageKey, JSON.stringify(editorialState));
}

function getIssueData(issueId) {
  return issues[issueId] || archivedSampleIssues[issueId] || null;
}

function getIssueArchiveRecord(issueId) {
  if (archivedSampleIssues[issueId]) {
    const archivedAt = ({ 'archive-public-bikes': '2026-10-31T23:59:59+09:00', 'archive-market-closure': '2026-10-15T23:59:59+09:00', 'archive-pet-registration': '2026-09-30T23:59:59+09:00' })[issueId];
    return { id: issueId, archivedAt };
  }
  return editorialState.archived.find((record) => record.id === issueId) || null;
}

function voteKey(issueId = activeIssueId) {
  return `${storagePrefix}vote:${issueId}`;
}

function syncSeoMetadata(issueId = null, historyMode = 'none') {
  const issue = issueId ? getIssueData(issueId) : null;
  const normalizedPath = window.location.pathname.replace(/\/index\.html$/i, '/');
  const baseUrl = new URL(normalizedPath, window.location.origin);
  if (issue) baseUrl.searchParams.set('issue', issueId);
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
    ? { '@context': 'https://schema.org', '@type': 'WebPage', name: issue.title, description, url: canonicalUrl, isPartOf: { '@type': 'WebSite', name: '시선', url: websiteUrl }, about: { '@type': 'Thing', name: issue.category } }
    : { '@context': 'https://schema.org', '@type': 'WebSite', name: '시선', url: websiteUrl, description };
  document.querySelector('#seoStructuredData').textContent = JSON.stringify(schema);
  if (historyMode === 'push') window.history.pushState({ issueId }, '', canonicalUrl);
  if (historyMode === 'replace') window.history.replaceState({ issueId }, '', canonicalUrl);
}

function openIssue(issueId, historyMode = 'push') {
  const issue = getIssueData(issueId);
  if (!issue) return;
  const archiveRecord = getIssueArchiveRecord(issueId);
  activeIssueId = issueId;
  activeIssueIsArchived = Boolean(archiveRecord);
  const readOnlyAt = archiveRecord?.archivedAt ? new Date(archiveRecord.archivedAt) : null;
  if (readOnlyAt && !Number.isNaN(readOnlyAt.getTime())) readOnlyAt.setMonth(readOnlyAt.getMonth() + 6);
  activeIssueIsReadOnly = Boolean(readOnlyAt && Date.now() >= readOnlyAt.getTime());
  setTopNavActive('polls');
  syncSeoMetadata(issueId, historyMode);
  renderIssueContent();
  homeView.classList.add('hidden');
  document.querySelector('#adminView').classList.add('hidden');
  announcementsView?.classList.add('hidden'); archiveView?.classList.add('hidden');
  openTalkView?.classList.add('hidden'); topicSuggestionsView?.classList.add('hidden');
  issueView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderVoteState();
}

function openLogin() {
  if (!loginDialog.open) loginDialog.showModal();
}

function castDemoVote(choice) {
  localStorage.setItem(voteKey(), choice);
  pendingVote = null;
  renderVoteState();
}

function stanceInfo(choice) {
  if (choice === '찬성') return { className: 'for', label: '찬성 의견', icon: '+' };
  if (choice === '반대') return { className: 'against', label: '반대 의견', icon: '−' };
  return { className: 'hold', label: '판단 보류', icon: '…' };
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
  const savedComments = readLocalList(savedCommentsKey(activeIssueId, post.id));
  const commentCount = initialComments.length + savedComments.length;
  meta.dataset.commentCount = String(commentCount);
  meta.textContent = `${post.author || '시연 사용자'} · 댓글 ${commentCount} · 시연 글`;

  const postTools = document.createElement('div');
  postTools.className = 'discussion-post-tools';
  const reportButton = document.createElement('button');
  reportButton.type = 'button';
  reportButton.className = 'post-report-button';
  reportButton.dataset.reportPost = 'true';
  reportButton.textContent = '신고하기';
  reportButton.setAttribute('aria-label', `${post.title} 게시글 신고하기`);
  postTools.append(meta, reportButton);

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
  const facts = issue.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('');
  const argumentCards = (items, side, title) => `<article class="argument-card ${side}"><h3><span>${side === 'for' ? '+' : '−'}</span> ${escapeHtml(title)}</h3><div class="argument-body">${items.map(([heading, text], index) => `<b>0${index + 1}. ${escapeHtml(heading)}</b><p>${escapeHtml(text)}</p>`).join('')}<small>각 항목은 토론용 관점이며 사실은 출처에서 확인해 주세요.</small></div></article>`;
  const [forPercent, againstPercent, holdPercent] = issue.demoResults;
  const detail = document.querySelector('#issueView .issue-content');
  detail.innerHTML = `
    <div class="issue-meta"><span class="category">${escapeHtml(issue.category)}</span><span>${activeIssueIsArchived ? `${activeIssueIsReadOnly ? '지난 투표 · 읽기 전용' : '지난 투표 · 보관 중'}${archivedDate ? ` · 보관 ${archivedDate}` : ''}` : '30일 투표'}</span><span>·</span><span>읽는 시간 3분</span></div>
    <h1>${escapeHtml(issue.title)}</h1><p class="issue-intro">${escapeHtml(issue.intro)}</p>
    <section class="facts-card"><div class="card-eyebrow">먼저 확인된 사실</div><h2>공통으로 확인할 내용</h2><ul>${facts}</ul><p>확인 가능한 사실과 각 입장의 해석을 구분합니다. <a class="candidate-source" href="${escapeHtml(issue.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issue.source)} ↗</a></p></section>
    <h2 class="subhead">양쪽 주장을 비교해보세요</h2><div class="arguments">${argumentCards(issue.forArguments, 'for', '찬성 측 주장')}${argumentCards(issue.againstArguments, 'against', '반대 측 주장')}</div>
    <section class="vote-card"><div class="card-eyebrow">${activeIssueIsArchived ? 'ARCHIVE RESULTS' : 'YOUR VOICE'}</div><h2>${activeIssueIsArchived ? '지난 투표 결과' : '당신의 생각은 어떤가요?'}</h2><p>${activeIssueIsArchived ? '투표가 종료된 주제의 결과와 토론 기록입니다.' : '이 이슈에 한 번 투표할 수 있어요. 투표 전에는 결과와 토론 글을 볼 수 없습니다.'}</p><div class="vote-options ${activeIssueIsArchived ? 'hidden' : ''}"><button data-vote="찬성" class="for"><span>+</span> 찬성</button><button data-vote="반대" class="against"><span>−</span> 반대</button><button data-vote="판단 보류" class="hold"><span>…</span> 판단 보류</button></div><div id="voteMessage" class="vote-message">${activeIssueIsArchived ? '지난 투표 결과와 토론을 보고 있습니다.' : '투표 후 결과와 토론이 열립니다.'}</div><div id="postVoteResults" class="${activeIssueIsArchived ? '' : 'hidden'}"><div class="result-heading"><strong>시연 집계 (예시)</strong><span>실제 투표 데이터가 아닙니다</span></div><div class="result-bar"><i style="width:${forPercent}%"></i><i style="width:${againstPercent}%"></i><i style="width:${holdPercent}%"></i></div><div class="result-labels"><b>찬성 ${forPercent}%</b><b>반대 ${againstPercent}%</b><b>보류 ${holdPercent}%</b></div><small>실제 결과는 서버와 투표 데이터 연동 후 표시됩니다.</small></div></section>
    <section class="discussion hidden" id="discussionSection"><div class="discussion-title"><div class="card-eyebrow">COMMUNITY VOICES</div><h2>이 이슈의 토론</h2><p class="discussion-demo-note">입장 글과 질문·자료·정정 요청을 나누어 살펴보세요.</p></div><div class="tabs"><button class="active" data-discussion-filter="all">전체</button><button data-discussion-filter="for">찬성 입장</button><button data-discussion-filter="against">반대 입장</button><button data-discussion-filter="question">질문 · 자료</button><button data-discussion-filter="correction">정정 요청</button></div><div id="discussionPosts" class="discussion-post-list"></div><button class="primary-button write-button" id="writeButton">의견 남기기 <span>→</span></button></section>`;
  const postList = document.querySelector('#discussionPosts');
  const unavailablePostIds = new Set([...adminOperations.reports.filter((report) => report.issueId === activeIssueId && report.postStatus !== '공개').map((report) => report.postId), ...adminOperations.hiddenDiscussionPosts]);
  const extraCommunityPosts = [
    { id: `${activeIssueId}-sample-question`, stance: '판단 보류', kind: 'question', title: '이 주제에서 가장 먼저 확인해야 할 조건은 무엇인가요?', author: '오늘의질문', content: `${issue.intro}에서 빠뜨리기 쉬운 기준이나 궁금한 점을 함께 적어주세요.`, initialComments: [] },
    { id: `${activeIssueId}-sample-source`, stance: '판단 보류', kind: 'source', title: '주제와 관련된 원문 자료를 공유합니다', author: '자료찾는사람', content: `이 이슈의 공통 사실과 배경을 더 살펴볼 수 있는 참고 출처입니다.`, sourceUrl: issue.sourceUrl, initialComments: [] }
  ];
  [...readLocalList(savedPostsKey(activeIssueId)), ...issue.samplePosts, ...extraCommunityPosts]
    .filter((post) => !unavailablePostIds.has(post.id))
    .forEach((post) => postList.append(createDiscussionPost(post)));
  applyDiscussionFilter('all');
  if (activeIssueIsReadOnly) {
    document.querySelectorAll('#discussionPosts .comment-form').forEach((form) => form.classList.add('hidden'));
  }
}

function applyDiscussionFilter(filter) {
  document.querySelectorAll('#discussionSection [data-discussion-filter]').forEach((button) => button.classList.toggle('active', button.dataset.discussionFilter === filter));
  document.querySelectorAll('#discussionPosts .discussion-post').forEach((post) => {
    const kind = post.dataset.kind; const stance = post.dataset.stance;
    const show = filter === 'all' || (filter === 'for' && stance === '찬성' && kind === 'opinion') || (filter === 'against' && stance === '반대' && kind === 'opinion') || (filter === 'question' && ['question','source'].includes(kind)) || (filter === 'correction' && kind === 'correction');
    post.classList.toggle('hidden', !show);
  });
}

function renderVoteState() {
  if (!activeIssueId) return;
  if (activeIssueIsArchived) {
    document.querySelector('#postVoteResults').classList.remove('hidden');
    document.querySelector('#discussionSection').classList.remove('hidden');
    document.querySelectorAll('#issueView .vote-options').forEach((options) => options.classList.add('hidden'));
    document.querySelector('#voteMessage').textContent = activeIssueIsReadOnly
      ? '보관 후 6개월이 지나 읽기 전용으로 열람 중입니다.'
      : '투표가 종료된 주제입니다. 결과와 토론을 확인할 수 있습니다.';
    const writeButton = document.querySelector('#writeButton');
    writeButton.classList.toggle('hidden', activeIssueIsReadOnly);
    if (activeIssueIsReadOnly) writeButton.textContent = '읽기 전용 아카이브';
    return;
  }
  const choice = localStorage.getItem(voteKey());
  const results = document.querySelector('#postVoteResults');
  const discussion = document.querySelector('#discussionSection');
  const message = document.querySelector('#voteMessage');
  const voteButtons = [...document.querySelectorAll('#issueView [data-vote]')];
  results.classList.toggle('hidden', !choice);
  discussion.classList.toggle('hidden', !choice);
  voteButtons.forEach((button) => {
    button.disabled = Boolean(choice);
    if (choice && button.dataset.vote === choice) button.setAttribute('aria-pressed', 'true');
  });
  message.textContent = choice
    ? `시연 투표 완료: ${choice}. 결과와 토론이 열렸습니다. 이 선택은 현재 브라우저에만 저장됩니다.`
    : '투표 후 결과와 토론이 열립니다.';
}

function renderPollCards() {
  const list = document.querySelector('#activePollList');
  const countBadge = document.querySelector('.count-pill');
  if (!list) return;
  const entries = activeIssueIds.map((id) => [id, issues[id]]).filter(([, issue]) => Boolean(issue));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  list.replaceChildren(...entries.map(([id, issue], index) => {
    const card = document.createElement('article');
    const forText = issue.cardFor || issue.forArguments[0][1];
    const againstText = issue.cardAgainst || issue.againstArguments[0][1];
    card.className = 'poll-card';
    card.innerHTML = `<div class="poll-top"><span class="live-label"><i></i> 진행 중인 투표 <b>${String(index + 1).padStart(2, '0')} / ${entries.length}</b></span><span class="deadline">30일 투표</span></div><div class="poll-body"><div class="poll-meta"><span class="category">${escapeHtml(issue.category)}</span><span>읽는 시간 3분</span></div><h3>${escapeHtml(issue.title)}</h3><p class="poll-summary">${escapeHtml(issue.intro)}</p><div class="stance-grid"><div class="stance for"><div class="stance-head"><span class="stance-symbol">+</span><b>찬성 의견</b></div><span>${escapeHtml(forText)}</span></div><div class="stance against"><div class="stance-head"><span class="stance-symbol">−</span><b>반대 의견</b></div><span>${escapeHtml(againstText)}</span></div></div><div class="poll-footer"><span class="participant-count">주제 출처 · ${escapeHtml(issue.source.split(' · ')[0])}</span><a class="primary-button" data-open-issue="${escapeHtml(id)}" href="?issue=${encodeURIComponent(id)}">투표하고 이야기 보기 <span>→</span></a></div></div>`;
    return card;
  }));
  if (countBadge) countBadge.textContent = `${entries.length}개`;
  list.scrollLeft = 0;
  syncPollCarousel();
}

function renderEditorialArchives() {
  const list = document.querySelector('#archive .archive-list');
  if (!list) return;
  const archiveSampleIds = ['archive-public-bikes', 'archive-market-closure', 'archive-pet-registration'];
  [...list.querySelectorAll('.archive-row:not([data-editorial-archive="true"])')].forEach((row, index) => {
    const issueId = archiveSampleIds[index];
    if (issueId) { row.dataset.openIssue = issueId; row.href = `?issue=${encodeURIComponent(issueId)}`; row.setAttribute('aria-label', `${archivedSampleIssues[issueId].title} 상세 보기`); }
  });
  list.querySelectorAll('[data-editorial-archive="true"]').forEach((row) => row.remove());
  [...editorialState.archived].slice(0, 8).reverse().forEach((record) => {
    const row = document.createElement('a');
    row.className = 'archive-row'; row.href = `?issue=${encodeURIComponent(record.id)}`; row.dataset.openIssue = record.id; row.dataset.editorialArchive = 'true';
    const main = document.createElement('div'); main.className = 'archive-main';
    const title = document.createElement('strong'); title.textContent = record.title;
    const meta = document.createElement('span'); meta.textContent = `보관함 이동 ${new Date(record.archivedAt).toLocaleDateString('ko-KR')} · 승인 안건으로 교체`;
    const note = document.createElement('small'); note.textContent = '시연 아카이브 · 투표 종료 후 토론 보관';
    main.append(title, meta, note);
    const arrow = document.createElement('div'); arrow.className = 'archive-arrow'; arrow.textContent = '↗';
    row.append(main, arrow); list.prepend(row);
  });
  const fullList = document.querySelector('#archivePageList');
  if (fullList) fullList.replaceChildren(...[...list.children].map((row) => row.cloneNode(true)));
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

function isAdminMode() {
  return localStorage.getItem(adminModeKey) === 'true';
}
if (isAdminMode()) adminEntryButton.classList.remove('hidden');

function showAdminView() {
  if (!isAdminMode()) return openLogin();
  homeView.classList.add('hidden');
  issueView.classList.add('hidden');
  announcementsView.classList.add('hidden'); archiveView.classList.add('hidden');
  openTalkView.classList.add('hidden'); topicSuggestionsView.classList.add('hidden');
  adminView.classList.remove('hidden');
  currentAdminPage = 'overview';
  renderAdminDashboard();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function currentDraftFromForm() {
  const values = Object.fromEntries(new FormData(editorialForm).entries());
  const savedMetadata = editorialState.pending.find((draft) => draft.id === activeDraftId) || {};
  return {
    ...savedMetadata,
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
    const marker = document.createElement('span'); marker.className = `history-status ${record.status === '승인' ? 'approved' : 'rejected'}`; marker.textContent = record.status;
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
  queue.innerHTML = visibleDrafts.map((draft) => {
    const batch = draft.batchId ? editorialState.pending.filter((item) => item.batchId === draft.batchId) : [];
    const batchPosition = batch.findIndex((item) => item.id === draft.id) + 1;
    const batchLabel = batch.length ? `배포 후보 ${batch.length}개 중 ${batchPosition}번` : '기존 검토 안건';
    const recency = draft.trendingReason ? `<small>최근 이슈 근거 · ${escapeAdminHtml(draft.trendingReason)}</small>` : '';
    const selectedField = draft.selectedField ? `<small>후보 생성 분야 · ${escapeAdminHtml(draft.selectedField)}</small>` : '';
    return `<article class="review-queue-item ${draft.id === activeDraftId ? 'selected' : ''}"><div><span class="ai-recommend-tag">${batchLabel} · 운영자 검토 필요</span><strong>${escapeAdminHtml(draft.title)}</strong><small>${escapeAdminHtml(draft.category)} · 출처 ${escapeAdminHtml(draft.source)}</small>${selectedField}${recency}</div><button type="button" data-review-draft="${escapeAdminHtml(draft.id)}">${draft.id === activeDraftId ? '검토 중' : '검토하기'} <span>→</span></button></article>`;
  }).join('') || `<div class="empty-draft">${editorialState.pending.length ? '선택한 분야의 검토 대기 안건이 없습니다.' : '검토 대기 안건이 없습니다.'}</div>`;
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
    updateAdminPreview();
  }
  renderEditorialHistory();
}

function renderMembersTable() {
  const body = document.querySelector('#memberTableBody');
  if (!body) return;
  const query = document.querySelector('#memberSearch')?.value.trim().toLowerCase() || '';
  const status = document.querySelector('#memberStatusFilter')?.value || '전체';
  const members = adminOperations.members.filter((member) => (status === '전체' || member.status === status) && `${member.nickname} ${member.id}`.toLowerCase().includes(query));
  body.innerHTML = members.map((member) => `<tr><td><strong>${escapeAdminHtml(member.nickname)}</strong><small>${escapeAdminHtml(member.id)}</small></td><td>${escapeAdminHtml(member.joined)}</td><td><span class="admin-status ${member.status === '정상' ? 'status-good' : member.status === '7일 정지' ? 'status-blocked' : 'status-warn'}">${escapeAdminHtml(member.status)}</span></td><td>${member.reports}건</td><td><select class="member-role-select" data-member-role="${escapeAdminHtml(member.id)}" aria-label="${escapeAdminHtml(member.nickname)} 권한"><option ${!member.role || member.role === '일반 회원' ? 'selected' : ''}>일반 회원</option><option ${member.role === '신뢰 회원' ? 'selected' : ''}>신뢰 회원</option><option ${member.role === '운영자' ? 'selected' : ''}>운영자</option></select></td><td class="row-actions"><button data-admin-action="warn-member" data-id="${member.id}">경고</button><button data-admin-action="suspend-member" data-id="${member.id}">7일 정지</button>${member.status === '7일 정지' ? `<button data-admin-action="restore-member" data-id="${member.id}">정지 해제</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">검색 결과가 없습니다.</td></tr>';
}

function renderAdminPage(page = currentAdminPage) {
  currentAdminPage = page;
  document.querySelectorAll('.admin-nav').forEach((button) => button.classList.toggle('active', button.dataset.adminPage === page));
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
  const latestAudit = [...editorialState.history.map((entry) => ({ action: `안건 ${entry.status}`, target: entry.title, at: entry.at })), ...adminOperations.audit].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
  const auditRows = (entries) => entries.length ? entries.map((entry) => `<div class="activity-row"><span class="activity-dot"></span><div><strong>${escapeAdminHtml(entry.action)} · ${escapeAdminHtml(entry.target)}</strong><small>${escapeAdminHtml(entry.operator || '운영 편집')} · ${new Date(entry.at).toLocaleString('ko-KR')}${entry.reason ? ` · ${escapeAdminHtml(entry.reason)}` : ''}</small></div></div>`).join('') : '<p class="table-empty">아직 운영 기록이 없습니다.</p>';
  const header = (eyebrow, title, description, action = '') => `<div class="admin-page-heading"><div><span class="section-kicker">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
  if (page === 'overview') {
    const openReports = adminOperations.reports.filter((item) => item.status === '미검토').length;
    const unanswered = adminOperations.inquiries.filter((item) => item.status === '미답변').length;
    const openPartners = adminOperations.partnerships.filter((item) => item.status !== '완료').length;
    content.innerHTML = `${header('OPERATIONS OVERVIEW', '운영 대시보드', '오늘의 커뮤니티 현황과 우선 처리할 업무를 확인하세요.', '<span class="today-date">2026년 11월 21일 · 시연 현황</span>')}<div class="overview-metrics"><button class="overview-metric" data-admin-page="members"><span>총 회원수</span><strong>12,840<small>명</small></strong><em class="metric-up">지난달보다 +8.4%</em><i>회원 관리 →</i></button><button class="overview-metric" data-admin-page="polls"><span>진행 중인 투표</span><strong>${activeIssueIds.length}<small>건</small></strong><em>30일 운영 · 승인 시 30개 유지</em><i>투표 관리 →</i></button><button class="overview-metric attention" data-admin-page="reviews"><span>검토할 AI 안건</span><strong>${editorialState.pending.length}<small>건</small></strong><em>관리자 승인 전에는 공개되지 않음</em><i>안건 검토 →</i></button><button class="overview-metric" data-admin-page="inquiries"><span>회원 문의 접수</span><strong>${adminOperations.inquiries.length}<small>건</small></strong><em>미답변 ${unanswered}건</em><i>문의 확인 →</i></button><button class="overview-metric" data-admin-page="partnerships"><span>제휴 문의 접수</span><strong>${adminOperations.partnerships.length}<small>건</small></strong><em>미완료 ${openPartners}건</em><i>제휴 검토 →</i></button><button class="overview-metric attention" data-admin-page="reports"><span>미검토 신고</span><strong>${openReports}<small>건</small></strong><em>모욕·혐오 표현 신고 포함</em><i>신고 처리 →</i></button></div><div class="overview-columns"><section class="admin-card"><div class="admin-card-heading"><div><span class="section-kicker">NEEDS ATTENTION</span><h2>먼저 확인할 업무</h2></div></div><button class="priority-link" data-admin-page="reviews"><span class="priority-mark">✦</span><span><strong>AI 추천 안건 검토</strong><small>${editorialState.pending.length}건 · 출처와 양측 관점을 확인하고 승인</small></span><b>→</b></button><button class="priority-link" data-admin-page="reports"><span class="priority-mark danger">⚑</span><span><strong>회원 신고 검토</strong><small>${openReports}건 · 모욕·혐오·도배 신고 대기</small></span><b>→</b></button><button class="priority-link" data-admin-page="inquiries"><span class="priority-mark">✉</span><span><strong>미답변 문의</strong><small>${unanswered}건 · 접수 순으로 확인</small></span><b>→</b></button><button class="priority-link" data-admin-page="partnerships"><span class="priority-mark">◇</span><span><strong>제휴 문의 확인</strong><small>${openPartners}건 · 협력 제안 검토</small></span><b>→</b></button></section><section class="admin-card"><div class="admin-card-heading"><div><span class="section-kicker">RECENT ACTIVITY</span><h2>최근 운영 기록</h2></div><button data-admin-page="audit">전체 보기 →</button></div><div class="activity-list">${auditRows(latestAudit)}</div></section></div>`;
  } else if (page === 'reviews') {
    document.querySelector('#adminPageContent').classList.add('hidden');
    renderReviewQueue();
    return;
  } else if (page === 'polls') {
    content.innerHTML = `${header('POLL MANAGEMENT', '투표 관리', `진행 중인 안건 ${activeIssueIds.length}건 · 승인 및 마감 현황을 살펴보세요.`)}<div class="table-toolbar"><span>진행 중 <b>${activeIssueIds.length}</b>건</span><input id="pollSearch" placeholder="투표 제목 검색" aria-label="투표 검색" /></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>주제</th><th>분야</th><th>상태</th><th>출처</th><th>관리</th></tr></thead><tbody>${activeIssueIds.map((id) => { const item = issues[id]; return `<tr><td><strong>${escapeAdminHtml(item.title)}</strong><small>30일 투표 · 진행 중</small></td><td>${escapeAdminHtml(item.category)}</td><td><span class="admin-status status-good">진행 중</span></td><td>${escapeAdminHtml(item.source)}</td><td><button data-open-issue="${escapeAdminHtml(id)}" class="table-action">상세 보기</button></td></tr>`; }).join('')}</tbody></table></div><p class="admin-footnote">투표 마감·일정 변경은 시연 데이터에 연결되지 않았습니다. 승인 후 공개되는 투표는 30개 정원을 유지합니다.</p>`;
  } else if (page === 'archive') {
    content.innerHTML = `${header('PAST CONVERSATIONS', '지난 투표 보관함', '종료된 투표의 결과와 토론을 확인합니다. 보관 기간이 지난 투표는 읽기 전용으로 표시됩니다.')}<div class="archive-list admin-archive-list" id="adminArchiveList"></div>`;
    const adminList = document.querySelector('#adminArchiveList');
    const archiveRows = document.querySelector('#archivePageList');
    if (adminList && archiveRows) adminList.replaceChildren(...[...archiveRows.children].map((row) => row.cloneNode(true)));
    if (adminList && !adminList.children.length) adminList.innerHTML = '<div class="community-empty">보관된 투표가 없습니다.</div>';
  } else if (page === 'members') {
    content.innerHTML = `${header('COMMUNITY MEMBERS', '회원 관리', '회원별 신고 이력과 제재 상태를 살펴보고 필요한 조치를 기록합니다.')}<div class="member-summary"><span>회원 <b>12,840명</b></span><span>정상 <b>${adminOperations.members.filter((m) => m.status === '정상').length}명</b></span><span>주의·정지 <b>${adminOperations.members.filter((m) => m.status !== '정상').length}명</b></span></div><div class="table-toolbar"><input id="memberSearch" placeholder="닉네임 또는 회원 번호 검색" aria-label="회원 검색" /><select id="memberStatusFilter"><option>전체</option><option>정상</option><option>검토 중</option><option>주의</option><option>7일 정지</option></select></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>회원</th><th>가입일</th><th>상태</th><th>신고</th><th>권한</th><th>조치</th></tr></thead><tbody id="memberTableBody"></tbody></table></div><p class="admin-footnote">제재 조치에는 구체적인 운영 사유를 남기고, 회원에게 안내할 이의 제기 절차를 제공하세요.</p>`;
    renderMembersTable();
  } else if (page === 'reports') {
    content.innerHTML = `${header('SAFETY & MODERATION', '신고·게시글 관리', '신고 맥락을 확인하고 게시글과 회원에 각각 비례한 조치를 적용하세요.')}<div class="moderation-guidance"><strong>검토 기준</strong><span>비판 의견과 인격 모독을 구분하고, 표현의 맥락·반복성·피해 정도를 살핀 뒤 사유를 기록합니다.</span></div><div class="report-list">${adminOperations.reports.map((report) => `<article class="report-card"><div class="report-card-top"><span class="report-reason">${escapeAdminHtml(report.reason)}</span><span class="admin-status ${report.status === '미검토' ? 'status-warn' : 'status-good'}">${escapeAdminHtml(report.status)}</span></div>${report.postTitle ? `<p class="reported-object">신고 대상 글: ${escapeAdminHtml(report.postTitle)}</p>` : ''}<h2>${escapeAdminHtml(report.summary)}</h2><p>${escapeAdminHtml(report.area)} · 작성자 ${escapeAdminHtml(report.nickname)} · 신고 ${report.count}건 · 게시글 ${escapeAdminHtml(report.postStatus)}</p><details class="report-detail"><summary>신고 맥락과 검토 안내</summary><p>신고된 원문은 시연 화면에서 일부 가려져 있습니다. 앞뒤 대화, 반복 여부, 대상이 된 회원의 설명과 기존 운영 기록을 함께 확인한 뒤 조치하세요. 이 예시 데이터에는 실제 회원 게시물이 포함되어 있지 않습니다.</p></details><div class="report-actions"><button data-admin-action="dismiss-report" data-id="${report.id}">위반 아님</button>${report.postStatus !== '공개' ? `<button data-admin-action="restore-post" data-id="${report.id}">게시글 복구</button>` : `<button data-admin-action="hide-post" data-id="${report.id}">게시글 숨김</button><button data-admin-action="delete-post" data-id="${report.id}">삭제 처리</button>`}<button class="danger-action" data-admin-action="suspend-member" data-id="${escapeAdminHtml(report.memberId)}">회원 제재 검토</button></div></article>`).join('')}</div>`;
  } else if (page === 'inquiries' || page === 'partnerships') {
    const isInquiry = page === 'inquiries'; const items = isInquiry ? adminOperations.inquiries : adminOperations.partnerships;
    content.innerHTML = `${header(isInquiry ? 'SUPPORT INBOX' : 'PARTNERSHIPS', isInquiry ? '회원 문의' : '제휴 문의', isInquiry ? '접수 내용을 확인하고 답변 진행 상태를 관리하세요.' : '협력 목적과 기대 효과를 확인하고 내부 검토 상태를 기록하세요.')}<div class="table-toolbar"><span>전체 <b>${items.length}</b>건 접수</span><select id="inboxStatusFilter"><option>전체</option><option>미답변</option><option>답변 중</option><option>미확인</option><option>검토 중</option><option>완료</option></select></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>접수 내용</th><th>분류</th><th>보낸 사람</th><th>접수 시각</th><th>상태·처리</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${escapeAdminHtml(item.title)}</strong><small>접수번호 ${escapeAdminHtml(item.id)}</small><details class="inbox-message"><summary>접수 내용${item.reply ? ' · 답변/메모 확인' : ' 보기'}</summary><p>${escapeAdminHtml(item.message || '기존 시연 문의의 상세 본문입니다.')}</p>${item.reply ? `<p class="saved-reply"><b>운영 답변·메모</b>${escapeAdminHtml(item.reply)}</p>` : ''}</details></td><td>${escapeAdminHtml(item.type)}</td><td>${escapeAdminHtml(item.sender)}</td><td>${escapeAdminHtml(item.received)}</td><td><span class="admin-status status-warn">${escapeAdminHtml(item.status)}</span><div class="row-actions"><button data-admin-action="progress-${page}" data-id="${item.id}">검토 시작</button><button data-admin-action="${isInquiry ? 'reply-inquiries' : 'note-partnerships'}" data-id="${item.id}">${isInquiry ? '답변 초안' : '내부 메모'}</button><button data-admin-action="complete-${page}" data-id="${item.id}">완료 처리</button></div></td></tr>`).join('')}</tbody></table></div>`;
  } else if (page === 'announcements') {
    const edit = adminOperations.announcements.find((item) => item.id === editingAnnouncementId);
    content.innerHTML = `${header('PUBLIC INFORMATION', '공지사항 관리', '게시할 공지를 작성하고 사용자 화면 노출과 상단 고정을 관리합니다.')}<div class="admin-announcement-layout"><form class="announcement-editor" id="announcementEditor"><h2>${edit ? '공지 수정' : '새 공지 작성'}</h2><label for="announcementTitle">제목</label><input id="announcementTitle" name="title" maxlength="100" required value="${escapeAdminHtml(edit?.title || '')}" placeholder="공지 제목"/><label for="announcementCategory">분류</label><select id="announcementCategory" name="category"><option ${edit?.category === '운영 원칙' ? 'selected' : ''}>운영 원칙</option><option ${edit?.category === '이용 안내' ? 'selected' : ''}>이용 안내</option><option ${edit?.category === '신고와 제재' ? 'selected' : ''}>신고와 제재</option><option ${edit?.category === '투표 안내' ? 'selected' : ''}>투표 안내</option><option ${edit?.category === '안전과 개인정보' ? 'selected' : ''}>안전과 개인정보</option><option ${edit?.category === '서비스 소식' ? 'selected' : ''}>서비스 소식</option></select><label for="announcementSummary">목록 요약</label><input id="announcementSummary" name="summary" maxlength="180" required value="${escapeAdminHtml(edit?.summary || '')}" placeholder="목록과 상단 공지에 보일 한 줄 요약"/><label for="announcementBody">본문</label><textarea id="announcementBody" name="body" required placeholder="공지 내용을 입력하세요">${escapeAdminHtml(edit?.body || '')}</textarea><label class="announcement-check"><input type="checkbox" name="pinned" ${edit?.pinned ? 'checked' : ''}/> 상단 공지로 고정</label><div class="announcement-editor-actions"><button class="primary-button" type="submit">${edit ? '수정 저장' : '저장하고 게시'}</button>${edit ? '<button type="button" data-announcement-action="cancel-edit">취소</button>' : ''}</div><p class="admin-footnote">게시된 공지는 사용자 화면 상단 한 줄 공지와 공지 목록에 바로 반영됩니다.</p></form><section class="announcement-admin-list"><h2>등록 공지 ${adminOperations.announcements.length}건</h2>${[...adminOperations.announcements].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map((item) => `<article class="announcement-admin-item"><strong>${escapeAdminHtml(item.title)}</strong><small>${escapeAdminHtml(item.category)} · ${item.published ? '게시 중' : '내림'}${item.pinned ? ' · 상단 고정' : ''}</small><div class="announcement-row-actions"><button data-announcement-action="edit" data-id="${escapeAdminHtml(item.id)}">수정</button><button data-announcement-action="toggle-publish" data-id="${escapeAdminHtml(item.id)}">${item.published ? '게시 내리기' : '게시하기'}</button><button data-announcement-action="toggle-pin" data-id="${escapeAdminHtml(item.id)}">${item.pinned ? '고정 해제' : '상단 고정'}</button></div></article>`).join('')}</section></div>`;
  } else if (page === 'topic-suggestions') {
    const pending = adminOperations.topicSuggestions.filter((item) => item.status === '검토 대기');
    content.innerHTML = `${header('COMMUNITY EDITORIAL', '이용자 주제 제안', `검토 대기 ${pending.length}건 · 관심 수는 편집 판단의 참고 자료입니다.`)}<div class="moderation-guidance"><strong>검토 기준</strong><span>최신성·사실 확인 가능성·찬반 관점의 균형·선거 관련 여부를 확인한 뒤 편집 검토로 보냅니다. 관심 수만으로 자동 채택하지 않습니다.</span></div><div class="topic-admin-list">${adminOperations.topicSuggestions.map((item) => `<article class="topic-admin-card"><div class="topic-admin-top"><span class="announcement-category">${escapeAdminHtml(item.category)}</span><span class="admin-status ${item.status === '검토 대기' ? 'status-warn' : item.status === '편집 검토 중' ? 'status-good' : ''}">${escapeAdminHtml(item.status)}</span></div><h2>${escapeAdminHtml(item.title)}</h2><p>${escapeAdminHtml(item.rationale)}</p><div class="suggestion-balance"><p><b>찬성 관점</b>${escapeAdminHtml(item.forText)}</p><p><b>반대 관점</b>${escapeAdminHtml(item.againstText)}</p></div><small>제안 ${escapeAdminHtml(item.sender || '익명')} · 관심 ${item.interestCount}명 · ${new Date(item.createdAt).toLocaleString('ko-KR')}${safeHttpsUrl(item.sourceUrl) ? ` · <a href="${escapeAdminHtml(safeHttpsUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">출처 확인 ↗</a>` : ' · 참고 출처 없음'}</small>${item.reviewNote ? `<p>검토 메모: ${escapeAdminHtml(item.reviewNote)}</p>` : ''}${item.status === '검토 대기' ? `<div class="row-actions"><button data-topic-action="send-to-editorial" data-id="${escapeAdminHtml(item.id)}">편집 검토로 보내기</button><button data-topic-action="reject" data-id="${escapeAdminHtml(item.id)}">반려</button></div>` : ''}</article>`).join('') || '<div class="community-empty">등록된 제안이 없습니다.</div>'}</div>`;
  } else if (page === 'discussion-management') {
    const submittedPosts = Object.entries(issues).flatMap(([issueId, issue]) => readLocalList(savedPostsKey(issueId)).map((post) => ({ ...post, issueId, issueTitle: issue.title })));
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

function handleAdminAction(action, id) {
  if (action === 'warn-member' || action === 'suspend-member') {
    const member = adminOperations.members.find((item) => item.id === id);
    if (!member) return;
    const reason = window.prompt(`${member.nickname} 회원 ${action === 'warn-member' ? '경고' : '7일 이용 정지'} 사유를 입력해 주세요.`);
    if (!reason?.trim()) return;
    member.status = action === 'warn-member' ? '주의' : '7일 정지';
    logAdminAction(action === 'warn-member' ? '회원 경고' : '회원 7일 정지', member.nickname, reason.trim());
  } else if (action === 'restore-member') {
    const member = adminOperations.members.find((item) => item.id === id);
    if (!member || !window.confirm(`${member.nickname} 회원의 이용 정지를 해제할까요?`)) return;
    member.status = '정상';
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
    logAdminAction(actionLabel, `${report.nickname} · ${report.area}`, reason.trim());
  } else if (action.startsWith('progress-') || action.startsWith('complete-') || action.startsWith('reply-') || action.startsWith('note-')) {
    const collection = action.endsWith('inquiries') ? adminOperations.inquiries : adminOperations.partnerships;
    const item = collection.find((entry) => entry.id === id);
    if (!item) return;
    if (action.startsWith('reply-') || action.startsWith('note-')) {
      const reply = window.prompt(action.startsWith('reply-') ? '답변 초안 내용을 입력해 주세요.' : '내부 검토 메모를 입력해 주세요.', item.reply || '');
      if (!reply?.trim()) return;
      item.reply = reply.trim();
      item.status = action.startsWith('reply-') ? '답변 중' : '검토 중';
      logAdminAction(action.startsWith('reply-') ? '문의 답변 초안 저장' : '제휴 검토 메모 저장', item.title, `${item.sender} · ${item.id}`);
    } else {
      item.status = action.startsWith('complete-') ? '완료' : (action.endsWith('inquiries') ? '답변 중' : '검토 중');
      logAdminAction(action.startsWith('complete-') ? '문의 완료 처리' : '문의 검토 시작', item.title, `${item.sender} · ${item.id}`);
    }
  }
  saveAdminOperations();
  renderAdminPage(currentAdminPage);
}

document.querySelector('.admin-sidebar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-admin-page]');
  if (button) renderAdminPage(button.dataset.adminPage);
});
document.querySelector('#adminPageContent').addEventListener('click', (event) => {
  const discussionAction = event.target.closest('[data-discussion-action]');
  if (discussionAction) {
    const hidden = discussionAction.dataset.discussionAction === 'hide';
    const reason = window.prompt(hidden ? '토론 글을 숨길 사유를 기록해 주세요.' : '토론 글 복구 사유를 기록해 주세요.');
    if (!reason?.trim()) return;
    const postId = discussionAction.dataset.id;
    const post = readLocalList(savedPostsKey(discussionAction.dataset.issueId)).find((item) => item.id === postId);
    if (!post) return;
    adminOperations.hiddenDiscussionPosts = adminOperations.hiddenDiscussionPosts.filter((id) => id !== postId);
    if (hidden) adminOperations.hiddenDiscussionPosts.push(postId);
    if (!hidden) adminOperations.reports.filter((report) => report.issueId === discussionAction.dataset.issueId && report.postId === postId && report.postStatus !== '공개').forEach((report) => { report.postStatus = '공개'; report.status = '재검토 완료'; });
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
      logAdminAction('이용자 제안을 편집 검토로 전달', suggestion.title, `관심 ${suggestion.interestCount}명 · 수동 사실 확인 필요`);
      saveAdminOperations(); renderHomeCommunityBoard(); renderAdminPage('reviews'); return;
    }
    const reason = window.prompt('제안 반려 사유를 기록해 주세요.');
    if (!reason?.trim()) return;
    suggestion.status = '반려'; suggestion.reviewNote = reason.trim();
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
    if (!hidden) adminOperations.reports.filter((report) => report.issueId === 'open-talk' && report.postId === post.id && report.postStatus !== '공개').forEach((report) => { report.postStatus = '공개'; report.status = '재검토 완료'; });
    logAdminAction(hidden ? '익명 자유토론 게시글 숨김' : '익명 자유토론 게시글 복구', post.title, reason.trim());
    saveAdminOperations(); renderAdminPage('open-talk'); renderOpenTalkList(); renderHomeCommunityBoard(); return;
  }
  const announcementAction = event.target.closest('[data-announcement-action]');
  if (announcementAction) {
    const item = adminOperations.announcements.find((entry) => entry.id === announcementAction.dataset.id);
    if (announcementAction.dataset.announcementAction === 'cancel-edit') editingAnnouncementId = null;
    else if (item && announcementAction.dataset.announcementAction === 'edit') editingAnnouncementId = item.id;
    else if (item && announcementAction.dataset.announcementAction === 'toggle-publish') { item.published = !item.published; logAdminAction(item.published ? '공지 게시' : '공지 게시 내림', item.title); }
    else if (item && announcementAction.dataset.announcementAction === 'toggle-pin') { item.pinned = !item.pinned; logAdminAction(item.pinned ? '공지 상단 고정' : '공지 고정 해제', item.title); }
    saveAdminOperations(); renderAnnouncementTicker(); renderAdminPage('announcements'); return;
  }
  const pageButton = event.target.closest('[data-admin-page]');
  if (pageButton) { renderAdminPage(pageButton.dataset.adminPage); return; }
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

document.querySelector('#adminPageContent').addEventListener('submit', (event) => {
  if (event.target.id !== 'announcementEditor') return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = adminOperations.announcements.find((item) => item.id === editingAnnouncementId);
  const item = { id: existing?.id || `notice-${Date.now()}`, category: values.category, title: values.title.trim(), summary: values.summary.trim(), body: values.body.trim(), createdAt: existing?.createdAt || new Date().toISOString(), published: existing?.published ?? true, pinned: values.pinned === 'on' };
  if (existing) Object.assign(existing, item); else adminOperations.announcements.unshift(item);
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
document.querySelector('#adminPageContent').addEventListener('change', (event) => {
  if (event.target.id === 'memberStatusFilter') renderMembersTable();
  if (event.target.matches('[data-member-role]')) {
    const member = adminOperations.members.find((item) => item.id === event.target.dataset.memberRole);
    if (!member) return;
    const previousRole = member.role || '일반 회원';
    member.role = event.target.value;
    logAdminAction('회원 권한 변경', member.nickname, `${previousRole} → ${member.role}`);
    renderAdminPage('members');
  }
  if (event.target.id === 'inboxStatusFilter') {
    const rows = [...document.querySelectorAll('.admin-table tbody tr')];
    rows.forEach((row) => { const badge = row.querySelector('.admin-status'); row.hidden = event.target.value !== '전체' && badge?.textContent !== event.target.value; });
  }
});

document.querySelector('#adminDemoButton').addEventListener('click', () => {
  localStorage.setItem(adminModeKey, 'true');
  adminEntryButton.classList.remove('hidden');
  loginDialog.close();
  showAdminView();
});
adminEntryButton.addEventListener('click', showAdminView);
document.querySelector('#adminBackButton').addEventListener('click', () => {
  adminView.classList.add('hidden');
  announcementsView.classList.add('hidden');
  homeView.classList.remove('hidden');
  renderPollCards();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
editorialForm.addEventListener('input', updateAdminPreview);
document.querySelector('#saveDraftButton').addEventListener('click', () => {
  const draft = saveCurrentDraft();
  if (draft) document.querySelector('#draftStatus').textContent = '수정 저장됨';
});
document.querySelector('#rejectDraftButton').addEventListener('click', () => {
  const draft = saveCurrentDraft();
  if (!draft) return;
  editorialState.pending = editorialState.pending.filter((item) => item.id !== draft.id);
  editorialState.history.push({ status: '반려', draftId: draft.id, title: draft.title, category: draft.category, at: new Date().toISOString() });
  activeDraftId = editorialState.pending[0]?.id || null;
  saveEditorialState();
  renderAdminDashboard();
});
editorialForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!editorialForm.reportValidity()) return;
  const draft = saveCurrentDraft();
  if (!draft || !draft.facts.length || !/^https:\/\//i.test(draft.sourceUrl)) {
    document.querySelector('#draftStatus').textContent = '사실과 https 출처를 확인해 주세요';
    return;
  }
  const replacementTitle = issues[activeIssueIds[activeIssueIds.length - 1]]?.title || '기존 투표';
  const batchAlternatives = draft.batchId ? editorialState.pending.filter((item) => item.batchId === draft.batchId && item.id !== draft.id) : [];
  const siblingNote = batchAlternatives.length ? ` 같은 배포의 나머지 후보 ${batchAlternatives.length}개는 미선택 처리됩니다.` : '';
  if (!window.confirm(`이 안건을 승인해 즉시 공개하고 현재 목록의 마지막 투표인 “${replacementTitle}”을 시연 보관함으로 이동할까요?${siblingNote}`)) return;
  const id = `approved-${Date.now()}`;
  const issue = {
    category: draft.category, title: draft.title, intro: draft.intro, facts: draft.facts,
    source: draft.source, sourceUrl: draft.sourceUrl,
    forArguments: [['찬성 측 주장', draft.forText]], againstArguments: [['반대 측 주장', draft.againstText]],
    cardFor: draft.forText, cardAgainst: draft.againstText, demoResults: [45, 40, 15],
    samplePosts: [
      { id: `${id}-for`, stance: '찬성', title: '촬영 표시가 사생활 보호에 도움이 됩니다', author: '생각나눔', content: draft.forText, initialComments: [] },
      { id: `${id}-against`, stance: '반대', title: '표시 의무의 기준과 실효성을 먼저 봐야 합니다', author: '차분한토론', content: draft.againstText, initialComments: [] }
    ]
  };
  const replacedId = activeIssueIds.pop();
  const replacedIssue = issues[replacedId];
  editorialState.archived.unshift({ id: replacedId, title: replacedIssue.title, category: replacedIssue.category, archivedAt: new Date().toISOString() });
  issues[id] = issue;
  activeIssueIds.unshift(id);
  editorialState.approved.push({ id, issue });
  editorialState.history.push({ status: '승인', draftId: draft.id, title: draft.title, category: draft.category, at: new Date().toISOString(), replacedTitle: replacedIssue.title });
  editorialState.pending = editorialState.pending.filter((item) => item.id !== draft.id && (!draft.batchId || item.batchId !== draft.batchId));
  batchAlternatives.forEach((alternative) => editorialState.history.push({ status: '미선택', draftId: alternative.id, title: alternative.title, category: alternative.category, at: new Date().toISOString(), selectedTitle: draft.title }));
  activeDraftId = editorialState.pending[0]?.id || null;
  saveEditorialState();
  renderPollCards();
  renderEditorialArchives();
  renderAdminDashboard();
});
document.querySelector('#backButton').addEventListener('click', () => {
  issueView.classList.add('hidden');
  homeView.classList.remove('hidden');
  activeIssueId = null;
  activeIssueIsArchived = false; activeIssueIsReadOnly = false;
  syncSeoMetadata(null, 'replace');
  window.scrollTo({ top: 0, behavior: 'instant' });
});
loginButton.addEventListener('click', openLogin);
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
document.querySelector('.dialog-close').addEventListener('click', () => loginDialog.close());
loginDialog.addEventListener('click', (event) => {
  if (event.target === loginDialog) loginDialog.close();
});
document.querySelector('#demoLoginButton').addEventListener('click', () => {
  localStorage.setItem(authKey, 'true');
  loginDialog.close();
  if (pendingVote) castDemoVote(pendingVote);
});
document.querySelector('#postDialogClose').addEventListener('click', () => postDialog.close());
document.querySelector('#postCancel').addEventListener('click', () => postDialog.close());

issueView.addEventListener('click', (event) => {
  const filterButton = event.target.closest('[data-discussion-filter]');
  if (filterButton) { applyDiscussionFilter(filterButton.dataset.discussionFilter); return; }
  const reportButton = event.target.closest('[data-report-post]');
  if (reportButton) {
    if (localStorage.getItem(authKey) !== 'true') return openLogin();
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
    const priorVote = localStorage.getItem(voteKey());
    if (priorVote) return;
    pendingVote = voteButton.dataset.vote;
    if (localStorage.getItem(authKey) === 'true') castDemoVote(pendingVote);
    else openLogin();
    return;
  }
  if (event.target.closest('#writeButton')) {
    if (localStorage.getItem(authKey) !== 'true') return openLogin();
    const choice = localStorage.getItem(voteKey()) || (activeIssueIsArchived ? '판단 보류' : null);
    if (!choice) return;
    const stance = stanceInfo(choice);
    const preview = document.querySelector('#postStancePreview');
    preview.replaceChildren(createOpinionTag(stance));
    postDialog.showModal();
    document.querySelector('#postTitle').focus();
  }
});

issueView.addEventListener('submit', (event) => {
  const form = event.target.closest('.comment-form');
  if (!form) return;
  event.preventDefault();
  const textarea = form.querySelector('textarea');
  const text = textarea.value.trim();
  if (!text || !activeIssueId || (!activeIssueIsArchived && !localStorage.getItem(voteKey())) || activeIssueIsReadOnly) return;
  const article = form.closest('.discussion-post');
  const commentList = article.querySelector('.comment-list');
  const comment = { author: '시연 사용자', text };
  const key = savedCommentsKey(activeIssueId, article.dataset.postId);
  const savedComments = readLocalList(key);
  savedComments.push(comment);
  localStorage.setItem(key, JSON.stringify(savedComments));
  appendCommentElement(commentList, comment);
  const meta = article.querySelector('.discussion-post-meta');
  const commentCount = Number(meta.dataset.commentCount || '0') + 1;
  meta.dataset.commentCount = String(commentCount);
  meta.textContent = `${meta.textContent.split(' · 댓글 ')[0]} · 댓글 ${commentCount} · 시연 글`;
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

document.querySelector('#postForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const choice = activeIssueId && (localStorage.getItem(voteKey()) || (activeIssueIsArchived ? '판단 보류' : null));
  if (!choice) return postDialog.close();
  const title = document.querySelector('#postTitle').value.trim();
  const content = document.querySelector('#postContent').value.trim();
  if (!title || !content) return;
  const post = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stance: choice,
    kind: document.querySelector('#postKind').value,
    title,
    content,
    sourceUrl: safeHttpsUrl(document.querySelector('#postSourceUrl').value),
    author: '시연 사용자',
    initialComments: []
  };
  const savedPosts = readLocalList(savedPostsKey(activeIssueId));
  savedPosts.unshift(post);
  localStorage.setItem(savedPostsKey(activeIssueId), JSON.stringify(savedPosts));
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

document.querySelector('#userReportForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingReportContext) return;
  const form = event.currentTarget;
  const reason = form.elements.reason.value;
  const details = form.elements.details.value.trim();
  const issue = getIssueData(pendingReportContext.issueId);
  let member = adminOperations.members.find((item) => pendingReportContext.memberRef ? item.authRef === pendingReportContext.memberRef : item.nickname === pendingReportContext.author);
  if (!member) {
    const memberId = pendingReportContext.memberRef ? `m-${pendingReportContext.memberRef}` : `m-user-${Date.now()}`;
    member = { id: memberId, authRef: pendingReportContext.memberRef || '', nickname: pendingReportContext.author, joined: new Date().toLocaleDateString('ko-KR'), status: '정상', reports: 0 };
    adminOperations.members.unshift(member);
  }
  member.reports += 1;
  const reportId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  adminOperations.reports.unshift({
    id: reportId, memberId: member.id, nickname: pendingReportContext.author,
    area: pendingReportContext.issueId === 'open-talk' ? '익명 자유토론장' : issue?.title || '토론 게시글', summary: details || `“${pendingReportContext.postTitle}” 게시글에 ${reason} 신고가 접수되었습니다.`,
    reason, count: 1, status: '미검토', postStatus: '공개', postId: pendingReportContext.postId,
    issueId: pendingReportContext.issueId, postTitle: pendingReportContext.postTitle, memberRef: pendingReportContext.memberRef || '', reportedAt: new Date().toISOString()
  });
  saveAdminOperations();
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
  document.querySelector('#contactDialogTitle').textContent = isPartnership ? '제휴 문의 접수' : '회원 문의 접수';
  document.querySelector('#contactSenderLabel').textContent = isPartnership ? '기관·회사명' : '닉네임';
  document.querySelector('#contactSender').placeholder = isPartnership ? '기관 또는 회사 이름' : '닉네임 또는 담당자명';
  const typeSelect = document.querySelector('#contactType');
  [...typeSelect.options].forEach((option) => { option.hidden = isPartnership ? !['콘텐츠 제휴', '자료 협력', '학술 협력', '기타'].includes(option.value) : ['콘텐츠 제휴', '자료 협력', '학술 협력'].includes(option.value); });
  typeSelect.value = isPartnership ? '콘텐츠 제휴' : '서비스 이용';
  document.querySelector('#contactForm').reset();
  typeSelect.value = isPartnership ? '콘텐츠 제휴' : '서비스 이용';
  document.querySelector('#contactDialog').showModal();
});

document.querySelector('#contactForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const isPartnership = activeContactMode === 'partnerships';
  const collection = isPartnership ? adminOperations.partnerships : adminOperations.inquiries;
  const id = `${isPartnership ? 'p' : 'q'}-${Date.now()}`;
  collection.unshift({
    id, type: values.type, title: values.title.trim(), sender: values.sender.trim(),
    received: `오늘 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`,
    status: isPartnership ? '미확인' : '미답변', message: values.message.trim(), createdAt: new Date().toISOString()
  });
  saveAdminOperations();
  document.querySelector('#contactDialog').close();
  form.reset();
  showUserActionToast(isPartnership ? '제휴 문의를 접수했습니다.' : '문의가 접수됐습니다. 운영팀이 확인하겠습니다.');
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
syncPollCarousel();
const initialIssueId = new URLSearchParams(window.location.search).get('issue');
syncSeoMetadata(initialIssueId && getIssueData(initialIssueId) ? initialIssueId : null, 'replace');
if (initialIssueId && getIssueData(initialIssueId)) openIssue(initialIssueId, 'none');
window.addEventListener('popstate', () => {
  const issueId = new URLSearchParams(window.location.search).get('issue');
  if (issueId && getIssueData(issueId)) openIssue(issueId, 'none');
  else if (!issueView.classList.contains('hidden')) goHome();
  else syncSeoMetadata(null, 'none');
});

