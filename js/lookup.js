// 입력값 판별: CAS 번호인지, 상품코드인지
const CAS_RE = /^(\d{2,7})-(\d{2})-(\d)$/;
const PACK_UNITS = { MG: 'mg', G: 'g', KG: 'kg', UL: 'µL', ML: 'mL', L: 'L' };

/** CAS 확인 숫자 검사. 맞으면 정규화된 CAS, 형식만 맞고 틀리면 false, 형식이 아니면 null */
export function parseCas(input) {
  const s = String(input ?? '').trim();
  const m = s.match(CAS_RE);
  if (!m) return null;
  const digits = (m[1] + m[2]).split('').reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]) ? s : false;
}

export function normalizeCode(s) {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/** 'Sigma 270970-1L', 'TCI A0001-25G' 처럼 코드 끝의 포장 단위를 분리 */
export function parsePack(code) {
  const m = code.match(/^(.+?)-(\d+(?:\.\d+)?)(MG|KG|UL|ML|G|L)(?:-[A-Z0-9]+)?$/);
  if (!m) return { base: code, amount: null, unit: null };
  return { base: m[1], amount: Number(m[2]), unit: PACK_UNITS[m[3]] };
}

export function classifyInput(input) {
  const cas = parseCas(input);
  if (cas) return { type: 'cas', cas };
  if (cas === false) return { type: 'cas-invalid' };
  const code = normalizeCode(input);
  // 연속된 영문자가 있으면 이름일 수도 있음 (예: acetone, 2-propanol). 상품코드 캐시에 없을 때만 PubChem 이름 조회
  const maybeName = /[a-z]{3,}/i.test(input);
  return { type: 'code', code, maybeName, ...parsePack(code) };
}
