// 데모 데이터 계층: Supabase 없이 이 브라우저(localStorage)에 저장.
// db-supabase.js 와 같은 함수 모양 + schema.sql 트리거와 같은 폐기/복원 규칙.
import { buildSearchText, normSearch } from './ui.js';
import { DISPOSED } from './constants.js';

const KEY = 'reagent-manager-demo-v2';
const USER = { email: 'demo@example.com', name: '데모 사용자', approved: true, isAdmin: true };

let mem = null;

function seed() {
  const now = new Date().toISOString();
  const s = { seq: { cabinet: 0, reagent: 0 }, cabinets: [], users: [], reagents: [], productCodes: [] };
  const cab = (name, shelf, cabinet_type) => {
    const c = { id: ++s.seq.cabinet, name, shelf, cabinet_type, memo: '' };
    s.cabinets.push(c);
    return c.id;
  };
  const fA1 = cab('인화성 캐비닛 A', '1단', 'flammable');
  cab('인화성 캐비닛 A', '2단', 'flammable');
  const acid = cab('산 캐비닛', '', 'acid');
  cab('염기 캐비닛', '', 'base');
  cab('산화제 보관함', '', 'oxidizer');
  cab('독성 잠금장', '', 'toxic');
  cab('일반 선반 1', '', 'general');
  cab('냉장고 1', '', 'fridge');
  s.users.push({ email: USER.email, name: USER.name, is_admin: true, created_at: now });

  const add = (r) => {
    const row = {
      name_kor: '', abbreviation: '', vendor: '', product_code: '', quantity: 1, concentration: '', solvent: '',
      ke_no: '', reg_classes: [], msds_chem_id: '', msds_url: '', formula: '', mw: null, pubchem_cid: null, ghs_codes: [], ghs_pictograms: [], synonyms: [], memo: '',
      created_by: USER.email, created_by_name: USER.name, created_at: now, updated_at: now,
      disposed_at: null, disposed_by: null, disposed_by_name: null, dispose_reason: null,
      ...r, id: ++s.seq.reagent,
    };
    row.search_text = buildSearchText(row);
    s.reagents.push(row);
  };
  add({
    name: 'Acetone', name_kor: '아세톤', cas: '67-64-1', amount: 1, unit: 'L', cabinet_id: fA1, status: '사용중',
    formula: 'C3H6O', mw: 58.08, pubchem_cid: 180, ghs_codes: ['H225', 'H319', 'H336'],
    ghs_pictograms: ['GHS02', 'GHS07'], synonyms: ['propanone', '2-propanone', 'dimethyl ketone'],
  });
  add({
    name: 'Ethanol', name_kor: '에탄올', abbreviation: 'EtOH', cas: '64-17-5', amount: 500, unit: 'mL', quantity: 2,
    cabinet_id: fA1, status: '미개봉', formula: 'C2H6O', mw: 46.07, pubchem_cid: 702,
    ghs_codes: ['H225', 'H319'], ghs_pictograms: ['GHS02', 'GHS07'], synonyms: ['ethyl alcohol', 'alcohol'],
  });
  add({
    name: 'Hydrochloric acid', name_kor: '염화수소', abbreviation: '염산', cas: '7647-01-0', amount: 500, unit: 'mL',
    concentration: '37%', solvent: 'water', cabinet_id: acid, status: '사용중', formula: 'ClH', mw: 36.46,
    pubchem_cid: 313, ghs_codes: ['H290', 'H314', 'H335'], ghs_pictograms: ['GHS05', 'GHS07'],
    synonyms: ['hydrogen chloride', 'muriatic acid'],
  });
  add({
    name: 'Diethyl ether', name_kor: '디에틸 에테르', abbreviation: 'ether', cas: '60-29-7', amount: 1, unit: 'L', cabinet_id: fA1,
    status: DISPOSED, formula: 'C4H10O', mw: 74.12, pubchem_cid: 3283, ghs_codes: ['H224', 'H302', 'H336'],
    ghs_pictograms: ['GHS02', 'GHS07'], synonyms: ['ethyl ether', 'Et2O'],
    disposed_at: now, disposed_by: USER.email, disposed_by_name: USER.name, dispose_reason: '유효기간 경과',
  });
  return s;
}

function load() {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) mem = JSON.parse(raw);
  } catch { /* 저장소를 쓸 수 없으면 메모리만 사용 */ }
  if (!mem) {
    mem = seed();
    save();
  }
  return mem;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch { /* 무시 */ }
}

const clone = (o) => structuredClone(o);

function withCabinet(r) {
  const c = load().cabinets.find((x) => x.id === r.cabinet_id);
  return { ...clone(r), cabinet: c ? clone(c) : null };
}

function findReagent(id) {
  const r = load().reagents.find((x) => String(x.id) === String(id));
  if (!r) throw new Error('시약을 찾을 수 없습니다');
  return r;
}

