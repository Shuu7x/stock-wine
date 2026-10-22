-- ═══════════════════════════════════════════════════════════════════════════
-- ผู้ใช้และสิทธิ์ (role-based access)
-- * roles: บทบาท + รายการสิทธิ์ (permissions) · มีบทบาทตั้งต้น 4 แบบ แก้สิทธิ์/เพิ่มบทบาทได้
-- * profiles: ผู้ใช้ 1 คน = 1 บทบาท · ผู้ใช้ใหม่ได้บทบาท "viewer" (ดูอย่างเดียว) จนผู้ดูแลเปลี่ยนให้
-- * บังคับสิทธิ์ที่ฐานข้อมูลด้วย trigger บนตารางเอกสาร (ไม่ต้องแก้ฟังก์ชัน post_* / void_* เดิม)
--   และ RLS ของตารางตั้งค่า · หน้าเว็บซ่อนเมนู/ปุ่มตามสิทธิ์อีกชั้น
--
-- สิทธิ์ที่มี:
--   stock.edit       แก้/ลบข้อมูลไวน์ในหน้าสต็อก
--   withdraw         เบิก
--   receive          รับเข้า
--   transfer         โอนย้าย
--   sale             ขาย / ออกบิล
--   adjust           ปรับยอด
--   history.view     ดูความเคลื่อนไหว
--   history.void     ยกเลิกเอกสาร
--   qr               พิมพ์ป้าย QR
--   settings.manage  ตั้งค่าระบบ · ข้อมูลหลัก · การเรียงลำดับ
--   users.manage     ผู้ใช้และสิทธิ์
-- (ดูสต็อกได้ทุกคนที่เข้าสู่ระบบ)
-- ═══════════════════════════════════════════════════════════════════════════

create table public.roles (
  key          text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  name         text not null check (btrim(name) <> ''),
  description  text,
  permissions  text[] not null default '{}',
  is_system    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.roles (key, name, description, permissions, is_system, sort_order) values
  ('admin', 'ผู้ดูแลระบบ', 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้และสิทธิ์',
   array['stock.edit','withdraw','receive','transfer','sale','adjust','history.view','history.void','qr','settings.manage','users.manage'], true, 1),
  ('manager', 'ผู้จัดการ', 'ทำรายการทุกอย่าง ยกเลิกเอกสาร และตั้งค่าระบบ (ยกเว้นจัดการผู้ใช้)',
   array['stock.edit','withdraw','receive','transfer','sale','adjust','history.view','history.void','qr','settings.manage'], true, 2),
  ('staff', 'พนักงาน', 'เบิก รับเข้า โอนย้าย ขาย ดูความเคลื่อนไหว พิมพ์ป้าย',
   array['withdraw','receive','transfer','sale','history.view','qr'], true, 3),
  ('viewer', 'ดูอย่างเดียว', 'ดูสต็อกและความเคลื่อนไหว พิมพ์ป้าย QR',
   array['history.view','qr'], true, 4);

create table public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text,
  role_key      text not null default 'viewer' references public.roles (key) on update cascade,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ผู้ใช้ที่มีอยู่แล้วเป็นผู้ดูแลทั้งหมด (ไม่ให้ใครถูกล็อกออกหลังติดตั้ง)
insert into public.profiles (user_id, email, role_key)
select id, email, 'admin' from auth.users
on conflict (user_id) do nothing;

-- ผู้ใช้ใหม่: สร้าง profile ให้อัตโนมัติ บทบาท viewer
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name, role_key)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''), 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── ตรวจสิทธิ์ ───────────────────────────────────────────────────────────────
-- ไม่มีผู้ใช้ (งานฝั่ง server / migration) = อนุญาต
create or replace function public.has_perm(p text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null or exists (
    select 1 from public.profiles pr
    join public.roles r on r.key = pr.role_key
    where pr.user_id = auth.uid() and pr.is_active and p = any (r.permissions)
  );
$$;

/** บทบาทและสิทธิ์ของผู้ใช้ที่ login อยู่ (หน้าเว็บใช้ซ่อนเมนู/ปุ่ม) */
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('role', r.key, 'role_name', r.name, 'is_active', pr.is_active,
                               'permissions', case when pr.is_active then to_jsonb(r.permissions) else '[]'::jsonb end)
       from public.profiles pr join public.roles r on r.key = pr.role_key
      where pr.user_id = auth.uid()),
    jsonb_build_object('role', null, 'role_name', null, 'is_active', false, 'permissions', '[]'::jsonb)
  );
$$;

