// 국문명 · 화학물질관리법 분류 · MSDS 링크
import { db, DEMO } from './db.js';
import { USE_KR_CHEM_API } from './config.js';
import { esc } from './ui.js';

export const KR_API_ENABLED = !DEMO && USE_KR_CHEM_API;

/** CAS로 국문명·분류·KOSHA MSDS ID 조회. 기능이 꺼져 있으면 null */
export async function lookupKr(cas) {
  if (!KR_API_ENABLED || !cas) return null;
  return db.chemInfoKr({ cas });
}

/** 한글 물질명으로 CAS 후보 찾기 (KOSHA MSDS 목록) */
export async function searchKorName(korName) {
  if (!KR_API_ENABLED) return null;
  return (await db.chemInfoKr({ korName })).candidates || [];
}

export const hasHangul = (s) => /[가-힣]/.test(s);

// ---------------------------------------------------------------- MSDS 링크
const KOSHA = 'https://msds.kosha.or.kr/MSDSInfo/kcic';

export function koshaMsdsUrl({ msds_chem_id, cas }) {
  if (msds_chem_id) return `${KOSHA}/msdsdetail.do?chem_id=${encodeURIComponent(msds_chem_id)}&viewType=msds`;
  if (cas) {
    return `${KOSHA}/msdssearchMsds.do?${new URLSearchParams({
      searchCondition: 'cas_no', searchKeyword: cas, chkAgree: 'Y', listType: 'msds', pageIndex: '1',
    })}`;
  }
  return null;
}

/** 제조사 사이트에서 상품코드로 SDS(제품 페이지) 찾기 */
export function vendorSdsUrl(vendor, productCode) {
  if (!productCode) return null;
  const base = productCode.replace(/-\d+(?:\.\d+)?(?:MG|KG|UL|ML|G|L)(?:-[A-Z0-9]+)?$/, '');
  const q = encodeURIComponent(base);
  switch (vendor) {
    case 'Sigma-Aldrich':
      return `https://www.sigmaaldrich.com/KR/ko/search/${q}?focus=products&page=1&perpage=30&sort=relevance&term=${q}&type=product`;
    case 'TCI':
      return `https://www.tcichemicals.com/KR/ko/search/?text=${q}`;
    case 'Alfa Aesar':
    case 'Thermo Fisher':
      return `https://www.thermofisher.com/search/results?query=${q}`;
    default:
      return null;
  }
}

export function msdsLinks(r) {
  const links = [];
  if (r.msds_url) links.push({ label: '제조사 MSDS', url: r.msds_url, primary: true });
  const kosha = koshaMsdsUrl(r);
  if (kosha) links.push({ label: r.msds_chem_id ? 'KOSHA MSDS' : 'KOSHA MSDS 검색', url: kosha });
  const vendor = !r.msds_url && vendorSdsUrl(r.vendor, r.product_code);
  if (vendor) links.push({ label: `${r.vendor} SDS 찾기`, url: vendor });
  if (r.pubchem_cid) {
    links.push({ label: 'PubChem 안전정보', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${r.pubchem_cid}#section=Safety-and-Hazards` });
  }
  return links;
}

export function renderMsdsLinks(r) {
  const links = msdsLinks(r);
  if (!links.length) return '<span class="muted">CAS 번호가 없어 MSDS를 찾을 수 없습니다.</span>';
  return `<div class="link-row">${links.map((l) =>
    `<a class="button small ${l.primary ? 'primary' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">📄 ${esc(l.label)}</a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- 법적 분류
// 취급·보관에 주의가 필요한 분류 (2025 화관법 개정 후 명칭 포함)
const CAUTION = /유독|허가|제한|금지|사고대비|급성|만성|생태유해|중점관리/;

export function renderRegClasses(classes = [], { detail = false } = {}) {
  if (!classes.length) return '';
  const badges = classes.map((c) =>
    `<span class="reg ${CAUTION.test(c.type) ? 'reg-caution' : ''}" title="${esc([c.no, c.content, c.date].filter(Boolean).join(' · '))}">${esc(c.type)}</span>`).join('');
  if (!detail) return `<div class="reg-row">${badges}</div>`;
  return `
    <div class="reg-row">${badges}</div>
    <ul class="reg-list">${classes.map((c) => `
      <li><strong>${esc(c.type)}</strong>${c.no ? ` <span class="muted">${esc(c.no)}</span>` : ''}
        ${c.content ? `<div class="small">함량: ${esc(c.content)}</div>` : ''}
        ${c.exception ? `<div class="small muted">예외: ${esc(c.exception)}</div>` : ''}
        ${c.date || c.notice ? `<div class="small muted">${esc([c.date, c.notice].filter(Boolean).join(' · '))}</div>` : ''}
      </li>`).join('')}</ul>`;
}

export function regAlerts(classes = []) {
  const caution = classes.filter((c) => CAUTION.test(c.type)).map((c) => c.type);
  if (!caution.length) return [];
  return [{
    level: 'warn',
    msg: `화학물질관리법 관리 대상입니다: ${[...new Set(caution)].join(', ')}. 보관·취급 기준과 MSDS를 확인하세요.`,
  }];
}
