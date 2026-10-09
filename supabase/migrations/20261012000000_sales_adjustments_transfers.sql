-- ขาย (มี VAT) · ปรับยอด · โอนย้าย
-- หลักเดียวกับรับเข้า/เบิก: บันทึกผ่าน function (ทั้งใบหรือไม่บันทึกเลย) · ยกเลิก = ปรับยอดกลับ เก็บเอกสารไว้
-- trigger log_stock_item_change บันทึกทุกการเปลี่ยนยอด โดย function บอกประเภทรายการผ่าน app.stock_action

-- ─── ประเภทรายการใน log ──────────────────────────────────────────────────────
alter table public.stock_item_logs drop constraint stock_item_logs_action_check;
alter table public.stock_item_logs add constraint stock_item_logs_action_check check (action in (
  'create', 'update', 'delete', 'restore',
  'receive', 'withdraw', 'void_receipt', 'void_withdrawal',
  'sale', 'void_sale', 'adjust', 'void_adjustment', 'transfer_out', 'transfer_in', 'void_transfer'));

-- ─── ค่าตั้งค่า VAT ──────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('vat_rate', '7'),
  ('default_vat_mode', '"included"')
on conflict (key) do nothing;

create or replace function public.current_vat_rate()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'vat_rate'), 7)
$$;

-- ═══ ขาย ═══════════════════════════════════════════════════════════════════
create sequence public.sale_no_seq;

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique
                   default 'SO' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.sale_no_seq')::text, 4, '0'),
  sold_at          date not null default current_date,
  customer         text,
  note             text,
  -- included = ราคาที่กรอกรวม VAT แล้ว · excluded = ราคายังไม่รวม VAT
  vat_mode         text not null check (vat_mode in ('included', 'excluded')),
  vat_rate         numeric(5, 2) not null check (vat_rate >= 0 and vat_rate < 100),
  subtotal         numeric(14, 2) not null default 0,   -- ยอดก่อน VAT
  vat_amount       numeric(14, 2) not null default 0,
  total            numeric(14, 2) not null default 0,   -- ยอดที่ลูกค้าจ่าย
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

create table public.sale_lines (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references public.sales (id),
  line_no           smallint not null,
  stock_item_id     uuid not null references public.stock_items (id),
  qty               integer not null check (qty > 0),
  unit_price        numeric(12, 2) not null check (unit_price >= 0),  -- ตามที่กรอก (รวม/ไม่รวม VAT ตาม vat_mode)
  has_vat           boolean not null default true,
  amount_before_vat numeric(14, 2) not null,
  vat_amount        numeric(14, 2) not null,
  line_total        numeric(14, 2) not null,
  remark            text,
  -- snapshot
  store_id          smallint not null references public.stores (id),
  rack              text,
  country           text,
  wine_name         text not null,
  vintage           smallint,
  cost_per_bottle   numeric(12, 2),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid default auth.uid()
);
create index sale_lines_sale_idx on public.sale_lines (sale_id);
create index sale_lines_item_idx on public.sale_lines (stock_item_id);
create trigger sales_audit before update on public.sales for each row execute function public.set_updated_audit();

-- ═══ ปรับยอด ═══════════════════════════════════════════════════════════════
create sequence public.adjustment_no_seq;

