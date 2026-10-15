// Supabase 프로젝트 설정 (Supabase 대시보드 → Project Settings → API).
// anon key는 공개되어도 괜찮은 값입니다. 권한은 DB의 RLS 정책으로 막습니다.
// 둘 중 하나라도 비어 있으면 '데모 모드'로 동작합니다 (데이터는 이 브라우저에만 저장).
export const SUPABASE_URL = 'https://hobvdqjrfoxjtrmayzlj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvYnZkcWpyZm94anRybWF5emxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTI0ODQsImV4cCI6MjEwNzYyODQ4NH0.I7QY8CYCdFgSrIZ67kY7F8mT7ltO9F6sXBTIyhYRJ1A';

// 국문명·법적 분류·KOSHA MSDS 자동 조회 (Supabase Edge Function 'chem-info' + 공공데이터포털 키 필요).
// Edge Function을 배포하지 않았다면 false 로 두세요. 데모 모드에서는 항상 꺼집니다.
export const USE_KR_CHEM_API = true;

// 상단에 표시할 이름
export const LAB_NAME = '시약 관리';
