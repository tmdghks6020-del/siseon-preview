export const topicModes = ['news', 'material', 'community', 'fun'] as const;
export function discoveryQueries(field: string, keyword: string): string[] {
  const text = keyword.trim().slice(0, 160);
  if (text) return [...new Set([text, `${text} 논란 쟁점`])];
  const fields: Record<string, string[]> = {
    '전체 분야': ['정치 민생 정책 논란', '집값 생활비 노동 교육 쟁점', 'AI 일상 규제 논란', '증시 투자자 논란'],
    '정치·정책': ['정치 정책 권력기관 논란', '국회 정부 공약 민생 쟁점'],
    '주거·부동산': ['수도권 지방 주택 규제', '보유세 전세 월세 논란'],
    '주식·가상자산': ['증시 개인투자자 손실 논란', '주주 배당 자사주 공시'],
    '기술·AI': ['AI 안경 부정행위 규제', '인공지능 일자리 저작권 논란']
  };
  return fields[field] || [`${field.replace(/·/g, ' ')} 논란`, `${field.replace(/·/g, ' ')} 생활 쟁점`];
}
export function needsHumanReview(item: any): boolean {
  if (item.data_signals?.manualReviewRequired) return true;
  return /정치|선거|대선|후보자|공약|탄핵|판결|재판|사법|대통령|총리|국회|여당|야당|정당|주식|증시|종목|투자|가상자산|코인/.test(`${item.category} ${item.title} ${item.intro}`);
}

export function validateVoteOptions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10 || value.some(x => typeof x !== 'string')) throw new Error('선택지는 2~10개가 필요합니다.');
  const options = value.map(x => x.normalize('NFC').trim());
  if (options.some(x => !x || [...x].length > 60 || /[\u0000-\u001f\u007f]/.test(x)) || new Set(options).size !== options.length) throw new Error('선택지는 중복 없이 각각 1~60자로 입력하세요.');
  return options;
}

