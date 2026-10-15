// GHS 유해문구(H-code) 기반 보관 호환성 경고. 등록을 막지는 않고 안내만 한다.
const RANGES = {
  flammable: [[220, 228], [250, 252]],
  waterReactive: [[260, 261]],
  oxidizer: [[270, 272]],
  corrosive: [[290, 290], [314, 314]],
  toxic: [[300, 301], [310, 311], [330, 331]],
};

export const HAZARD_LABELS = {
  flammable: '인화성',
  waterReactive: '물반응성',
  oxidizer: '산화성',
  corrosive: '부식성',
  toxic: '급성 독성',
};

export function hazardCategories(codes = []) {
  const set = new Set();
  for (const c of codes) {
    const n = parseInt(String(c).replace(/^H/i, ''), 10);
    if (Number.isNaN(n)) continue;
    for (const [cat, ranges] of Object.entries(RANGES)) {
      if (ranges.some(([a, b]) => n >= a && n <= b)) set.add(cat);
    }
  }
  return set;
}

/** @returns {{level:'danger'|'warn'|'info', msg:string}[]} */
export function checkCompat(codes, cabinetType) {
  if (!cabinetType || !codes?.length) return [];
  const h = hazardCategories(codes);
  const out = [];
  const add = (level, msg) => out.push({ level, msg });
  const t = cabinetType;

  if (h.has('oxidizer') && t === 'flammable') {
    add('danger', '산화성 물질을 인화성 보관함에 두면 화재·폭발 위험이 있습니다. 산화제 보관함을 사용하세요.');
  }
  if (h.has('flammable') && t === 'oxidizer') {
    add('danger', '인화성 물질을 산화제 보관함에 두면 화재·폭발 위험이 있습니다. 인화성 보관함을 사용하세요.');
  }
  if (h.has('flammable') && ['general', 'acid', 'base', 'toxic'].includes(t)) {
    add('warn', '인화성 물질입니다. 인화성(방화) 보관함에 보관하는 것을 권장합니다.');
  }
  if (h.has('flammable') && t === 'fridge') {
    add('warn', '인화성 물질입니다. 방폭 냉장고인지 확인하세요.');
  }
  if (h.has('corrosive') && !h.has('flammable') && !h.has('oxidizer') &&
      ['flammable', 'oxidizer', 'general', 'toxic'].includes(t)) {
    add('warn', '부식성 물질입니다. 산 또는 염기 보관함에 보관하는 것을 권장합니다.');
  }
  if (h.has('corrosive') && (t === 'acid' || t === 'base')) {
    add('info', `산과 염기는 분리 보관해야 합니다. 이 시약이 ${t === 'acid' ? '산' : '염기'}이 맞는지 확인하세요.`);
  }
  if (h.has('oxidizer') && t === 'acid') {
    add('info', '산화성 산(질산 등)은 유기산·유기물과 분리해 보관하세요.');
  } else if (h.has('oxidizer') && ['general', 'base', 'toxic', 'fridge'].includes(t)) {
    add('info', '산화성 물질입니다. 산화제 전용 보관함 사용을 권장합니다.');
  }
  if (h.has('waterReactive')) {
    add('warn', '물과 반응하는 물질입니다. 수분과 격리해 보관하세요.');
  }
  if (h.has('toxic') && t !== 'toxic') {
    add('info', '급성 독성 물질입니다. 잠금 가능한 독성 보관함 사용을 권장합니다.');
  }
  return out;
}
