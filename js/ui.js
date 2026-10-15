// 공통 화면 도우미
import { CABINET_TYPES } from './constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 검색 정규화: 소문자 + 공백 제거 (supabase/schema.sql 트리거와 같은 규칙)
export function normSearch(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '');
}

export function buildSearchText(r) {
  return normSearch([r.name, r.name_kor, r.abbreviation, r.cas, r.product_code, r.vendor, ...(r.synonyms || [])]
    .filter(Boolean).join('|'));
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtAmount(r) {
  const base = `${Number(r.amount)} ${r.unit}`;
  return r.quantity > 1 ? `${base} × ${r.quantity}병` : base;
}

export function cabinetLabel(c) {
  if (!c) return '(보관함 없음)';
  return c.shelf ? `${c.name} · ${c.shelf}` : c.name;
}

export function cabinetOptions(cabinets, selectedId, placeholder = '보관함 선택') {
  const opts = cabinets.map((c) =>
    `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>` +
    `${esc(cabinetLabel(c))} (${esc(CABINET_TYPES[c.cabinet_type] || c.cabinet_type)})</option>`);
  return `<option value="">${esc(placeholder)}</option>${opts.join('')}`;
}

export function statusBadge(status) {
  const cls = { 미개봉: 'st-new', 사용중: 'st-use', 폐기: 'st-gone' }[status] || '';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

export function ghsIcons(pictograms = [], size = 'md') {
  return pictograms.map((p) =>
    `<img class="ghs ghs-${size}" src="https://pubchem.ncbi.nlm.nih.gov/images/ghs/${esc(p)}.svg" alt="${esc(p)}" title="${esc(p)}" loading="lazy">`).join('');
}

export function renderAlerts(list) {
  return list.map((a) => `<div class="alert ${a.level}">${a.html ?? esc(a.msg)}</div>`).join('');
}

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), 3500);
}

export function errMsg(e) {
  return e?.message || String(e);
}