export const demoDb = {
  async currentUser() {
    return { ...USER };
  },
  async signIn() {},
  async signOut() {},

  // 보관함
  async listCabinets() {
    return clone(load().cabinets).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko') || a.shelf.localeCompare(b.shelf, 'ko'));
  },
  async addCabinet(c) {
    const s = load();
    if (s.cabinets.some((x) => x.name === c.name && x.shelf === (c.shelf || ''))) {
      throw new Error('같은 이름·칸의 보관함이 이미 있습니다');
    }
    const row = { memo: '', shelf: '', cabinet_type: 'general', ...c, id: ++s.seq.cabinet };
    s.cabinets.push(row);
    save();
    return clone(row);
  },
  async updateCabinet(id, patch) {
    Object.assign(load().cabinets.find((x) => x.id === Number(id)), patch);
    save();
  },
  async deleteCabinet(id) {
    const s = load();
    if (s.reagents.some((r) => r.cabinet_id === Number(id))) {
      throw new Error('이 보관함에 등록된 시약(폐기 포함)이 있어 삭제할 수 없습니다.');
    }
    s.cabinets = s.cabinets.filter((x) => x.id !== Number(id));
    save();
  },

  // 사용자
  async listUsers() {
    return clone(load().users);
  },
  async addUser(u) {
    const s = load();
    const email = u.email.toLowerCase();
    if (s.users.some((x) => x.email === email)) throw new Error('이미 등록된 이메일입니다');
    s.users.push({ name: '', is_admin: false, ...u, email, created_at: new Date().toISOString() });
    save();
  },
  async updateUser(email, patch) {
    Object.assign(load().users.find((x) => x.email === email), patch);
    save();
  },
  async removeUser(email) {
    const s = load();
    s.users = s.users.filter((x) => x.email !== email);
    save();
  },

  // 시약
  async searchReagents({ q = '', disposed = false, cabinetId, status, from, to, limit = 500 } = {}) {
    const n = normSearch(q);
    let rows = load().reagents.filter((r) => (disposed ? r.status === DISPOSED : r.status !== DISPOSED));
    if (n) rows = rows.filter((r) => r.search_text.includes(n));
    if (cabinetId) rows = rows.filter((r) => r.cabinet_id === Number(cabinetId));
    if (status) rows = rows.filter((r) => r.status === status);
    if (from) rows = rows.filter((r) => r.disposed_at >= from);
    if (to) rows = rows.filter((r) => r.disposed_at < to);
    rows.sort(disposed
      ? (a, b) => b.disposed_at.localeCompare(a.disposed_at)
      : (a, b) => a.name.localeCompare(b.name, 'ko') || a.created_at.localeCompare(b.created_at));
    return rows.slice(0, limit).map(withCabinet);
  },
  async getReagent(id) {
    const r = load().reagents.find((x) => String(x.id) === String(id));
    return r ? withCabinet(r) : null;
  },
  async findActiveByCas(cas) {
    return load().reagents.filter((r) => r.cas === cas && r.status !== DISPOSED).map(withCabinet);
  },
  async createReagent(r) {
    const s = load();
    if (r.status === DISPOSED) throw new Error('새 시약을 폐기 상태로 등록할 수 없습니다');
    const now = new Date().toISOString();
    const row = {
      name_kor: '', abbreviation: '', cas: '', vendor: '', product_code: '', quantity: 1, concentration: '', solvent: '',
      ke_no: '', reg_classes: [], msds_chem_id: '', msds_url: '', status: '미개봉', formula: '', mw: null, pubchem_cid: null, ghs_codes: [], ghs_pictograms: [],
      synonyms: [], memo: '',
      ...r,
      id: ++s.seq.reagent, cabinet_id: Number(r.cabinet_id),
      created_by: USER.email, created_by_name: USER.name, created_at: now, updated_at: now,
      disposed_at: null, disposed_by: null, disposed_by_name: null, dispose_reason: null,
    };
    row.search_text = buildSearchText(row);
    s.reagents.push(row);
    save();
    return clone(row);
  },
  async updateReagent(id, patch) {
    const r = findReagent(id);
    const next = { ...r, ...patch };
    if ('cabinet_id' in patch) next.cabinet_id = Number(patch.cabinet_id);
    if (r.status === DISPOSED && next.status !== DISPOSED) {
      Object.assign(next, { disposed_at: null, disposed_by: null, disposed_by_name: null, dispose_reason: null });
    } else if (r.status === DISPOSED) {
      throw new Error('폐기된 시약은 수정할 수 없습니다');
    } else if (next.status === DISPOSED) {
      Object.assign(next, { disposed_at: new Date().toISOString(), disposed_by: USER.email, disposed_by_name: USER.name });
    }
    next.updated_at = new Date().toISOString();
    next.search_text = buildSearchText(next);
    Object.assign(r, next);
    save();
    return withCabinet(r);
  },
  disposeReagent(id, reason) {
    return demoDb.updateReagent(id, { status: DISPOSED, dispose_reason: reason || '' });
  },
  restoreReagent(id) {
    return demoDb.updateReagent(id, { status: '사용중' });
  },

  // 데모 모드에서는 공공데이터 API를 쓰지 않음
  async chemInfoKr() {
    return null;
  },

  // 상품코드 캐시
  async lookupProductCodes(codes) {
    return clone(load().productCodes.filter((p) => codes.includes(p.code)));
  },
  async saveProductCode(p) {
    const s = load();
    const i = s.productCodes.findIndex((x) => x.vendor === p.vendor && x.code === p.code);
    const row = { ...p, updated_at: new Date().toISOString() };
    if (i >= 0) s.productCodes[i] = row;
    else s.productCodes.push(row);
    save();
  },
};
