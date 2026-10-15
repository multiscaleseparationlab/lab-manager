// 공통 상단 메뉴 + 로그인/승인 확인
import { db, DEMO } from './db.js';
import { LAB_NAME } from './config.js';
import { esc, errMsg } from './ui.js';

const LINKS = [
  { key: 'search', href: 'index.html', label: '검색' },
  { key: 'register', href: 'register.html', label: '등록' },
  { key: 'disposed', href: 'disposed.html', label: '폐기 목록' },
  { key: 'admin', href: 'admin.html', label: '관리', admin: true },
];

/** 페이지 시작 시 호출. 사용 가능한 사용자면 user 객체, 아니면 안내 화면을 그리고 null */
export async function initPage(active, { adminOnly = false } = {}) {
  const header = document.getElementById('app-header');
  const main = document.querySelector('main');
  let user = null;
  let loadError = null;
  try {
    user = await db.currentUser();
  } catch (e) {
    loadError = e;
  }

  header.innerHTML = `
    ${DEMO ? '<div class="demo-banner">데모 모드 · 데이터가 이 브라우저에만 저장됩니다. 실제 운영 설정은 README를 참고하세요.</div>' : ''}
    <div class="topbar">
      <a class="brand" href="index.html">${esc(LAB_NAME)}</a>
      <nav>${LINKS.filter((l) => !l.admin || user?.isAdmin).map((l) =>
        `<a href="${l.href}" class="${l.key === active ? 'active' : ''}">${l.label}</a>`).join('')}</nav>
      <div class="user">${user && !DEMO
        ? `<span class="muted">${esc(user.name)}</span><button class="link" id="signout">로그아웃</button>`
        : ''}</div>
    </div>`;
  header.querySelector('#signout')?.addEventListener('click', async () => {
    await db.signOut();
    location.reload();
  });

  if (loadError) {
    main.innerHTML = `<div class="card center"><p>서버에 연결하지 못했습니다.</p><p class="muted">${esc(errMsg(loadError))}</p></div>`;
    return null;
  }
  if (!user) {
    main.innerHTML = `
      <div class="card center">
        <h1>로그인이 필요합니다</h1>
        <p class="muted">승인된 연구실 구성원만 사용할 수 있습니다.</p>
        <button class="primary" id="signin">Google 계정으로 로그인</button>
      </div>`;
    main.querySelector('#signin').addEventListener('click', () => db.signIn());
    return null;
  }
  if (!user.approved) {
    main.innerHTML = `
      <div class="card center">
        <h1>승인 대기 중</h1>
        <p><strong>${esc(user.email)}</strong> 계정은 아직 승인되지 않았습니다.</p>
        <p class="muted">관리자에게 이 이메일을 승인 목록에 추가해 달라고 요청하세요.</p>
      </div>`;
    return null;
  }
  if (adminOnly && !user.isAdmin) {
    main.innerHTML = '<div class="card center"><p>관리자만 볼 수 있는 페이지입니다.</p></div>';
    return null;
  }
  return user;
}
