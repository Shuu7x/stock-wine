-- ประวัติการทำรายการของไวน์แต่ละรายการ (เพิ่ม/แก้ไข/ลบ/กู้คืน/รับเข้า/เบิก/ยกเลิกเอกสาร)
-- trigger บน stock_items เขียนทุกครั้งที่ข้อมูลเปลี่ยน จึงไม่มีทางแก้ข้อมูลโดยไม่ทิ้งร่องรอย
-- function ที่ทำเอกสาร (post_* / void_*) บอกประเภทและเลขเอกสารผ่าน set_config('app.stock_action' / 'app.ref_doc')

create table public.stock_item_logs (
  id               bigint generated always as identity primary key,
  stock_item_id    uuid not null references public.stock_items (id),
  action           text not null check (action in (
                     'create', 'update', 'delete', 'restore',
                     'receive', 'withdraw', 'void_receipt', 'void_withdrawal')),
  ref_doc          text,
  -- { "<field>": { "old": ..., "new": ... } }
  changes          jsonb not null default '{}'::jsonb,
  -- snapshot ไว้แสดงผล แม้ไวน์จะถูกแก้ชื่อภายหลัง
  store_id         smallint not null references public.stores (id),
  wine_name        text not null,
  vintage          smallint,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid()
);
create index stock_item_logs_item_idx on public.stock_item_logs (stock_item_id, created_at desc);
create index stock_item_logs_created_idx on public.stock_item_logs (created_at desc);

alter table public.stock_item_logs enable row level security;
create policy "อ่านได้เมื่อ login" on public.stock_item_logs for select to authenticated using (true);
revoke insert, update, delete on public.stock_item_logs from anon, authenticated;

create or replace function public.log_stock_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields  text[] := array['store_id', 'rack', 'country', 'wine_name', 'vintage', 'rating_rp', 'rating_ws',
                            'maturity_from', 'maturity_to', 'price_per_bottle', 'supplier', 'purchase_date',
                            'remark', 'balance', 'deleted_at'];
  v_action  text := nullif(current_setting('app.stock_action', true), '');
  v_ref     text := nullif(current_setting('app.ref_doc', true), '');
  v_old     jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new     jsonb := to_jsonb(new);
  v_changes jsonb := '{}'::jsonb;
  k         text;
begin
  foreach k in array v_fields loop
    if (v_old -> k) is distinct from (v_new -> k) and not (tg_op = 'INSERT' and v_new -> k = 'null'::jsonb) then
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k));
    end if;
  end loop;

  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return new;
  end if;

  if v_action is null then
    v_action := case
      when tg_op = 'INSERT' then 'create'
      when old.deleted_at is null and new.deleted_at is not null then 'delete'
      when old.deleted_at is not null and new.deleted_at is null then 'restore'
      else 'update'
    end;
  end if;

  insert into public.stock_item_logs (stock_item_id, action, ref_doc, changes, store_id, wine_name, vintage)
  values (new.id, v_action, v_ref, v_changes, new.store_id, new.wine_name, new.vintage);
  return new;
end;
$$;

create trigger stock_items_log after insert or update on public.stock_items
  for each row execute function public.log_stock_item_change();

-- ─── ให้ function เอกสารบอกประเภทรายการให้ log ─────────────────────────────────
-- (ประกาศ function ซ้ำทั้งตัวจาก migration แรก เพิ่มเฉพาะบรรทัด set_config)

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

  perform set_config('app.stock_action', 'receive', true);
  perform set_config('app.ref_doc', v_receipt.doc_no, true);

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

  perform set_config('app.stock_action', 'withdraw', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

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

  perform set_config('app.stock_action', 'void_receipt', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

  for v_line in
    select l.stock_item_id as item_id, sum(l.qty)::int as qty, s.balance, s.wine_name
    from public.receipt_lines l join public.stock_items s on s.id = l.stock_item_id
    where l.receipt_id = p_id
    group by l.stock_item_id, s.balance, s.wine_name
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

  perform set_config('app.stock_action', 'void_withdrawal', true);
  perform set_config('app.ref_doc', v_doc.doc_no, true);

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

-- ─── save_stock_changes: บันทึกการแก้ไข + ลบ จากหน้าสต็อกในครั้งเดียว (all-or-nothing) ───
-- p_updates: [{ id, patch: { rack, country, wine_name, ... } }] · p_deletes: uuid[]
-- security invoker: ผ่าน RLS และ column grant ของผู้ใช้ตามปกติ (แก้ balance ไม่ได้)
create or replace function public.save_stock_changes(p_updates jsonb, p_deletes uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_row   jsonb;
  v_patch jsonb;
  v_count integer := 0;
  v_hit   integer;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    v_patch := v_row -> 'patch';
    if v_patch ? 'wine_name' and coalesce(btrim(v_patch ->> 'wine_name'), '') = '' then
      raise exception 'ชื่อไวน์ห้ามว่าง';
    end if;
    update public.stock_items set
      rack             = case when v_patch ? 'rack'             then nullif(btrim(v_patch ->> 'rack'), '')       else rack end,
      country          = case when v_patch ? 'country'          then nullif(btrim(v_patch ->> 'country'), '')    else country end,
      wine_name        = case when v_patch ? 'wine_name'        then btrim(v_patch ->> 'wine_name')              else wine_name end,
      vintage          = case when v_patch ? 'vintage'          then (v_patch ->> 'vintage')::smallint           else vintage end,
      rating_rp        = case when v_patch ? 'rating_rp'        then (v_patch ->> 'rating_rp')::numeric          else rating_rp end,
      rating_ws        = case when v_patch ? 'rating_ws'        then (v_patch ->> 'rating_ws')::numeric          else rating_ws end,
      maturity_from    = case when v_patch ? 'maturity_from'    then (v_patch ->> 'maturity_from')::smallint     else maturity_from end,
      maturity_to      = case when v_patch ? 'maturity_to'      then (v_patch ->> 'maturity_to')::smallint       else maturity_to end,
      price_per_bottle = case when v_patch ? 'price_per_bottle' then (v_patch ->> 'price_per_bottle')::numeric   else price_per_bottle end,
      supplier         = case when v_patch ? 'supplier'         then nullif(btrim(v_patch ->> 'supplier'), '')   else supplier end,
      purchase_date    = case when v_patch ? 'purchase_date'    then (v_patch ->> 'purchase_date')::date         else purchase_date end,
      remark           = case when v_patch ? 'remark'           then nullif(btrim(v_patch ->> 'remark'), '')     else remark end
    where id = (v_row ->> 'id')::uuid and deleted_at is null;
    get diagnostics v_hit = row_count;
    v_count := v_count + v_hit;
  end loop;

  if p_deletes is not null and cardinality(p_deletes) > 0 then
    update public.stock_items
    set deleted_at = now(), deleted_by = auth.uid()
    where id = any (p_deletes) and deleted_at is null;
    get diagnostics v_hit = row_count;
    v_count := v_count + v_hit;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.save_stock_changes(jsonb, uuid[]) from public, anon;
grant  execute on function public.save_stock_changes(jsonb, uuid[]) to authenticated;
