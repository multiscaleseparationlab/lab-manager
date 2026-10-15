// PubChem PUG REST 조회 (무료, 키 불필요, CORS 허용)
import { parseCas } from './lookup.js';

const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest';

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PubChem 응답 오류 (${res.status})`);
  return res.json();
}

// DB 식별자·등록번호류는 이름 후보에서 제외
const JUNK = /^(UNII|DTXSID|DTXCID|CHEBI|CHEMBL|EINECS|EC |NSC|HSDB|CCRIS|BRN|AI3|RCRA|UN\d|InChI|SCHEMBL|MFCD|AKOS|BDBM|ZINC|NCGC|CAS-|WLN|FEMA|Caswell|EPA|NCI|Q\d|SY\d|STL\d|LS-|DB\d|BIDD|Tox21|component of)/i;

function cleanSynonyms(list, title) {
  const seen = new Set([title.toLowerCase()]);
  const out = [];
  for (const s of list) {
    const k = s.toLowerCase();
    if (seen.has(k) || s.length > 40 || JUNK.test(s) || /^\d+-\d+-\d$/.test(s) || /\d{5,}/.test(s)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= 25) break;
  }
  return out;
}

async function fetchSynonyms(cid, title) {
  const j = await getJson(`${BASE}/pug/compound/cid/${cid}/synonyms/JSON`);
  const all = j?.InformationList?.Information?.[0]?.Synonym || [];
  return { synonyms: cleanSynonyms(all, title), cas: all.find((s) => parseCas(s)) || '' };
}

async function fetchGhs(cid) {
  const j = await getJson(`${BASE}/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification`);
  if (!j) return { codes: [], pictograms: [] };
  const text = JSON.stringify(j);
  const uniq = (re) => [...new Set(text.match(re) || [])].sort();
  return { codes: uniq(/\bH[2-4]\d{2}\b/g), pictograms: uniq(/GHS0[1-9]/g) };
}

/** CAS 번호 또는 영문 이름으로 조회. 못 찾으면 null */
export async function lookupPubChem(query) {
  const j = await getJson(
    `${BASE}/pug/compound/name/${encodeURIComponent(query)}/property/Title,MolecularFormula,MolecularWeight/JSON`);
  const p = j?.PropertyTable?.Properties?.[0];
  if (!p) return null;
  const title = p.Title || query;
  const [syn, ghs] = await Promise.all([
    fetchSynonyms(p.CID, title).catch(() => ({ synonyms: [], cas: '' })),
    fetchGhs(p.CID).catch(() => ({ codes: [], pictograms: [] })),
  ]);
  return {
    cid: p.CID,
    name: title,
    formula: p.MolecularFormula || '',
    mw: p.MolecularWeight ? Number(p.MolecularWeight) : null,
    cas: syn.cas, // 동의어 중 첫 번째 유효한 CAS (이름으로 조회했을 때 사용)
    synonyms: syn.synonyms,
    ghsCodes: ghs.codes,
    pictograms: ghs.pictograms,
  };
}

export const pubchemUrl = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
