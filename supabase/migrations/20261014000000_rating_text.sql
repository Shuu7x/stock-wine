-- ═══════════════════════════════════════════════════════════════════════════
-- รวมคะแนน RP / WS เป็นคอลัมน์เดียว "rating" (ข้อความ) เช่น '100RP, 98WS, 88RS'
-- รองรับนักวิจารณ์กี่รายก็ได้ · ค่าเดิมแปลงมาให้ แล้วเลิกใช้ rating_rp / rating_ws
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.stock_items   add column rating text;
alter table public.receipt_lines add column rating text;

update public.stock_items set rating = nullif(concat_ws(', ',
  case when rating_rp is not null then trim(trailing '.' from trim(trailing '0' from rating_rp::text)) || 'RP' end,
  case when rating_ws is not null then trim(trailing '.' from trim(trailing '0' from rating_ws::text)) || 'WS' end), '');
update public.receipt_lines set rating = nullif(concat_ws(', ',
  case when rating_rp is not null then trim(trailing '.' from trim(trailing '0' from rating_rp::text)) || 'RP' end,
  case when rating_ws is not null then trim(trailing '.' from trim(trailing '0' from rating_ws::text)) || 'WS' end), '');

-- ─── log: ติดตามคอลัมน์ rating แทน ─────────────────────────────────────────────
create or replace function public.log_stock_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields  text[] := array['store_id', 'rack', 'country', 'wine_name', 'vintage', 'rating',
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

-- ─── รับเข้า: rating แทน rating_rp / rating_ws ────────────────────────────────
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

    -- ไวน์เดียวกันคนละชั้นวาง = คนละรายการในสต็อก
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
        store_id, rack, country, wine_name, vintage, rating,
        maturity_from, maturity_to, price_per_bottle, supplier, purchase_date, remark, balance
      ) values (
        (v_line ->> 'store_id')::smallint,
        nullif(btrim(v_line ->> 'rack'), ''),
        nullif(btrim(v_line ->> 'country'), ''),
        btrim(v_line ->> 'wine_name'),
        (v_line ->> 'vintage')::smallint,
        nullif(btrim(v_line ->> 'rating'), ''),
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
        rating           = coalesce(nullif(btrim(v_line ->> 'rating'), ''), rating),
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
      rating, maturity_from, maturity_to, qty, price_per_bottle, supplier, purchase_date, remark
    ) values (
      v_receipt.id, v_no, v_item_id, v_is_new,
      (v_line ->> 'store_id')::smallint,
      nullif(btrim(v_line ->> 'rack'), ''),
      nullif(btrim(v_line ->> 'country'), ''),
      btrim(v_line ->> 'wine_name'),
      (v_line ->> 'vintage')::smallint,
      nullif(btrim(v_line ->> 'rating'), ''),
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

-- ─── แก้ในหน้าสต็อก: rating ───────────────────────────────────────────────────
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
      rating           = case when v_patch ? 'rating'           then nullif(btrim(v_patch ->> 'rating'), '')     else rating end,
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

-- ─── โอนย้าย: รายการใหม่ที่ปลายทางคัดลอก rating ─────────────────────────────────
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
        store_id, rack, country, wine_name, vintage, rating, maturity_from, maturity_to,
        price_per_bottle, supplier, purchase_date, remark, balance
      ) values (
        v_store, v_rack, v_src.country, v_src.wine_name, v_src.vintage, v_src.rating,
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

-- คอลัมน์เดิมไม่ใช้แล้ว
alter table public.stock_items   drop column rating_rp, drop column rating_ws;
alter table public.receipt_lines drop column rating_rp, drop column rating_ws;
