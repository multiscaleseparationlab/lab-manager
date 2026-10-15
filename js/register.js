// 시약 등록: CAS / 상품코드 / 이름 조회 → 자동 입력 → 중복·호환성 경고 → 저장
import { db } from './db.js';
import { initPage } from './nav.js';
import { lookupPubChem, pubchemUrl } from './pubchem.js';
import { classifyInput, parseCas, normalizeCode, parsePack } from './lookup.js';
import { checkCompat, hazardCategories, HAZARD_LABELS } from './compat.js';
import { UNITS, VENDORS } from './constants.js';
import {
  KR_API_ENABLED, lookupKr, searchKorName, hasHangul, renderMsdsLinks, renderRegClasses, regAlerts,
} from './krchem.js';
import {
  $, esc, cabinetLabel, cabinetOptions, fmtAmount, statusBadge, ghsIcons, renderAlerts, errMsg,
} from './ui.js';

const user = await initPage('register');
if (user) await start();

async function start() {
  const form = $('#reg-form');
  const f = form.elements;
  const lookupEl = $('#lookup');
  const msgEl = $('#lookup-msg');

  const cabinets = await db.listCabinets();
  f.cabinet_id.innerHTML = cabinetOptions(cabinets, '');
  f.unit.innerHTML = UNITS.map((u) => `<option>${u}</option>`).join('');
  f.vendor.innerHTML = `<option value="">선택</option>${VENDORS.map((v) => `<option>${esc(v)}</option>`).join('')}`;

  // PubChem 조회 결과 (어떤 CAS에 대한 결과인지 함께 보관)
  let pub = null;
  let lookupSeq = 0;
  // 국문명·법적 분류·KOSHA MSDS 조회 결과
  let kr = null;
  let krSeq = 0;
  let autoKor = ''; // 자동으로 채운 한글 이름 (사용자가 고쳤으면 덮어쓰지 않음)

  const setMsg = (kind, text) => {
    msgEl.className = `hint ${kind}`;
    msgEl.textContent = text;
  };

  async function fetchByQuery(query, { keepName = false, cas = null } = {}) {
    const my = ++lookupSeq;
    setMsg('', 'PubChem에서 찾는 중…');
    let res;
    try {
      res = await lookupPubChem(query);
    } catch (e) {
      if (my === lookupSeq) setMsg('err', `PubChem 조회 실패: ${errMsg(e)} — 이름을 직접 입력해도 등록할 수 있습니다.`);
      return null;
    }
    if (my !== lookupSeq) return null;
    if (!res) {
      pub = null;
      renderChem();
      setMsg('warn', 'PubChem에서 찾지 못했습니다. 이름을 직접 입력해 주세요.');
      return null;
    }
    if (!cas && res.cas) {
      f.cas.value = res.cas; // 이름으로 조회한 경우
      fetchKr(res.cas);
    }
    pub = { ...res, cas: cas || f.cas.value.trim() };
    if (!keepName || !f.name.value.trim()) f.name.value = res.name;
    renderChoices();
    renderChem();
    setMsg('ok', `✓ ${res.name} 정보를 불러왔습니다. 이름은 아래 후보에서 바꿀 수 있습니다.`);
    updateWarnings();
    return res;
  }

  async function fetchKr(cas) {
    const my = ++krSeq;
    kr = null;
    if (!KR_API_ENABLED || !cas) return;
    let res;
    try {
      res = await lookupKr(cas);
    } catch (e) {
      console.warn('국문 정보 조회 실패', e);
      const el = $('#kr-msg');
      if (my === krSeq && el) el.textContent = `국문명·법적 분류 조회 실패: ${errMsg(e)}`;
      return;
    }
    if (my !== krSeq || !res?.found) {
      renderChem();
      return;
    }
    kr = res;
    if (res.nameKor && (!f.name_kor.value.trim() || f.name_kor.value === autoKor)) {
      f.name_kor.value = res.nameKor;
      autoKor = res.nameKor;
    }
    if (!f.name.value.trim()) f.name.value = res.nameEng || res.nameKor;
    updateWarnings();
  }

  /** CAS 하나로 PubChem + 국문 정보 동시 조회 */
  function loadByCas(cas, opts = {}) {
    f.cas.value = cas;
    $('#cas-msg').textContent = '';
    return Promise.all([fetchByQuery(cas, { ...opts, cas }), fetchKr(cas)]);
  }

  async function lookupKorean(input) {
    if (!KR_API_ENABLED) {
      setMsg('warn', '한글 이름 조회는 공공데이터 API를 연결한 뒤 사용할 수 있습니다 (README 참고). CAS나 영문 이름으로 조회해 주세요.');
      return;
    }
    setMsg('', '한글 이름으로 찾는 중…');
    let list;
    try {
      list = await searchKorName(input);
    } catch (e) {
      setMsg('err', `한글 이름 조회 실패: ${errMsg(e)}`);
      return;
    }
    if (!list.length) {
      setMsg('warn', `'${input}'에 해당하는 물질을 찾지 못했습니다. CAS 번호나 영문 이름으로 조회해 보세요.`);
      return;
    }
    if (list.length === 1) {
      await loadByCas(list[0].cas);
      return;
    }
    setMsg('', `${list.length}개 물질이 있습니다. 하나를 고르세요.`);
    $('#kor-candidates').innerHTML = list.map((c) =>
      `<button type="button" class="chip" data-cas="${esc(c.cas)}">${esc(c.nameKor)} <span class="mono muted">${esc(c.cas)}</span></button>`).join('');
  }

  async function runLookup() {
    const input = lookupEl.value.trim();
    if (!input) return;
    $('#kor-candidates').innerHTML = '';
    if (hasHangul(input)) {
      await lookupKorean(input);
      return;
    }
    const r = classifyInput(input);

    if (r.type === 'cas-invalid') {
      setMsg('err', 'CAS 번호 형식이지만 확인 숫자(마지막 자리)가 맞지 않습니다. 다시 확인해 주세요.');
      return;
    }
    if (r.type === 'cas') {
      await loadByCas(r.cas);
      return;
    }

    // 상품코드: 연구실 캐시 → (없으면) 이름으로 PubChem → (없으면) 첫 등록 안내
    setMsg('', '상품코드를 찾는 중…');
    let hits = [];
    try {
      hits = await db.lookupProductCodes([r.code, r.base]);
    } catch (e) {
      console.warn(e);
    }
    const hit = hits.find((h) => h.code === r.code && (!f.vendor.value || h.vendor === f.vendor.value))
      || hits.find((h) => h.code === r.code) || hits[0];

    if (hit) {
      f.product_code.value = r.code;
      if (hit.vendor) f.vendor.value = hit.vendor;
      if (r.amount) setAmount(r.amount, r.unit);
      else if (hit.amount) setAmount(hit.amount, hit.unit);
      if (hit.name) f.name.value = hit.name;
      await loadByCas(hit.cas, { keepName: true });
      setMsg('ok', `✓ 연구실에 등록된 적 있는 상품코드입니다 (${hit.vendor || '제조사 미지정'}, CAS ${hit.cas}).`);
      return;
    }

    if (r.maybeName) {
      const res = await fetchByQuery(input);
      if (res) return;
    }

    f.product_code.value = r.code;
    if (r.amount) setAmount(r.amount, r.unit);
    setMsg('warn', '처음 등록되는 상품코드입니다. 병 라벨의 CAS 번호를 아래 CAS 칸에 입력하면 자동으로 채워지고, '
      + '다음부터는 이 상품코드만으로 조회됩니다.');
    f.cas.focus();
  }

  function setAmount(amount, unit) {
    f.amount.value = amount;
    if (unit) f.unit.value = unit;
  }

  function renderChoices() {
    const names = pub ? [pub.name, ...pub.synonyms.filter((s) => s.length <= 30)].slice(0, 8) : [];
    $('#name-choices').innerHTML = names.map((n) =>
      `<button type="button" class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('');
    // 약칭 후보: EtOH, DCM, THF, Et2O 처럼 짧고 대문자가 2개 이상이거나 숫자가 섞인 것
    const abbrs = pub ? pub.synonyms.filter((s) => /^[A-Za-z0-9]{2,6}$/.test(s)
      && (/[A-Z].*[A-Z]/.test(s) || /[A-Za-z]\d/.test(s))).slice(0, 6) : [];
    $('#abbr-choices').innerHTML = abbrs.map((n) =>
      `<button type="button" class="chip" data-abbr="${esc(n)}">${esc(n)}</button>`).join('');
  }

  function renderChem() {
    const cas = parseCas(f.cas.value) || '';
    const p = pub && pub.cas === cas ? pub : null;
    const k = kr && kr.cas === cas ? kr : null;
    if (!cas && !p) {
      $('#chem-info').innerHTML = '';
      return;
    }
    const hz = p ? [...hazardCategories(p.ghsCodes)].map((h) => HAZARD_LABELS[h]) : [];
    const msdsUrl = f.msds_url.value.trim();
    $('#chem-info').innerHTML = `
      <div class="chem-box">
        ${p?.pictograms.length ? `<div>${ghsIcons(p.pictograms)}</div>` : ''}
        <div class="grow">
          ${p ? `<div><span class="mono">${esc(p.formula)}</span>${p.mw ? ` · ${p.mw} g/mol` : ''}
            · <a href="${pubchemUrl(p.cid)}" target="_blank" rel="noopener">PubChem</a></div>` : ''}
          ${hz.length ? `<div class="muted">위험 분류: ${esc(hz.join(', '))}</div>` : ''}
          ${p?.ghsCodes.length ? `<div class="muted small">${esc(p.ghsCodes.join(' '))}</div>` : ''}
          ${k?.classes.length ? `<div class="sub-head">화학물질관리법 분류</div>${renderRegClasses(k.classes)}` : ''}
          ${k && !k.classes.length ? '<div class="muted small">화학물질관리법 분류: 해당 없음</div>' : ''}
          <div class="sub-head">MSDS</div>
          ${renderMsdsLinks({
            cas, msds_chem_id: k?.msdsChemId || '', msds_url: /^https?:\/\//.test(msdsUrl) ? msdsUrl : '',
            vendor: f.vendor.value, product_code: normalizeCode(f.product_code.value), pubchem_cid: p?.cid,
          })}
          <p id="kr-msg" class="hint"></p>
        </div>
      </div>`;
  }

  async function updateWarnings() {
    renderChem();
    const cab = cabinets.find((c) => String(c.id) === f.cabinet_id.value);
    const curCas = parseCas(f.cas.value);
    $('#compat-warning').innerHTML = renderAlerts([
      ...checkCompat(pub?.ghsCodes, cab?.cabinet_type),
      ...(kr && kr.cas === curCas ? regAlerts(kr.classes) : []),
    ]);

    const cas = parseCas(f.cas.value);
    if (!cas) {
      $('#dup-warning').innerHTML = '';
      return;
    }
    try {
      const dups = await db.findActiveByCas(cas);
      $('#dup-warning').innerHTML = dups.length ? `
        <div class="alert warn">
          <strong>이미 등록된 같은 시약이 ${dups.length}건 있습니다.</strong> 새 병이 맞다면 그대로 등록하세요.
          <ul class="dup-list">${dups.map((d) => `
            <li><a href="reagent.html?id=${d.id}">${esc(d.name)}</a> · ${esc(cabinetLabel(d.cabinet))}
              · ${esc(fmtAmount(d))} ${statusBadge(d.status)}</li>`).join('')}
          </ul>
        </div>` : '';
    } catch (e) {
      console.warn(e);
    }
  }

  // 이벤트
  $('#lookup-btn').addEventListener('click', runLookup);
  lookupEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runLookup();
    }
  });
  f.cas.addEventListener('change', () => {
    const v = f.cas.value.trim();
    const cas = parseCas(v);
    const casMsg = $('#cas-msg');
    if (v && cas === false) {
      casMsg.className = 'hint err';
      casMsg.textContent = '확인 숫자가 맞지 않습니다.';
    } else if (v && cas === null) {
      casMsg.className = 'hint err';
      casMsg.textContent = 'CAS 형식은 000-00-0 입니다.';
    } else {
      casMsg.textContent = '';
    }
    if (cas && pub?.cas !== cas) loadByCas(cas, { keepName: !!f.name.value.trim() });
    else updateWarnings();
  });
  for (const el of [f.vendor, f.product_code, f.msds_url]) el.addEventListener('change', renderChem);
  $('#kor-candidates').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cas]');
    if (!b) return;
    $('#kor-candidates').innerHTML = '';
    loadByCas(b.dataset.cas);
  });
  f.cabinet_id.addEventListener('change', updateWarnings);
  form.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.name) f.name.value = b.dataset.name;
    if (b.dataset.abbr) f.abbreviation.value = b.dataset.abbr;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    const amount = Number(f.amount.value);
    const casRaw = f.cas.value.trim();
    const cas = casRaw ? parseCas(casRaw) : '';
    const errors = [];
    if (!name) errors.push('시약 이름을 입력하세요.');
    if (!(amount > 0)) errors.push('구매량을 0보다 크게 입력하세요.');
    if (!f.cabinet_id.value) errors.push('보관함을 선택하세요.');
    if (casRaw && !cas) errors.push('CAS 번호를 확인하세요.');
    const msdsUrl = f.msds_url.value.trim();
    if (msdsUrl && !/^https?:\/\//.test(msdsUrl)) errors.push('MSDS 주소는 http:// 또는 https:// 로 시작해야 합니다.');
    if (errors.length) {
      $('#compat-warning').innerHTML = renderAlerts(errors.map((msg) => ({ level: 'danger', msg })));
      return;
    }

    const usePub = pub && pub.cas === cas;
    const useKr = kr && kr.cas === cas;
    const record = {
      name,
      name_kor: f.name_kor.value.trim(),
      abbreviation: f.abbreviation.value.trim(),
      cas: cas || '',
      vendor: f.vendor.value,
      product_code: normalizeCode(f.product_code.value),
      amount,
      unit: f.unit.value,
      quantity: Math.max(1, parseInt(f.quantity.value, 10) || 1),
      concentration: f.concentration.value.trim(),
      solvent: f.solvent.value.trim(),
      cabinet_id: Number(f.cabinet_id.value),
      status: f.status.value,
      memo: f.memo.value.trim(),
      formula: usePub ? pub.formula : '',
      mw: usePub ? pub.mw : null,
      pubchem_cid: usePub ? pub.cid : null,
      ghs_codes: usePub ? pub.ghsCodes : [],
      ghs_pictograms: usePub ? pub.pictograms : [],
      synonyms: usePub ? pub.synonyms : [],
      ke_no: useKr ? kr.keNo : '',
      reg_classes: useKr ? kr.classes : [],
      msds_chem_id: useKr ? kr.msdsChemId : '',
      msds_url: msdsUrl,
    };

    const btn = $('#submit');
    btn.disabled = true;
    btn.textContent = '저장 중…';
    try {
      const created = await db.createReagent(record);
      if (record.product_code && record.cas) {
        // 전체 코드(포장 단위 포함)와 기본 코드 둘 다 저장 → 다른 용량(예: -500ML)도 다음부터 조회됨
        const { base } = parsePack(record.product_code);
        const common = { vendor: record.vendor, cas: record.cas, name: record.name };
        await Promise.all([
          db.saveProductCode({ ...common, code: record.product_code, amount: record.amount, unit: record.unit }),
          base !== record.product_code && db.saveProductCode({ ...common, code: base, amount: null, unit: null }),
        ]).catch((err) => console.warn('상품코드 저장 실패', err));
      }
      location.href = `reagent.html?id=${created.id}&new=1`;
    } catch (err) {
      $('#compat-warning').innerHTML = renderAlerts([{ level: 'danger', msg: `저장 실패: ${errMsg(err)}` }]);
      btn.disabled = false;
      btn.textContent = '등록하기';
    }
  });

  // 검색 화면에서 넘어온 경우 바로 조회
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    lookupEl.value = q;
    runLookup();
  } else {
    lookupEl.focus();
  }
}
