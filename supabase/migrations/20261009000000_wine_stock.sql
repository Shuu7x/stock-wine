-- ระบบสต็อกไวน์: คลัง (stores) · รายการไวน์ในคลัง (stock_items)
-- เอกสารรับเข้า (receipts + receipt_lines) · เอกสารเบิก (withdrawals + withdrawal_lines)
--
-- กติกา
-- * ไม่มีการลบแถวจริง: stock_items ใช้ deleted_at, เอกสารใช้ status = 'void'
-- * balance แก้ได้ผ่าน function post_* / void_* เท่านั้น (ไม่ grant update คอลัมน์ balance)
-- * เปิด RLS ทุกตาราง

-- ─── helpers ────────────────────────────────────────────────────────────────
create or replace function public.set_updated_audit()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ─── stores ─────────────────────────────────────────────────────────────────
create table public.stores (
  id          smallint primary key,
  code        text not null unique,
  name        text not null,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

insert into public.stores (id, code, name, sort_order) values
  (1, 'SW1', 'Showroom Wines 1', 1),
  (2, 'SW2', 'Showroom Wines 2', 2),
  (3, 'BIG', 'Big Room Wines',   3);

-- ─── stock_items ────────────────────────────────────────────────────────────
create table public.stock_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          smallint not null references public.stores (id),
  rack              text,
  country           text,
  wine_name         text not null check (btrim(wine_name) <> ''),
  vintage           smallint check (vintage between 1800 and 2200),   -- null = NV
  rating_rp         numeric(4, 1) check (rating_rp between 0 and 100),
  rating_ws         numeric(4, 1) check (rating_ws between 0 and 100),
  maturity_from     smallint,
  maturity_to       smallint,
  price_per_bottle  numeric(12, 2) check (price_per_bottle >= 0),
  supplier          text,
  purchase_date     date,
  remark            text,
  balance           integer not null default 0 check (balance >= 0),
  deleted_at        timestamptz,
  deleted_by        uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid(),
  constraint stock_items_maturity_chk
    check (maturity_from is null or maturity_to is null or maturity_from <= maturity_to)
);

-- หนึ่งไวน์ (ชื่อ + ปี) ต่อหนึ่งช่องเก็บ ในแต่ละคลัง — ใช้จับคู่ตอนรับเข้า
create unique index stock_items_identity_uq
  on public.stock_items (store_id, lower(btrim(wine_name)), coalesce(vintage, 0), lower(coalesce(btrim(rack), '')))
  where deleted_at is null;
create index stock_items_store_idx on public.stock_items (store_id) where deleted_at is null;

create trigger stock_items_audit before update on public.stock_items
  for each row execute function public.set_updated_audit();

-- ─── receipts ───────────────────────────────────────────────────────────────
create sequence public.receipt_no_seq;

