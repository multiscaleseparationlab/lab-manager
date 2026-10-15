// 시약 상세: 정보 확인, 수정, 폐기(승인 사용자), 복원(관리자)
import { db } from './db.js';
import { initPage } from './nav.js';
import { pubchemUrl } from './pubchem.js';
import { checkCompat, hazardCategories, HAZARD_LABELS } from './compat.js';
import { UNITS, ACTIVE_STATUSES, DISPOSED, DISPOSE_REASONS } from './constants.js';
import { KR_API_ENABLED, lookupKr, renderMsdsLinks, renderRegClasses } from './krchem.js';
import {
  $, esc, cabinetLabel, cabinetOptions, fmtAmount, fmtDateTime, statusBadge, ghsIcons, renderAlerts, toast, errMsg,
} from './ui.js';

const user = await initPage('search');
if (user) await start();

async function start() {
  const main = document.querySelector('main');
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const [cabinets, initial] = await Promise.all([db.listCabinets(), id ? db.getReagent(id) : null]);
  if (!initial) {
    main.innerHTML = '<div class="card center"><p>시약을 찾을 수 없습니다.</p><a href="index.html">검색으로 돌아가기</a></div>';
    return;
  }
  if (params.get('new')) {
    toast('등록되었습니다');
    history.replaceState(null, '', `?id=${id}`);
  }

  let r = initial;
  await render();

  async function render() {
    const disposed = r.status === DISPOSED;
    document.title = `${r.name} · 시약 관리`;
    const hz = [...hazardCategories(r.ghs_codes)].map((h) => HAZARD_LABELS[h]);
    const backHref = disposed ? 'disposed.html' : 'index.html';

    main.innerHTML = `
      <a class="back" href="${backHref}">← ${disposed ? '폐기 목록' : '검색'}으로</a>
      <div class="detail-head">
        <h1>${esc(r.name)}</h1>
        ${r.name_kor ? `<span class="kor-name">${esc(r.name_kor)}</span>` : ''}
        ${r.abbreviation ? `<span class="tag big">${esc(r.abbreviation)}</span>` : ''}
        ${statusBadge(r.status)}
      </div>

      ${disposed ? `
        <div class="alert danger">
          <strong>폐기된 시약입니다.</strong> ${esc(fmtDateTime(r.disposed_at))} · ${esc(r.disposed_by_name || r.disposed_by || '')}
          ${r.dispose_reason ? `<br>사유: ${esc(r.dispose_reason)}` : ''}
        </div>` : ''}

      <section class="card">
        <dl class="info">
          <dt>CAS</dt><dd class="mono">${esc(r.cas || '—')}
            ${r.pubchem_cid ? ` · <a href="${pubchemUrl(r.pubchem_cid)}" target="_blank" rel="noopener">PubChem</a>` : ''}</dd>
          <dt>보관함</dt><dd>${esc(cabinetLabel(r.cabinet))}</dd>
          <dt>양</dt><dd>${esc(fmtAmount(r))}</dd>
          ${r.vendor || r.product_code ? `<dt>제조사 / 코드</dt><dd>${esc(r.vendor || '—')} · <span class="mono">${esc(r.product_code || '—')}</span></dd>` : ''}
          ${r.concentration || r.solvent ? `<dt>용액</dt><dd>${esc([r.concentration, r.solvent].filter(Boolean).join(' in '))}</dd>` : ''}
          ${r.formula ? `<dt>분자식</dt><dd><span class="mono">${esc(r.formula)}</span>${r.mw ? ` · ${r.mw} g/mol` : ''}</dd>` : ''}
          ${r.ghs_pictograms?.length || r.ghs_codes?.length ? `
            <dt>GHS</dt><dd>${ghsIcons(r.ghs_pictograms)}
              ${hz.length ? `<div>${esc(hz.join(', '))}</div>` : ''}
              <div class="muted small">${esc((r.ghs_codes || []).join(' '))}</div></dd>` : ''}
          ${r.ke_no ? `<dt>KE 번호</dt><dd class="mono">${esc(r.ke_no)}</dd>` : ''}
          ${r.memo ? `<dt>메모</dt><dd class="pre">${esc(r.memo)}</dd>` : ''}
          <dt>등록</dt><dd>${esc(r.created_by_name || r.created_by)} · ${esc(fmtDateTime(r.created_at))}</dd>
          ${r.updated_at !== r.created_at ? `<dt>최근 수정</dt><dd>${esc(fmtDateTime(r.updated_at))}</dd>` : ''}
        </dl>
      </section>

      <section class="card">
        <h2>안전 정보</h2>
        <div class="sub-head">MSDS</div>
        ${renderMsdsLinks(r)}
        <div class="sub-head">화학물질관리법 분류</div>
        ${r.reg_classes?.length ? renderRegClasses(r.reg_classes, { detail: true })
          : `<p class="muted small">${r.msds_chem_id || r.ke_no || r.name_kor ? '해당 없음' : '아직 조회하지 않았습니다.'}</p>`}
        ${KR_API_ENABLED && r.cas && !disposed
          ? '<button id="kr-refresh" class="small" type="button">국문명·법적 분류·MSDS 다시 불러오기</button>' : ''}
      </section>

      ${disposed ? '' : `
      <form id="edit-form" class="card form-grid">
        <h2 class="full">정보 수정</h2>
        <div class="field">
          <label for="e-status">상태</label>
          <select id="e-status" name="status">${ACTIVE_STATUSES.map((s) =>
            `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="e-cabinet">보관함</label>
          <select id="e-cabinet" name="cabinet_id">${cabinetOptions(cabinets, r.cabinet_id)}</select>
        </div>
        <div class="field">
          <label for="e-amount">양</label>
          <div class="row">
            <input id="e-amount" name="amount" type="number" min="0" step="any" value="${Number(r.amount)}">
            <select name="unit" class="unit">${UNITS.map((u) =>
              `<option ${u === r.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field">
          <label for="e-qty">병 수</label>
          <input id="e-qty" name="quantity" type="number" min="1" step="1" value="${r.quantity}">
        </div>
        <div class="field">
          <label for="e-abbr">약칭</label>
          <input id="e-abbr" name="abbreviation" value="${esc(r.abbreviation)}">
        </div>
        <div class="field">
          <label for="e-kor">한글 이름</label>
          <input id="e-kor" name="name_kor" value="${esc(r.name_kor)}">
        </div>
        <div class="field full">
          <label for="e-msds">제조사 MSDS 주소</label>
          <input id="e-msds" name="msds_url" type="url" placeholder="https://…" value="${esc(r.msds_url)}">
        </div>
        <div class="field full">
          <label for="e-memo">메모</label>
          <textarea id="e-memo" name="memo" rows="2">${esc(r.memo)}</textarea>
        </div>
        <div id="edit-warn" class="field full"></div>
        <div class="field full actions"><button class="primary" type="submit">변경 저장</button></div>
      </form>`}

      <section id="siblings"></section>

      <div class="danger-zone">
        ${disposed
          ? (user.isAdmin ? '<button id="restore" class="primary">복원 (검색에 다시 표시)</button>'
            : '<p class="muted small">잘못 폐기했다면 관리자에게 복원을 요청하세요.</p>')
          : '<button id="dispose" class="danger">🗑 이 시약 폐기</button>'}
      </div>`;

    bindEvents(disposed);
    renderSiblings();
  }

  function bindEvents(disposed) {
    $('#kr-refresh')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = '불러오는 중…';
      try {
        const res = await lookupKr(r.cas);
        if (!res?.found) {
          toast('공공데이터에서 이 CAS 번호를 찾지 못했습니다', 'err');
          render();
          return;
        }
        r = await db.updateReagent(r.id, {
          name_kor: r.name_kor || res.nameKor,
          ke_no: res.keNo,
          reg_classes: res.classes,
          msds_chem_id: res.msdsChemId,
        });
        toast('국문 정보를 갱신했습니다');
        render();
      } catch (err) {
        toast(`조회 실패: ${errMsg(err)}`, 'err');
        render();
      }
    });
    if (!disposed) {
      const form = $('#edit-form');
      const warn = () => {
        const cab = cabinets.find((c) => String(c.id) === form.elements.cabinet_id.value);
        $('#edit-warn').innerHTML = renderAlerts(checkCompat(r.ghs_codes, cab?.cabinet_type));
      };
      warn();
      form.elements.cabinet_id.addEventListener('change', warn);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = form.elements;
        const amount = Number(f.amount.value);
        if (!(amount > 0) || !f.cabinet_id.value) {
          $('#edit-warn').innerHTML = renderAlerts([{ level: 'danger', msg: '양과 보관함을 확인하세요.' }]);
          return;
        }
        const msdsUrl = f.msds_url.value.trim();
        if (msdsUrl && !/^https?:\/\//.test(msdsUrl)) {
          $('#edit-warn').innerHTML = renderAlerts([{ level: 'danger', msg: 'MSDS 주소는 http:// 또는 https:// 로 시작해야 합니다.' }]);
          return;
        }
        try {
          r = await db.updateReagent(r.id, {
            status: f.status.value,
            cabinet_id: Number(f.cabinet_id.value),
            amount,
            unit: f.unit.value,
            quantity: Math.max(1, parseInt(f.quantity.value, 10) || 1),
            abbreviation: f.abbreviation.value.trim(),
            name_kor: f.name_kor.value.trim(),
            msds_url: msdsUrl,
            memo: f.memo.value.trim(),
          });
          toast('저장했습니다');
          render();
        } catch (err) {
          toast(`저장 실패: ${errMsg(err)}`, 'err');
        }
      });
      $('#dispose').addEventListener('click', openDisposeDialog);
    } else {
      $('#restore')?.addEventListener('click', async () => {
        if (!confirm('이 시약을 복원할까요? 상태는 "사용중"이 되고 검색에 다시 나타납니다.')) return;
        try {
          r = await db.restoreReagent(r.id);
          toast('복원했습니다');
          render();
        } catch (err) {
          toast(`복원 실패: ${errMsg(err)}`, 'err');
        }
      });
    }
  }

  function openDisposeDialog() {
    const dlg = $('#dispose-dialog');
    const reasonEl = $('#dispose-reason');
    $('#dispose-target').innerHTML =
      `<strong>${esc(r.name)}</strong> · ${esc(cabinetLabel(r.cabinet))} · ${esc(fmtAmount(r))}`;
    reasonEl.value = '';
    $('#reason-chips').innerHTML = DISPOSE_REASONS.map((t) =>
      `<button type="button" class="chip" data-reason="${esc(t)}">${esc(t)}</button>`).join('');
    $('#reason-chips').onclick = (e) => {
      const b = e.target.closest('.chip');
      if (b) reasonEl.value = b.dataset.reason;
    };
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok') return;
      try {
        r = await db.disposeReagent(r.id, reasonEl.value.trim());
        toast('폐기했습니다. 이제 검색에 나타나지 않습니다.');
        render();
      } catch (err) {
        toast(`폐기 실패: ${errMsg(err)}`, 'err');
      }
    };
    dlg.returnValue = '';
    dlg.showModal();
  }

  // 같은 CAS의 다른 병 (사용 중인 것만)
  async function renderSiblings() {
    const box = $('#siblings');
    if (!r.cas) return;
    try {
      const others = (await db.findActiveByCas(r.cas)).filter((o) => o.id !== r.id);
      if (!others.length) return;
      box.innerHTML = `
        <section class="card">
          <h2>같은 시약의 다른 병 (${others.length})</h2>
          <ul class="plain">${others.map((o) => `
            <li><a href="reagent.html?id=${o.id}">${esc(cabinetLabel(o.cabinet))}</a>
              · ${esc(fmtAmount(o))} ${statusBadge(o.status)}</li>`).join('')}</ul>
        </section>`;
    } catch (e) {
      console.warn(e);
    }
  }
}