create table public.stock_adjustments (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique
                   default 'AJ' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.adjustment_no_seq')::text, 4, '0'),
  adjusted_at      date not null default current_date,
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

create table public.stock_adjustment_lines (
  id              uuid primary key default gen_random_uuid(),
  adjustment_id   uuid not null references public.stock_adjustments (id),
  line_no         smallint not null,
  stock_item_id   uuid not null references public.stock_items (id),
  balance_before  integer not null,
  balance_after   integer not null check (balance_after >= 0),
  diff            integer not null check (diff <> 0),
  reason          text not null,
  remark          text,
  store_id        smallint not null references public.stores (id),
  rack            text,
  wine_name       text not null,
  vintage         smallint,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid()
);
create index stock_adjustment_lines_doc_idx on public.stock_adjustment_lines (adjustment_id);
create trigger stock_adjustments_audit before update on public.stock_adjustments for each row execute function public.set_updated_audit();

-- ═══ โอนย้าย ═══════════════════════════════════════════════════════════════
create sequence public.transfer_no_seq;

create table public.transfers (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique
                   default 'TF' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.transfer_no_seq')::text, 4, '0'),
  transferred_at   date not null default current_date,
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

create table public.transfer_lines (
  id                  uuid primary key default gen_random_uuid(),
  transfer_id         uuid not null references public.transfers (id),
  line_no             smallint not null,
  from_stock_item_id  uuid not null references public.stock_items (id),
  to_stock_item_id    uuid not null references public.stock_items (id),
  to_is_new_item      boolean not null default false,
  qty                 integer not null check (qty > 0),
  remark              text,
  from_store_id       smallint not null references public.stores (id),
  from_rack           text,
  to_store_id         smallint not null references public.stores (id),
  to_rack             text,
  wine_name           text not null,
  vintage             smallint,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid default auth.uid()
);
create index transfer_lines_doc_idx on public.transfer_lines (transfer_id);
create trigger transfers_audit before update on public.transfers for each row execute function public.set_updated_audit();

-- ─── RLS: อ่านได้เมื่อ login · เขียนผ่าน function เท่านั้น ──────────────────────
alter table public.sales                  enable row level security;
alter table public.sale_lines             enable row level security;
alter table public.stock_adjustments      enable row level security;
alter table public.stock_adjustment_lines enable row level security;
alter table public.transfers              enable row level security;
alter table public.transfer_lines         enable row level security;
create policy "อ่านได้เมื่อ login" on public.sales                  for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.sale_lines             for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.stock_adjustments      for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.stock_adjustment_lines for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.transfers              for select to authenticated using (true);
create policy "อ่านได้เมื่อ login" on public.transfer_lines         for select to authenticated using (true);
revoke insert, update, delete on public.sales, public.sale_lines, public.stock_adjustments,
  public.stock_adjustment_lines, public.transfers, public.transfer_lines from anon, authenticated;

-- ═══ functions ════════════════════════════════════════════════════════════

-- p_lines: [{ stock_item_id, qty, unit_price, has_vat, remark }]
create or replace function public.post_sale(
  p_sold_at date, p_customer text, p_note text, p_vat_mode text, p_lines jsonb)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc   public.sales;
  v_line  jsonb;
  v_item  public.stock_items;
  v_rate  numeric := public.current_vat_rate();
  v_qty   int;
  v_price numeric;
  v_vat   boolean;
  v_gross numeric;
  v_before numeric;
  v_tax   numeric;
  v_no    smallint := 0;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  if p_vat_mode not in ('included', 'excluded') then raise exception 'รูปแบบ VAT ไม่ถูกต้อง'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'ไม่มีรายการขาย'; end if;

  insert into public.sales (sold_at, customer, note, vat_mode, vat_rate)
  values (coalesce(p_sold_at, current_date), nullif(btrim(p_customer), ''), nullif(btrim(p_note), ''), p_vat_mode, v_rate)
  returning * into v_doc;

  perform set_config('app.stock_action', 'sale', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no    := v_no + 1;
    v_qty   := coalesce((v_line ->> 'qty')::int, 0);
    v_price := (v_line ->> 'unit_price')::numeric;
    v_vat   := coalesce((v_line ->> 'has_vat')::boolean, true);

    select * into v_item from public.stock_items
    where id = (v_line ->> 'stock_item_id')::uuid and deleted_at is null for update;
    if v_item.id is null then raise exception 'แถว %: ไม่พบไวน์ในสต็อก', v_no; end if;
    if v_qty <= 0 then raise exception 'แถว %: จำนวนขายต้องมากกว่า 0', v_no; end if;
    if v_price is null or v_price < 0 then raise exception 'แถว %: ราคาขายไม่ถูกต้อง', v_no; end if;
    if v_qty > v_item.balance then
      raise exception 'แถว %: % คงเหลือ % ขวด ขาย % ขวดไม่ได้', v_no, v_item.wine_name, v_item.balance, v_qty;
    end if;

    v_gross := round(v_qty * v_price, 2);
    if not v_vat then
      v_before := v_gross; v_tax := 0;
    elsif p_vat_mode = 'included' then
      v_before := round(v_gross * 100 / (100 + v_rate), 2); v_tax := v_gross - v_before;
    else
      v_before := v_gross; v_tax := round(v_gross * v_rate / 100, 2);
    end if;

    update public.stock_items set balance = balance - v_qty where id = v_item.id;

    insert into public.sale_lines (
      sale_id, line_no, stock_item_id, qty, unit_price, has_vat, amount_before_vat, vat_amount, line_total, remark,
      store_id, rack, country, wine_name, vintage, cost_per_bottle
    ) values (
      v_doc.id, v_no, v_item.id, v_qty, v_price, v_vat, v_before, v_tax, v_before + v_tax,
      nullif(btrim(v_line ->> 'remark'), ''),
      v_item.store_id, v_item.rack, v_item.country, v_item.wine_name, v_item.vintage, v_item.price_per_bottle
    );
  end loop;

  update public.sales s set
    subtotal   = t.before, vat_amount = t.tax, total = t.before + t.tax
  from (select sum(amount_before_vat) as before, sum(vat_amount) as tax from public.sale_lines where sale_id = v_doc.id) t
  where s.id = v_doc.id
  returning s.* into v_doc;
  return v_doc;
end;
$$;

create or replace function public.void_sale(p_id uuid, p_reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare v_doc public.sales;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_doc from public.sales where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;

  perform set_config('app.stock_action', 'void_sale', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  update public.stock_items s set balance = s.balance + l.qty
  from (select stock_item_id, sum(qty) as qty from public.sale_lines where sale_id = p_id group by stock_item_id) l
  where s.id = l.stock_item_id;

  update public.sales set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id returning * into v_doc;
  return v_doc;
end;
$$;

-- p_lines: [{ stock_item_id, counted, reason, remark }] · counted = จำนวนที่นับได้จริง
create or replace function public.post_adjustment(p_adjusted_at date, p_note text, p_lines jsonb)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc     public.stock_adjustments;
  v_line    jsonb;
  v_item    public.stock_items;
  v_counted int;
  v_no      smallint := 0;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'ไม่มีรายการปรับยอด'; end if;

  insert into public.stock_adjustments (adjusted_at, note)
  values (coalesce(p_adjusted_at, current_date), nullif(btrim(p_note), ''))
  returning * into v_doc;

  perform set_config('app.stock_action', 'adjust', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no      := v_no + 1;
    v_counted := (v_line ->> 'counted')::int;
    select * into v_item from public.stock_items
    where id = (v_line ->> 'stock_item_id')::uuid and deleted_at is null for update;
    if v_item.id is null then raise exception 'แถว %: ไม่พบไวน์ในสต็อก', v_no; end if;
    if v_counted is null or v_counted < 0 then raise exception 'แถว %: จำนวนที่นับได้ไม่ถูกต้อง', v_no; end if;
    if coalesce(btrim(v_line ->> 'reason'), '') = '' then raise exception 'แถว %: ต้องระบุสาเหตุ', v_no; end if;
    if v_counted = v_item.balance then continue; end if;  -- ยอดตรงอยู่แล้ว ไม่ต้องปรับ

    update public.stock_items set balance = v_counted where id = v_item.id;
    insert into public.stock_adjustment_lines (
      adjustment_id, line_no, stock_item_id, balance_before, balance_after, diff, reason, remark,
      store_id, rack, wine_name, vintage
    ) values (
      v_doc.id, v_no, v_item.id, v_item.balance, v_counted, v_counted - v_item.balance,
      btrim(v_line ->> 'reason'), nullif(btrim(v_line ->> 'remark'), ''),
      v_item.store_id, v_item.rack, v_item.wine_name, v_item.vintage
    );
  end loop;

  if not exists (select 1 from public.stock_adjustment_lines where adjustment_id = v_doc.id) then
    raise exception 'ทุกรายการยอดตรงกับระบบอยู่แล้ว ไม่มีอะไรต้องปรับ';
  end if;
  return v_doc;
end;
$$;

create or replace function public.void_adjustment(p_id uuid, p_reason text)
returns public.stock_adjustments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  public.stock_adjustments;
  v_line record;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_doc from public.stock_adjustments where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;

  perform set_config('app.stock_action', 'void_adjustment', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in
    select l.stock_item_id, sum(l.diff)::int as diff, s.balance, s.wine_name
    from public.stock_adjustment_lines l join public.stock_items s on s.id = l.stock_item_id
    where l.adjustment_id = p_id group by l.stock_item_id, s.balance, s.wine_name
  loop
    if v_line.balance - v_line.diff < 0 then
      raise exception 'ยกเลิกไม่ได้: % คงเหลือไม่พอให้ปรับกลับ', v_line.wine_name;
    end if;
    update public.stock_items set balance = balance - v_line.diff where id = v_line.stock_item_id;
  end loop;

  update public.stock_adjustments set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id returning * into v_doc;
  return v_doc;
end;
$$;

-- p_lines: [{ stock_item_id, qty, to_store_id, to_rack, remark }]
-- ปลายทาง = ไวน์ชื่อ+ปีเดียวกันในคลัง/rack ปลายทาง มีอยู่แล้วบวกยอด ไม่มีสร้างใหม่ (คัดลอกข้อมูลไวน์จากต้นทาง)
create or replace function public.post_transfer(p_transferred_at date, p_note text, p_lines jsonb)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc   public.transfers;
  v_line  jsonb;
  v_src   public.stock_items;
  v_dst   uuid;
  v_new   boolean;
  v_qty   int;
  v_store smallint;
  v_rack  text;
  v_no    smallint := 0;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'ไม่มีรายการโอนย้าย'; end if;

  insert into public.transfers (transferred_at, note)
  values (coalesce(p_transferred_at, current_date), nullif(btrim(p_note), ''))
  returning * into v_doc;
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no    := v_no + 1;
    v_qty   := coalesce((v_line ->> 'qty')::int, 0);
    v_store := (v_line ->> 'to_store_id')::smallint;
    v_rack  := nullif(btrim(v_line ->> 'to_rack'), '');

    select * into v_src from public.stock_items
    where id = (v_line ->> 'stock_item_id')::uuid and deleted_at is null for update;
    if v_src.id is null then raise exception 'แถว %: ไม่พบไวน์ในสต็อก', v_no; end if;
    if v_qty <= 0 then raise exception 'แถว %: จำนวนโอนต้องมากกว่า 0', v_no; end if;
    if v_qty > v_src.balance then
      raise exception 'แถว %: % คงเหลือ % ขวด โอน % ขวดไม่ได้', v_no, v_src.wine_name, v_src.balance, v_qty;
    end if;
    if not exists (select 1 from public.stores where id = v_store and is_active) then
      raise exception 'แถว %: คลังปลายทางไม่ถูกต้อง', v_no;
    end if;
    if v_store = v_src.store_id and lower(coalesce(v_rack, '')) = lower(coalesce(btrim(v_src.rack), '')) then
      raise exception 'แถว %: ปลายทางต้องต่างจากต้นทาง (คลังหรือ rack)', v_no;
    end if;

    perform set_config('app.stock_action', 'transfer_out', true);
    update public.stock_items set balance = balance - v_qty where id = v_src.id;

    select id into v_dst from public.stock_items
    where deleted_at is null and store_id = v_store
      and lower(btrim(wine_name)) = lower(btrim(v_src.wine_name))
      and coalesce(vintage, 0) = coalesce(v_src.vintage, 0)
      and lower(coalesce(btrim(rack), '')) = lower(coalesce(v_rack, ''))
    for update;
    v_new := v_dst is null;

    perform set_config('app.stock_action', 'transfer_in', true);
    if v_new then
      insert into public.stock_items (
        store_id, rack, country, wine_name, vintage, rating_rp, rating_ws, maturity_from, maturity_to,
        price_per_bottle, supplier, purchase_date, remark, balance
      ) values (
        v_store, v_rack, v_src.country, v_src.wine_name, v_src.vintage, v_src.rating_rp, v_src.rating_ws,
        v_src.maturity_from, v_src.maturity_to, v_src.price_per_bottle, v_src.supplier, v_src.purchase_date,
        v_src.remark, v_qty
      ) returning id into v_dst;
    else
      update public.stock_items set balance = balance + v_qty where id = v_dst;
    end if;

    insert into public.transfer_lines (
      transfer_id, line_no, from_stock_item_id, to_stock_item_id, to_is_new_item, qty, remark,
      from_store_id, from_rack, to_store_id, to_rack, wine_name, vintage
    ) values (
      v_doc.id, v_no, v_src.id, v_dst, v_new, v_qty, nullif(btrim(v_line ->> 'remark'), ''),
      v_src.store_id, v_src.rack, v_store, v_rack, v_src.wine_name, v_src.vintage
    );
  end loop;
  return v_doc;
end;
$$;

create or replace function public.void_transfer(p_id uuid, p_reason text)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  public.transfers;
  v_line record;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_doc from public.transfers where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;
  perform set_config('app.stock_action', 'void_transfer', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in
    select l.to_stock_item_id, sum(l.qty)::int as qty, s.balance, s.wine_name
    from public.transfer_lines l join public.stock_items s on s.id = l.to_stock_item_id
    where l.transfer_id = p_id group by l.to_stock_item_id, s.balance, s.wine_name
  loop
    if v_line.balance < v_line.qty then
      raise exception 'ยกเลิกไม่ได้: % ที่ปลายทางคงเหลือ % ขวด น้อยกว่าที่โอนมา % ขวด', v_line.wine_name, v_line.balance, v_line.qty;
    end if;
    update public.stock_items set balance = balance - v_line.qty where id = v_line.to_stock_item_id;
  end loop;

  update public.stock_items s set balance = s.balance + l.qty
  from (select from_stock_item_id, sum(qty) as qty from public.transfer_lines where transfer_id = p_id group by from_stock_item_id) l
  where s.id = l.from_stock_item_id;

  update public.transfers set status = 'void', void_reason = nullif(btrim(p_reason), ''), voided_at = now(), voided_by = auth.uid()
  where id = p_id returning * into v_doc;
  return v_doc;
end;
$$;

revoke execute on function public.post_sale(date, text, text, text, jsonb)     from public, anon;
revoke execute on function public.void_sale(uuid, text)                        from public, anon;
revoke execute on function public.post_adjustment(date, text, jsonb)           from public, anon;
revoke execute on function public.void_adjustment(uuid, text)                  from public, anon;
revoke execute on function public.post_transfer(date, text, jsonb)             from public, anon;
revoke execute on function public.void_transfer(uuid, text)                    from public, anon;
grant  execute on function public.post_sale(date, text, text, text, jsonb)     to authenticated;
grant  execute on function public.void_sale(uuid, text)                        to authenticated;
grant  execute on function public.post_adjustment(date, text, jsonb)           to authenticated;
grant  execute on function public.void_adjustment(uuid, text)                  to authenticated;
grant  execute on function public.post_transfer(date, text, jsonb)             to authenticated;
grant  execute on function public.void_transfer(uuid, text)                    to authenticated;
