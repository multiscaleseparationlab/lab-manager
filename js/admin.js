// 관리자: 보관함 / 승인 사용자 관리
import { db } from './db.js';
import { initPage } from './nav.js';
import { CABINET_TYPES } from './constants.js';
import { $, esc, toast, errMsg } from './ui.js';

const user = await initPage('admin', { adminOnly: true });
if (user) await start();

async function start() {
  const typeOptions = (sel) => Object.entries(CABINET_TYPES).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const cabForm = $('#cab-form');
  cabForm.elements.cabinet_type.innerHTML = typeOptions('general');

  async function renderCabinets() {
    const list = await db.listCabinets();
    $('#cab-list').innerHTML = `
      <table class="list compact">
        <thead><tr><th>이름</th><th>칸</th><th>종류</th><th></th></tr></thead>
        <tbody>${list.map((c) => `
          <tr>
            <td><a href="index.html?cabinet=${c.id}">${esc(c.name)}</a></td>
            <td>${esc(c.shelf)}</td>
            <td><select data-type="${c.id}">${typeOptions(c.cabinet_type)}</select></td>
            <td><button class="small" data-del-cab="${c.id}">삭제</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function renderUsers() {
    const list = await db.listUsers();
    $('#user-list').innerHTML = `
      <table class="list compact">
        <thead><tr><th>이메일</th><th>이름</th><th>관리자</th><th></th></tr></thead>
        <tbody>${list.map((u) => `
          <tr>
            <td>${esc(u.email)}</td>
            <td>${esc(u.name)}</td>
            <td><input type="checkbox" data-admin="${esc(u.email)}" ${u.is_admin ? 'checked' : ''}
              ${u.email === user.email ? 'disabled title="본인 권한은 바꿀 수 없습니다"' : ''}></td>
            <td>${u.email === user.email ? '' : `<button class="small" data-del-user="${esc(u.email)}">삭제</button>`}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  const guard = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  };

  cabForm.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const f = cabForm.elements;
    await db.addCabinet({ name: f.name.value.trim(), shelf: f.shelf.value.trim(), cabinet_type: f.cabinet_type.value });
    cabForm.reset();
    toast('보관함을 추가했습니다');
    renderCabinets();
  }));

  $('#cab-list').addEventListener('change', guard(async (e) => {
    const id = e.target.dataset.type;
    if (!id) return;
    await db.updateCabinet(id, { cabinet_type: e.target.value });
    toast('종류를 변경했습니다');
  }));

  $('#cab-list').addEventListener('click', guard(async (e) => {
    const id = e.target.dataset.delCab;
    if (!id || !confirm('이 보관함을 삭제할까요?')) return;
    await db.deleteCabinet(id);
    toast('삭제했습니다');
    renderCabinets();
  }));

  const userForm = $('#user-form');
  userForm.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const f = userForm.elements;
    await db.addUser({ email: f.email.value.trim(), name: f.name.value.trim(), is_admin: f.is_admin.checked });
    userForm.reset();
    toast('사용자를 추가했습니다');
    renderUsers();
  }));

  $('#user-list').addEventListener('change', guard(async (e) => {
    const email = e.target.dataset.admin;
    if (!email) return;
    await db.updateUser(email, { is_admin: e.target.checked });
    toast('권한을 변경했습니다');
  }));

  $('#user-list').addEventListener('click', guard(async (e) => {
    const email = e.target.dataset.delUser;
    if (!email || !confirm(`${email} 의 승인을 취소할까요?`)) return;
    await db.removeUser(email);
    toast('삭제했습니다');
    renderUsers();
  }));

  await Promise.all([renderCabinets(), renderUsers()]);
}
