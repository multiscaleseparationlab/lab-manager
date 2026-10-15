// 데이터 계층 선택: Supabase 설정이 있으면 Supabase, 없으면 데모(localStorage)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const db = DEMO
  ? (await import('./db-demo.js')).demoDb
  : (await import('./db-supabase.js')).createSupabaseDb(SUPABASE_URL, SUPABASE_ANON_KEY);