create table public.receipts (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique
                   default 'RC' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.receipt_no_seq')::text, 4, '0'),
  received_at      date not null default current_date,
  note             text,
  status           text not null default 'posted' check (status in ('posted', 'void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

create table public.receipt_lines (
  id                uuid primary key default gen_random_uuid(),
  receipt_id        uuid not null references public.receipts (id),
  line_no           smallint not null,
  stock_item_id     uuid not null references public.stock_items (id),
  is_new_item       boolean not null default false,
  -- snapshot ณ วันที่รับ
  store_id          smallint not null references public.stores (id),
  rack              text,
  country           text,
  wine_name         text not null,
  vintage           smallint,
  rating_rp         numeric(4, 1),
  rating_ws         numeric(4, 1),
  maturity_from     smallint,
  maturity_to       smallint,
  qty               integer not null check (qty > 0),
  price_per_bottle  numeric(12, 2),
  supplier          text,
  purchase_date     date,
  remark            text,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid()
);
create index receipt_lines_receipt_idx on public.receipt_lines (receipt_id);
create index receipt_lines_item_idx on public.receipt_lines (stock_item_id);

create trigger receipts_audit before update on public.receipts
  for each row execute function public.set_updated_audit();

-- ─── withdrawals ────────────────────────────────────────────────────────────
create sequence public.withdrawal_no_seq;

create table public.withdrawals (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique
                   default 'WD' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.withdrawal_no_seq')::text, 4, '0'),
  note             text,
  status           text not null default 'posted' check (status in ('posted', 'void')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);

create table public.withdrawal_lines (
  id                uuid primary key default gen_random_uuid(),
  withdrawal_id     uuid not null references public.withdrawals (id),
  line_no           smallint not null,
  stock_item_id     uuid not null references public.stock_items (id),
  withdraw_date     date not null default current_date,
  qty               integer not null check (qty > 0),
  remark            text,
  -- snapshot ณ วันที่เบิก
  store_id          smallint not null references public.stores (id),
  rack              text,
  country           text,
  wine_name         text not null,
  vintage           smallint,
  price_per_bottle  numeric(12, 2),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid()
);
create index withdrawal_lines_withdrawal_idx on public.withdrawal_lines (withdrawal_id);
create index withdrawal_lines_item_idx on public.withdrawal_lines (stock_item_id);

create trigger withdrawals_audit before update on public.withdrawals
  for each row execute function public.set_updated_audit();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- ทีมเล็ก: ผู้ที่ login แล้วทำงานได้ทุกคลัง ไม่มี policy delete = ลบแถวไม่ได้
alter table public.stores           enable row level security;
alter table public.stock_items      enable row level security;
alter table public.receipts         enable row level security;
alter table public.receipt_lines    enable row level security;
alter table public.withdrawals      enable row level security;
alter table public.withdrawal_lines enable row level security;

create policy "อ่านได้เมื่อ login" on public.stores           for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.stock_items      for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.receipts         for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.receipt_lines    for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.withdrawals      for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.withdrawal_lines for select to authenticated using (true);

create policy "แก้ข้อมูลไวน์ได้เมื่อ login" on public.stock_items
  for update to authenticated using (true) with check (true);

-- คอลัมน์ที่หน้าจอแก้ตรงได้ (balance ไม่อยู่ในรายการ)
revoke insert, update, delete on public.stock_items from anon, authenticated;
grant update (store_id, rack, country, wine_name, vintage, rating_rp, rating_ws,
              maturity_from, maturity_to, price_per_bottle, supplier, purchase_date,
              remark, deleted_at, deleted_by)
  on public.stock_items to authenticated;
revoke insert, update, delete on public.receipts, public.receipt_lines,
  public.withdrawals, public.withdrawal_lines, public.stores from anon, authenticated;

-- ─── post_receipt ───────────────────────────────────────────────────────────
-- p_lines: [{ store_id, rack, country, wine_name, vintage, rating_rp, rating_ws,
--             maturity_from, maturity_to, qty, price_per_bottle, supplier, purchase_date, remark }]
-- จับคู่ stock_items ด้วย (store, ชื่อ, ปี, rack) — เจอแล้วบวกยอดและอัปเดตข้อมูล ไม่เจอสร้างใหม่
create or replace function public.post_receipt(p_received_at date, p_note text, p_lines jsonb)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts;
  v_line    jsonb;
  v_item_id uuid;
  v_is_new  boolean;
  v_no      smallint := 0;
begin
  if auth.uid() is null then
    raise exception 'ต้อง login ก่อน' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการรับเข้า';
  end if;

  insert into public.receipts (received_at, note)
  values (coalesce(p_received_at, current_date), nullif(btrim(p_note), ''))
  returning * into v_receipt;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    if coalesce((v_line ->> 'qty')::int, 0) <= 0 then
      raise exception 'แถว %: จำนวนรับต้องมากกว่า 0', v_no;
    end if;

    select id into v_item_id
    from public.stock_items
    where deleted_at is null
      and store_id = (v_line ->> 'store_id')::smallint
      and lower(btrim(wine_name)) = lower(btrim(v_line ->> 'wine_name'))
      and coalesce(vintage, 0) = coalesce((v_line ->> 'vintage')::smallint, 0)
      and lower(coalesce(btrim(rack), '')) = lower(coalesce(btrim(v_line ->> 'rack'), ''))
    for update;

    v_is_new := v_item_id is null;

    if v_is_new then
      insert into public.stock_items (
        store_id, rack, country, wine_name, vintage, rating_rp, rating_ws,
        maturity_from, maturity_to, price_per_bottle, supplier, purchase_date, remark, balance
      ) values (
        (v_line ->> 'store_id')::smallint,
        nullif(btrim(v_line ->> 'rack'), ''),
        nullif(btrim(v_line ->> 'country'), ''),
        btrim(v_line ->> 'wine_name'),
        (v_line ->> 'vintage')::smallint,
        (v_line ->> 'rating_rp')::numeric,
        (v_line ->> 'rating_ws')::numeric,
        (v_line ->> 'maturity_from')::smallint,
        (v_line ->> 'maturity_to')::smallint,
        (v_line ->> 'price_per_bottle')::numeric,
        nullif(btrim(v_line ->> 'supplier'), ''),
        (v_line ->> 'purchase_date')::date,
        nullif(btrim(v_line ->> 'remark'), ''),
        (v_line ->> 'qty')::int
      ) returning id into v_item_id;
    else
      -- ค่าที่ส่งมาใหม่ทับค่าเดิม ค่าว่างคงค่าเดิมไว้
      update public.stock_items set
        balance          = balance + (v_line ->> 'qty')::int,
        country          = coalesce(nullif(btrim(v_line ->> 'country'), ''), country),
        rating_rp        = coalesce((v_line ->> 'rating_rp')::numeric, rating_rp),
        rating_ws        = coalesce((v_line ->> 'rating_ws')::numeric, rating_ws),
        maturity_from    = coalesce((v_line ->> 'maturity_from')::smallint, maturity_from),
        maturity_to      = coalesce((v_line ->> 'maturity_to')::smallint, maturity_to),
        price_per_bottle = coalesce((v_line ->> 'price_per_bottle')::numeric, price_per_bottle),
        supplier         = coalesce(nullif(btrim(v_line ->> 'supplier'), ''), supplier),
        purchase_date    = coalesce((v_line ->> 'purchase_date')::date, purchase_date),
        remark           = coalesce(nullif(btrim(v_line ->> 'remark'), ''), remark)
      where id = v_item_id;
    end if;

    insert into public.receipt_lines (
      receipt_id, line_no, stock_item_id, is_new_item, store_id, rack, country, wine_name, vintage,
      rating_rp, rating_ws, maturity_from, maturity_to, qty, price_per_bottle, supplier,
      purchase_date, remark
    ) values (
      v_receipt.id, v_no, v_item_id, v_is_new,
      (v_line ->> 'store_id')::smallint,
      nullif(btrim(v_line ->> 'rack'), ''),
      nullif(btrim(v_line ->> 'country'), ''),
      btrim(v_line ->> 'wine_name'),
      (v_line ->> 'vintage')::smallint,
      (v_line ->> 'rating_rp')::numeric,
      (v_line ->> 'rating_ws')::numeric,
      (v_line ->> 'maturity_from')::smallint,
      (v_line ->> 'maturity_to')::smallint,
      (v_line ->> 'qty')::int,
      (v_line ->> 'price_per_bottle')::numeric,
      nullif(btrim(v_line ->> 'supplier'), ''),
      (v_line ->> 'purchase_date')::date,
      nullif(btrim(v_line ->> 'remark'), '')
    );
  end loop;

  return v_receipt;
end;
$$;

-- ─── post_withdrawal ────────────────────────────────────────────────────────
-- p_lines: [{ stock_item_id, qty, withdraw_date, remark }]
create or replace function public.post_withdrawal(p_note text, p_lines jsonb)
returns public.withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  public.withdrawals;
  v_line jsonb;
  v_item public.stock_items;
  v_qty  int;
  v_no   smallint := 0;
begin
  if auth.uid() is null then
    raise exception 'ต้อง login ก่อน' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการเบิก';
  end if;

  insert into public.withdrawals (note) values (nullif(btrim(p_note), ''))
  returning * into v_doc;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no  := v_no + 1;
    v_qty := coalesce((v_line ->> 'qty')::int, 0);

    select * into v_item from public.stock_items
    where id = (v_line ->> 'stock_item_id')::uuid and deleted_at is null
    for update;

    if v_item.id is null then
      raise exception 'แถว %: ไม่พบไวน์ในสต็อก', v_no;
    end if;
    if v_qty <= 0 then
      raise exception 'แถว %: จำนวนเบิกต้องมากกว่า 0', v_no;
    end if;
    if v_qty > v_item.balance then
      raise exception 'แถว %: % คงเหลือ % ขวด เบิก % ขวดไม่ได้', v_no, v_item.wine_name, v_item.balance, v_qty;
    end if;

    update public.stock_items set balance = balance - v_qty where id = v_item.id;

    insert into public.withdrawal_lines (
      withdrawal_id, line_no, stock_item_id, withdraw_date, qty, remark,
      store_id, rack, country, wine_name, vintage, price_per_bottle
    ) values (
      v_doc.id, v_no, v_item.id,
      coalesce((v_line ->> 'withdraw_date')::date, current_date),
      v_qty,
      nullif(btrim(v_line ->> 'remark'), ''),
      v_item.store_id, v_item.rack, v_item.country, v_item.wine_name, v_item.vintage, v_item.price_per_bottle
    );
  end loop;

  return v_doc;
end;
$$;

-- ─── void (ยกเลิกเอกสาร = กลับยอด แต่เก็บเอกสารไว้) ─────────────────────────────
create or replace function public.void_receipt(p_id uuid, p_reason text)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  public.receipts;
  v_line record;
begin
  if auth.uid() is null then
    raise exception 'ต้อง login ก่อน' using errcode = '42501';
  end if;

  select * into v_doc from public.receipts where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;

  for v_line in
    select l.qty, l.line_no, s.id as item_id, s.balance, s.wine_name
    from public.receipt_lines l join public.stock_items s on s.id = l.stock_item_id
    where l.receipt_id = p_id
    for update of s
  loop
    if v_line.balance < v_line.qty then
      raise exception 'ยกเลิกไม่ได้: % คงเหลือ % ขวด น้อยกว่าที่รับเข้า % ขวด (ถูกเบิกไปแล้ว)',
        v_line.wine_name, v_line.balance, v_line.qty;
    end if;
    update public.stock_items set balance = balance - v_line.qty where id = v_line.item_id;
  end loop;

  update public.receipts
  set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id
  returning * into v_doc;
  return v_doc;
end;
$$;

create or replace function public.void_withdrawal(p_id uuid, p_reason text)
returns public.withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.withdrawals;
begin
  if auth.uid() is null then
    raise exception 'ต้อง login ก่อน' using errcode = '42501';
  end if;

  select * into v_doc from public.withdrawals where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;

  update public.stock_items s
  set balance = s.balance + l.qty
  from (select stock_item_id, sum(qty) as qty from public.withdrawal_lines
        where withdrawal_id = p_id group by stock_item_id) l
  where s.id = l.stock_item_id;

  update public.withdrawals
  set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id
  returning * into v_doc;
  return v_doc;
end;
$$;

revoke execute on function public.post_receipt(date, text, jsonb)  from public, anon;
revoke execute on function public.post_withdrawal(text, jsonb)     from public, anon;
revoke execute on function public.void_receipt(uuid, text)         from public, anon;
revoke execute on function public.void_withdrawal(uuid, text)      from public, anon;
grant  execute on function public.post_receipt(date, text, jsonb)  to authenticated;
grant  execute on function public.post_withdrawal(text, jsonb)     to authenticated;
grant  execute on function public.void_receipt(uuid, text)         to authenticated;
grant  execute on function public.void_withdrawal(uuid, text)      to authenticated;
