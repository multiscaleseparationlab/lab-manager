// Supabase 데이터 계층 (권한은 supabase/schema.sql 의 RLS·트리거가 강제)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { normSearch } from './ui.js';
import { DISPOSED } from './constants.js';

const WITH_CABINET = '*, cabinet:cabinets(id,name,shelf,cabinet_type)';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createSupabaseDb(url, key) {
  const sb = createClient(url, key);

  const api = {
    async currentUser() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      const email = session.user.email.toLowerCase();
      const { data } = await sb.from('approved_users').select('*').eq('email', email).maybeSingle();
      return {
        email,
        name: data?.name || session.user.user_metadata?.full_name || email,
        approved: !!data,
        isAdmin: !!data?.is_admin,
      };
    },
    signIn() {
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname + location.search },
      });
    },
    signOut: () => sb.auth.signOut(),

    // 보관함
    listCabinets: async () => check(await sb.from('cabinets').select('*').order('name').order('shelf')),
    addCabinet: async (c) => check(await sb.from('cabinets').insert(c).select().single()),
    updateCabinet: async (id, patch) => check(await sb.from('cabinets').update(patch).eq('id', id)),
    async deleteCabinet(id) {
      const { error } = await sb.from('cabinets').delete().eq('id', id);
      if (error?.code === '23503') throw new Error('이 보관함에 등록된 시약(폐기 포함)이 있어 삭제할 수 없습니다.');
      if (error) throw new Error(error.message);
    },

    // 사용자
    listUsers: async () => check(await sb.from('approved_users').select('*').order('created_at')),
    addUser: async (u) => check(await sb.from('approved_users').insert({ ...u, email: u.email.toLowerCase() })),
    updateUser: async (email, patch) => check(await sb.from('approved_users').update(patch).eq('email', email)),
    removeUser: async (email) => check(await sb.from('approved_users').delete().eq('email', email)),

    // 시약
    async searchReagents({ q = '', disposed = false, cabinetId, status, from, to, limit = 500 } = {}) {
      let query = sb.from('reagents').select(WITH_CABINET);
      query = disposed ? query.eq('status', DISPOSED) : query.neq('status', DISPOSED);
      const n = normSearch(q);
      if (n) query = query.ilike('search_text', `%${escapeLike(n)}%`);
      if (cabinetId) query = query.eq('cabinet_id', cabinetId);
      if (status) query = query.eq('status', status);
      if (from) query = query.gte('disposed_at', from);
      if (to) query = query.lt('disposed_at', to);
      query = disposed
        ? query.order('disposed_at', { ascending: false })
        : query.order('name').order('created_at');
      return check(await query.limit(limit));
    },
    getReagent: async (id) => check(await sb.from('reagents').select(WITH_CABINET).eq('id', id).maybeSingle()),
    findActiveByCas: async (cas) =>
      check(await sb.from('reagents').select(WITH_CABINET).eq('cas', cas).neq('status', DISPOSED)),
    createReagent: async (r) => check(await sb.from('reagents').insert(r).select().single()),
    updateReagent: async (id, patch) =>
      check(await sb.from('reagents').update(patch).eq('id', id).select(WITH_CABINET).single()),
    disposeReagent: (id, reason) => api.updateReagent(id, { status: DISPOSED, dispose_reason: reason || '' }),
    restoreReagent: (id) => api.updateReagent(id, { status: '사용중' }),

    // 국문명·법적 분류·KOSHA MSDS (Edge Function 'chem-info')
    async chemInfoKr(params) {
      const { data, error } = await sb.functions.invoke('chem-info', { body: params });
      if (error) {
        let msg = error.message;
        try {
          msg = (await error.context.json()).error || msg;
        } catch { /* 본문 없음 */ }
        throw new Error(msg);
      }
      return data;
    },

    // 상품코드 캐시
    lookupProductCodes: async (codes) =>
      check(await sb.from('product_codes').select('*').in('code', [...new Set(codes.filter(Boolean))])),
    saveProductCode: async (p) =>
      check(await sb.from('product_codes').upsert({ ...p, updated_at: new Date().toISOString() },
        { onConflict: 'vendor,code' })),
  };
  return api;
}
