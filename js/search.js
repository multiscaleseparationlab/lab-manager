// 재고 검색 (폐기된 시약 제외)
import { db } from './db.js';
import { initPage } from './nav.js';
import { $, esc, debounce, cabinetLabel, cabinetOptions, fmtAmount, statusBadge, ghsIcons, errMsg } from './ui.js';

const user = await initPage('search');
if (user) await start();

async function start() {
  const params = new URLSearchParams(location.search);
  const qEl = $('#q');
  const cabEl = $('#f-cabinet');
  const stEl = $('#f-status');
  const results = $('#results');

  const cabinets = await db.listCabinets();
  cabEl.innerHTML = cabinetOptions(cabinets, params.get('cabinet'), '모든 보관함');
  qEl.value = params.get('q') || '';
  stEl.value = params.get('status') || '';

  let seq = 0;
  async function run() {
    const my = ++seq;
    const q = qEl.value.trim();
    syncUrl({ q, cabinet: cabEl.value, status: stEl.value });
    let rows;
    try {
      rows = await db.searchReagents({ q, cabinetId: cabEl.value, status: stEl.value });
    } catch (e) {
      results.innerHTML = `<div class="alert danger">검색 실패: ${esc(errMsg(e))}</div>`;
      return;
    }
    if (my !== seq) return;
    $('#count').textContent = `${rows.length}건`;
    results.innerHTML = rows.length ? rows.map(row).join('') : empty(q);
  }

  const runSoon = debounce(run, 200);
  qEl.addEventListener('input', runSoon);
  cabEl.addEventListener('change', run);
  stEl.addEventListener('change', run);
  run();
}

function row(r) {
  return `
    <a class="result" href="reagent.html?id=${r.id}">
      <div class="r-main">
        <strong>${esc(r.name)}</strong>
        ${r.name_kor ? `<span class="kor-name small">${esc(r.name_kor)}</span>` : ''}
        ${r.abbreviation ? `<span class="tag">${esc(r.abbreviation)}</span>` : ''}
        ${r.concentration ? `<span class="muted">${esc(r.concentration)}</span>` : ''}
        <span class="r-ghs">${ghsIcons(r.ghs_pictograms, 'sm')}</span>
      </div>
      <div class="r-sub">
        <span class="mono">${esc(r.cas || 'CAS 없음')}</span>
        <span>📦 ${esc(cabinetLabel(r.cabinet))}</span>
        <span>${esc(fmtAmount(r))}</span>
        ${statusBadge(r.status)}
      </div>
    </a>`;
}

function empty(q) {
  if (!q) {
    return `<div class="empty">조건에 맞는 시약이 없습니다.<br><a class="button primary" href="register.html">시약 등록하기</a></div>`;
  }
  return `
    <div class="empty">
      ‘${esc(q)}’에 해당하는 시약이 없습니다.<br>
      <a class="button primary" href="register.html?q=${encodeURIComponent(q)}">이 시약 등록하기</a>
      <p class="muted small">폐기된 시약은 <a href="disposed.html?q=${encodeURIComponent(q)}">폐기 목록</a>에서 찾을 수 있습니다.</p>
    </div>`;
}

function syncUrl(values) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}
