-- =====================================================================
-- 시약 관리 (Lab Reagent Manager) — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행하세요.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 승인된 사용자
-- ---------------------------------------------------------------------
create table if not exists approved_users (
  email      text primary key check (email = lower(email)),
  name       text not null default '',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from approved_users where email = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from approved_users
    where email = lower(auth.jwt() ->> 'email') and is_admin
  );
$$;

-- SQL Editor(로그인 없음)에서 실행할 때는 관리자 권한으로 취급
create or replace function is_admin_or_service() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce(auth.jwt() ->> 'email', '') = '';
$$;

create or replace function current_user_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(name, '') from approved_users where email = lower(auth.jwt() ->> 'email')),
    auth.jwt() ->> 'email'
  );
$$;

-- ---------------------------------------------------------------------
-- 보관함
-- ---------------------------------------------------------------------
create table if not exists cabinets (
  id           bigint generated always as identity primary key,
  name         text not null,
  shelf        text not null default '',
  cabinet_type text not null default 'general'
               check (cabinet_type in ('general','flammable','acid','base','oxidizer','toxic','fridge')),
  memo         text not null default '',
  unique (name, shelf)
);

-- ---------------------------------------------------------------------
-- 상품코드 ↔ CAS 매핑 (연구실 자체 캐시: 한 번 등록하면 다음부터 자동 입력)
-- ---------------------------------------------------------------------
create table if not exists product_codes (
  vendor     text not null default '',
  code       text not null,
  cas        text not null,
  name       text not null default '',
  amount     numeric,
  unit       text,
  updated_at timestamptz not null default now(),
  primary key (vendor, code)
);
create index if not exists product_codes_code_idx on product_codes (code);

-- ---------------------------------------------------------------------
-- 시약
-- ---------------------------------------------------------------------
create table if not exists reagents (
  id               bigint generated always as identity primary key,
  name             text not null check (length(trim(name)) > 0),
  name_kor         text not null default '',
  abbreviation     text not null default '',
  cas              text not null default '',
  vendor           text not null default '',
  product_code     text not null default '',
  amount           numeric not null check (amount > 0),
  unit             text not null check (unit in ('mL','L','µL','g','kg','mg','ea')),
  quantity         int not null default 1 check (quantity > 0),
  concentration    text not null default '',
  solvent          text not null default '',
  cabinet_id       bigint not null references cabinets(id) on delete restrict,
  status           text not null default '미개봉' check (status in ('미개봉','사용중','폐기')),
  formula          text not null default '',
  mw               numeric,
  pubchem_cid      bigint,
  ghs_codes        text[] not null default '{}',
  ghs_pictograms   text[] not null default '{}',
  synonyms         text[] not null default '{}',
  ke_no            text not null default '',
  reg_classes      jsonb not null default '[]',   -- 화학물질관리법 분류 (한국환경공단 API)
  msds_chem_id     text not null default '',      -- KOSHA MSDS chem_id
  msds_url         text not null default '',      -- 제조사 MSDS 주소 (직접 입력)
  memo             text not null default '',
  search_text      text not null default '',
  created_by       text not null default '',
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  disposed_at      timestamptz,
  disposed_by      text,
  disposed_by_name text,
  dispose_reason   text
);

-- 이전 버전 스키마에서 업그레이드할 때 (이미 있으면 무시)
alter table reagents add column if not exists name_kor     text not null default '';
alter table reagents add column if not exists ke_no        text not null default '';
alter table reagents add column if not exists reg_classes  jsonb not null default '[]';
alter table reagents add column if not exists msds_chem_id text not null default '';
alter table reagents add column if not exists msds_url     text not null default '';

create index if not exists reagents_search_idx on reagents using gin (search_text gin_trgm_ops);
create index if not exists reagents_cas_idx on reagents (cas);
create index if not exists reagents_status_idx on reagents (status);
create index if not exists reagents_disposed_at_idx on reagents (disposed_at desc);

