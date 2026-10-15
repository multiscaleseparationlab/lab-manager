// Supabase Edge Function: 공공데이터포털 화학물질 API 중계
//  - 한국환경공단 화학물질 정보 조회 (국문명, KE번호, 화학물질관리법 분류)
//  - 한국산업안전보건공단 MSDS 목록 (KOSHA chem_id, 국문명 검색)
// 인증키(DATA_GO_KR_KEY)는 서버에만 두고, 승인된 사용자만 호출할 수 있다.
//
// 요청: POST { cas: "67-64-1" }  또는  { korName: "아세톤" }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RAW_KEY = Deno.env.get('DATA_GO_KR_KEY') ?? '';
// 공공데이터포털의 'Encoding' 키를 넣었어도 동작하도록 한 번 디코딩
const KEY = RAW_KEY.includes('%') ? decodeURIComponent(RAW_KEY) : RAW_KEY;

const KECO_URL = 'https://apis.data.go.kr/B552584/kecoapi/ncissbstn/chemSbstnList';
const KOSHA_URL = 'https://apis.data.go.kr/B552468/msdschem1/getChemList001';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ---------------------------------------------------------------- 한국환경공단 (JSON)
async function kecoByCas(cas: string) {
  const url = `${KECO_URL}?${new URLSearchParams({
    serviceKey: KEY, pageNo: '1', numOfRows: '10', searchGubun: '2', searchNm: cas, returnType: 'JSON',
  })}`;
  const text = await (await fetch(url)).text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`한국환경공단 API 응답 오류: ${text.slice(0, 200)}`);
  }
  const header = j.header ?? j.response?.header;
  if (header?.resultCode && header.resultCode !== '00' && header.resultCode !== '0') {
    throw new Error(`한국환경공단 API: ${header.resultMsg ?? header.resultCode}`);
  }
  const body = j.body ?? j.response?.body;
  const items = asArray(body?.items?.item ?? body?.items);
  // deno-lint-ignore no-explicit-any
  return (items.find((i: any) => i.casNo === cas) ?? items[0] ?? null) as any;
}

// ---------------------------------------------------------------- 안전보건공단 MSDS (XML)
const unescapeXml = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml: string, name: string) =>
  unescapeXml(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

/** searchCnd: 0 국문명, 1 CAS */
async function koshaList(searchCnd: 0 | 1, word: string) {
  const url = `${KOSHA_URL}?${new URLSearchParams({
    serviceKey: KEY, searchWrd: word, searchCnd: String(searchCnd), numOfRows: '20', pageNo: '1',
  })}`;
  const xml = await (await fetch(url)).text();
  const code = tag(xml, 'resultCode');
  if (code && code !== '00') throw new Error(`안전보건공단 API: ${tag(xml, 'resultMsg') || code}`);
  if (!code && !xml.includes('<item>')) throw new Error(`안전보건공단 API 응답 오류: ${xml.slice(0, 200)}`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    msdsChemId: tag(m[1], 'chemId').padStart(6, '0'),
    cas: tag(m[1], 'casNo'),
    nameKor: tag(m[1], 'chemNameKor'),
    keNo: tag(m[1], 'keNo'),
    unNo: tag(m[1], 'unNo'),
  }));
}

async function byCas(cas: string) {
  const [keco, kosha] = await Promise.allSettled([kecoByCas(cas), koshaList(1, cas)]);
  const errors: string[] = [];
  const k = keco.status === 'fulfilled' ? keco.value : (errors.push(String(keco.reason?.message ?? keco.reason)), null);
  const list = kosha.status === 'fulfilled' ? kosha.value : (errors.push(String(kosha.reason?.message ?? kosha.reason)), []);
  const m = list.find((i) => i.cas === cas) ?? null;
  return {
    cas,
    found: !!(k || m),
    nameKor: k?.sbstnNmKor || m?.nameKor || '',
    nameKor2: k?.sbstnNm2Kor || '',
    nameEng: k?.sbstnNmEng || '',
    keNo: k?.korexst || m?.keNo || '',
    // deno-lint-ignore no-explicit-any
    classes: asArray(k?.typeList?.item ?? k?.typeList).map((t: any) => ({
      type: t.sbstnClsfTypeNm ?? '',
      no: t.unqNo ?? '',
      content: t.contInfo ?? '',
      exception: t.excpInfo ?? '',
      date: t.ancmntYmd ?? '',
      notice: t.ancmntInfo ?? '',
    })).filter((t) => t.type),
    msdsChemId: m?.msdsChemId ?? '',
    errors,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!KEY) return json({ error: 'DATA_GO_KR_KEY 시크릿이 설정되지 않았습니다' }, 500);

  // 승인된 연구실 사용자만 (schema.sql 의 is_approved())
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: approved, error } = await sb.rpc('is_approved');
  if (error || !approved) return json({ error: '승인된 사용자만 사용할 수 있습니다' }, 403);

  const { cas, korName } = await req.json().catch(() => ({}));
  try {
    if (cas) return json(await byCas(String(cas).trim()));
    if (korName) {
      const list = await koshaList(0, String(korName).trim());
      // CAS가 있는 항목만, CAS 중복 제거
      const seen = new Set<string>();
      const candidates = list.filter((i) => i.cas && !seen.has(i.cas) && seen.add(i.cas)).slice(0, 10);
      return json({ candidates });
    }
    return json({ error: 'cas 또는 korName 이 필요합니다' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 502);
  }
});
