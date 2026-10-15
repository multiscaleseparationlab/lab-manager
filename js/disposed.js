// 폐기된 시약 목록 (최근 폐기 순) + 관리자 복원 + CSV 내보내기
import { db } from './db.js';
import { initPage } from './nav.js';
import { $, esc, debounce, cabinetLabel, fmtAmount, fmtDate, toast, errMsg } from './ui.js';

const user = await initPage('disposed');
if (user) await start();

async function start() {
  const qEl = $('#q');
  const fromEl = $('#f-from');
  const toEl = $('#f-to');
  const results = $('#results');
  qEl.value = new URLSearchParams(location.search).get('q') || '';

  let rows = [];
  let seq = 0;

  async function run() {
    const my = ++seq;
    let to;
    if (toEl.value) {
      const d = new Date(`${toEl.value}T00:00:00`);
      d.setDate(d.getDate() + 1); // 종료일 포함
      to = d.toISOString();
    }
    const from = fromEl.value ? new Date(`${fromEl.value}T00:00:00`).toISOString() : undefined;
    let data;
    try {
      data = await db.searchReagents({ q: qEl.value.trim(), disposed: true, from, to });
    } catch (e) {
      results.innerHTML = `<div class="alert danger">불러오기 실패: ${esc(errMsg(e))}</div>`;
      return;
    }
    if (my !== seq) return;
    rows = data;
    $('#count').textContent = `${rows.length}건`;
    results.innerHTML = rows.length ? table() : '<div class="empty">폐기된 시약이 없습니다.</div>';
  }

  function table() {
    return `
      <div class="table-wrap">
        <table class="list">
          <thead><tr>
            <th>시약</th><th>CAS</th><th>원래 보관함</th><th>양</th><th>폐기일</th><th>폐기자</th><th>사유</th>
            ${user.isAdmin ? '<th></th>' : ''}
          </tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td data-label="시약"><a href="reagent.html?id=${r.id}">${esc(r.name)}</a>
                ${r.name_kor ? `<span class="kor-name small">${esc(r.name_kor)}</span>` : ''}
                ${r.abbreviation ? `<span class="tag">${esc(r.abbreviation)}</span>` : ''}</td>
              <td data-label="CAS" class="mono">${esc(r.cas || '—')}</td>
              <td data-label="원래 보관함">${esc(cabinetLabel(r.cabinet))}</td>
              <td data-label="양">${esc(fmtAmount(r))}</td>
              <td data-label="폐기일">${esc(fmtDate(r.disposed_at))}</td>
              <td data-label="폐기자">${esc(r.disposed_by_name || r.disposed_by || '')}</td>
              <td data-label="사유">${esc(r.dispose_reason || '')}</td>
              ${user.isAdmin ? `<td><button class="small" data-restore="${r.id}">복원</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  results.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-restore]')?.dataset.restore;
    if (!id) return;
    const r = rows.find((x) => String(x.id) === id);
    if (!confirm(`'${r.name}'을(를) 복원할까요? 검색에 다시 나타납니다.`)) return;
    try {
      await db.restoreReagent(id);
      toast('복원했습니다');
      run();
    } catch (err) {
      toast(`복원 실패: ${errMsg(err)}`, 'err');
    }
  });

  $('#csv').addEventListener('click', () => {
    const head = ['시약', '한글 이름', '약칭', 'CAS', '제조사', '상품코드', '원래 보관함', '양', '단위', '병 수', '등록일', '등록자', '폐기일', '폐기자', '사유'];
    const lines = rows.map((r) => [
      r.name, r.name_kor, r.abbreviation, r.cas, r.vendor, r.product_code, cabinetLabel(r.cabinet), r.amount, r.unit, r.quantity,
      fmtDate(r.created_at), r.created_by_name || r.created_by, fmtDate(r.disposed_at),
      r.disposed_by_name || r.disposed_by, r.dispose_reason,
    ]);
    const csv = [head, ...lines]
      .map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), {
      href: url, download: `폐기시약_${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  });

  qEl.addEventListener('input', debounce(run, 200));
  fromEl.addEventListener('change', run);
  toEl.addEventListener('change', run);
  run();
}