-- 검색 텍스트 생성, 작성자/폐기 정보 기록, 폐기·복원 규칙 강제
create or replace function reagents_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 이름|국문명|약칭|CAS|상품코드|제조사|동의어 를 소문자 + 공백 제거로 합침 (js/ui.js buildSearchText 와 동일 규칙)
  new.search_text := lower(regexp_replace(
    concat_ws('|', new.name, new.name_kor, new.abbreviation, new.cas, new.product_code, new.vendor,
              array_to_string(new.synonyms, '|')),
    '\s+', '', 'g'));
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status = '폐기' then
      raise exception '새 시약을 폐기 상태로 등록할 수 없습니다';
    end if;
    new.created_by      := coalesce(lower(auth.jwt() ->> 'email'), new.created_by);
    new.created_by_name := coalesce(current_user_name(), new.created_by_name);
    new.created_at      := now();
    new.disposed_at := null; new.disposed_by := null; new.disposed_by_name := null; new.dispose_reason := null;
    return new;
  end if;

  -- UPDATE: 등록 정보는 바꿀 수 없음
  new.created_by := old.created_by;
  new.created_by_name := old.created_by_name;
  new.created_at := old.created_at;

  if old.status = '폐기' and new.status <> '폐기' then
    -- 복원
    if not is_admin_or_service() then
      raise exception '폐기된 시약의 복원은 관리자만 할 수 있습니다';
    end if;
    new.disposed_at := null; new.disposed_by := null; new.disposed_by_name := null; new.dispose_reason := null;
  elsif old.status = '폐기' then
    if not is_admin_or_service() then
      raise exception '폐기된 시약은 수정할 수 없습니다';
    end if;
    new.disposed_at := old.disposed_at;
    new.disposed_by := old.disposed_by;
    new.disposed_by_name := old.disposed_by_name;
  elsif new.status = '폐기' then
    -- 폐기 (사유는 클라이언트가 보낸 값 유지)
    new.disposed_at      := now();
    new.disposed_by      := lower(auth.jwt() ->> 'email');
    new.disposed_by_name := current_user_name();
  else
    new.disposed_at := null; new.disposed_by := null; new.disposed_by_name := null; new.dispose_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reagents_before_write on reagents;
create trigger reagents_before_write
  before insert or update on reagents
  for each row execute function reagents_before_write();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table approved_users enable row level security;
alter table cabinets       enable row level security;
alter table product_codes  enable row level security;
alter table reagents       enable row level security;

-- approved_users: 본인 행은 항상 조회 가능(승인 여부 확인용), 나머지는 승인 사용자만, 수정은 관리자만
drop policy if exists au_select on approved_users;
create policy au_select on approved_users for select
  using (is_approved() or email = lower(auth.jwt() ->> 'email'));
drop policy if exists au_write on approved_users;
create policy au_write on approved_users for all
  using (is_admin()) with check (is_admin());

-- cabinets: 조회는 승인 사용자, 수정은 관리자
drop policy if exists cab_select on cabinets;
create policy cab_select on cabinets for select using (is_approved());
drop policy if exists cab_write on cabinets;
create policy cab_write on cabinets for all using (is_admin()) with check (is_admin());

-- product_codes: 승인 사용자가 조회/추가/갱신, 삭제는 관리자
drop policy if exists pc_select on product_codes;
create policy pc_select on product_codes for select using (is_approved());
drop policy if exists pc_insert on product_codes;
create policy pc_insert on product_codes for insert with check (is_approved());
drop policy if exists pc_update on product_codes;
create policy pc_update on product_codes for update using (is_approved()) with check (is_approved());
drop policy if exists pc_delete on product_codes;
create policy pc_delete on product_codes for delete using (is_admin());

-- reagents: 승인 사용자가 조회/등록/수정/폐기, 영구 삭제는 관리자 (복원 제한은 트리거에서)
drop policy if exists rg_select on reagents;
create policy rg_select on reagents for select using (is_approved());
drop policy if exists rg_insert on reagents;
create policy rg_insert on reagents for insert with check (is_approved());
drop policy if exists rg_update on reagents;
create policy rg_update on reagents for update using (is_approved()) with check (is_approved());
drop policy if exists rg_delete on reagents;
create policy rg_delete on reagents for delete using (is_admin());

-- ---------------------------------------------------------------------
-- 초기 데이터 (예시 보관함 — 연구실에 맞게 수정하세요)
-- ---------------------------------------------------------------------
insert into cabinets (name, shelf, cabinet_type) values
  ('인화성 캐비닛 A', '1단', 'flammable'),
  ('인화성 캐비닛 A', '2단', 'flammable'),
  ('산 캐비닛', '', 'acid'),
  ('염기 캐비닛', '', 'base'),
  ('산화제 보관함', '', 'oxidizer'),
  ('독성 잠금장', '', 'toxic'),
  ('일반 선반 1', '', 'general'),
  ('냉장고 1', '', 'fridge')
on conflict (name, shelf) do nothing;

-- ★ 첫 관리자 등록: 아래 이메일을 본인 Google 계정(소문자)으로 바꾸고 주석을 풀어 실행하세요.
-- insert into approved_users (email, name, is_admin) values ('kmiso0810@gmail.com', '관리자', true);