revoke execute on function public.has_perm(text) from public, anon;
revoke execute on function public.my_access() from public, anon;
grant  execute on function public.has_perm(text) to authenticated;
grant  execute on function public.my_access() to authenticated;

-- ─── ผู้ดูแลต้องมีสิทธิ์ครบเสมอ · ต้องเหลือผู้ดูแลที่ใช้งานได้อย่างน้อย 1 คน ──────────────
create or replace function public.roles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'ลบบทบาทตั้งต้นไม่ได้'; end if;
    if exists (select 1 from public.profiles where role_key = old.key) then
      raise exception 'ยังมีผู้ใช้บทบาท % อยู่ ย้ายผู้ใช้ก่อนลบ', old.name;
    end if;
    return old;
  end if;
  if new.key = 'admin' then
    new.permissions := array['stock.edit','withdraw','receive','transfer','sale','adjust','history.view','history.void','qr','settings.manage','users.manage'];
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function public.roles_guard();

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (old.role_key = 'admin' and old.is_active) and (new.role_key <> 'admin' or not new.is_active) then
    if not exists (
      select 1 from public.profiles
      where role_key = 'admin' and is_active and user_id <> old.user_id
    ) then
      raise exception 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
create policy "อ่านบทบาทได้เมื่อ login" on public.roles for select to authenticated using (true);
create policy "จัดการบทบาท" on public.roles for insert to authenticated with check (public.has_perm('users.manage'));
create policy "แก้บทบาท" on public.roles for update to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));
create policy "ลบบทบาท" on public.roles for delete to authenticated using (public.has_perm('users.manage'));
create policy "อ่านผู้ใช้" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_perm('users.manage'));
create policy "แก้ผู้ใช้" on public.profiles for update to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));
revoke insert, delete on public.profiles from anon, authenticated;

-- ─── บังคับสิทธิ์ที่ตารางเอกสาร ─────────────────────────────────────────────────
-- สร้างเอกสาร = ต้องมีสิทธิ์ตามประเภท (TG_ARGV[0]) · เปลี่ยนเป็น void = ต้องมี history.void
create or replace function public.require_doc_perm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and not public.has_perm(tg_argv[0]) then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (%)', tg_argv[0] using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status = 'void' and old.status <> 'void' and not public.has_perm('history.void') then
    raise exception 'ไม่มีสิทธิ์ยกเลิกเอกสาร' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger receipts_perm before insert or update on public.receipts
  for each row execute function public.require_doc_perm('receive');
create trigger withdrawals_perm before insert or update on public.withdrawals
  for each row execute function public.require_doc_perm('withdraw');
create trigger sales_perm before insert or update on public.sales
  for each row execute function public.require_doc_perm('sale');
create trigger transfers_perm before insert or update on public.transfers
  for each row execute function public.require_doc_perm('transfer');
create trigger stock_adjustments_perm before insert or update on public.stock_adjustments
  for each row execute function public.require_doc_perm('adjust');
create trigger bills_perm before insert or update on public.bills
  for each row execute function public.require_doc_perm('sale');

-- แก้ข้อมูลไวน์ตรงๆ (ไม่ได้มาจากเอกสาร — app.stock_action ว่าง) = ต้องมี stock.edit
create or replace function public.require_stock_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(current_setting('app.stock_action', true), '') is null and not public.has_perm('stock.edit') then
    raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลไวน์' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger stock_items_perm before insert or update on public.stock_items
  for each row execute function public.require_stock_edit();

-- ─── ตารางตั้งค่า: แก้ได้เฉพาะผู้มีสิทธิ์ settings.manage ────────────────────────────
drop policy "เพิ่มคลังได้เมื่อ login" on public.stores;
drop policy "แก้คลังได้เมื่อ login" on public.stores;
create policy "เพิ่มคลัง" on public.stores for insert to authenticated with check (public.has_perm('settings.manage'));
create policy "แก้คลัง" on public.stores for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

drop policy "เพิ่มได้เมื่อ login" on public.lookup_values;
drop policy "แก้ได้เมื่อ login" on public.lookup_values;
create policy "เพิ่มข้อมูลหลัก" on public.lookup_values for insert to authenticated with check (public.has_perm('settings.manage'));
create policy "แก้ข้อมูลหลัก" on public.lookup_values for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

drop policy "เพิ่มได้เมื่อ login" on public.app_settings;
drop policy "แก้ได้เมื่อ login" on public.app_settings;
create policy "เพิ่มค่าตั้งค่า" on public.app_settings for insert to authenticated with check (public.has_perm('settings.manage'));
create policy "แก้ค่าตั้งค่า" on public.app_settings for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
