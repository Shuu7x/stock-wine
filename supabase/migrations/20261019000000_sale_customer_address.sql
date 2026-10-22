-- ═══════════════════════════════════════════════════════════════════════════
-- ใบขาย: ที่อยู่ลูกค้า · บิลแสดงที่อยู่และหมายเหตุของใบขาย
-- * sales.customer_address / bills.customer_address
-- * post_sale รับ p_customer_address (ไม่ส่ง = ไม่มีที่อยู่)
-- * issue_bills คัดลอกที่อยู่และหมายเหตุจากใบขายลงบิล
-- * หน้าขายเลิกใช้ remark รายบรรทัด (คอลัมน์ยังอยู่ ข้อมูลเดิมไม่หาย)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sales add column customer_address text;
alter table public.bills add column customer_address text;

-- ─── post_sale: เพิ่มที่อยู่ลูกค้า (เปลี่ยน signature → drop ของเดิมก่อน) ────────────
drop function public.post_sale(date, text, text, text, jsonb);

create function public.post_sale(
  p_sold_at date, p_customer text, p_note text, p_vat_mode text, p_lines jsonb,
  p_customer_address text default null)
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

  insert into public.sales (sold_at, customer, customer_address, note, vat_mode, vat_rate)
  values (coalesce(p_sold_at, current_date), nullif(btrim(p_customer), ''), nullif(btrim(p_customer_address), ''),
          nullif(btrim(p_note), ''), p_vat_mode, v_rate)
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

revoke execute on function public.post_sale(date, text, text, text, jsonb, text) from public, anon;
grant  execute on function public.post_sale(date, text, text, text, jsonb, text) to authenticated;

-- ─── issue_bills: ที่อยู่ + หมายเหตุจากใบขาย ──────────────────────────────────────
create or replace function public.issue_bills(p_issued_at date, p_groups jsonb)
returns setof public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_ids   uuid[];
  v_bill  public.bills;
  v_n     int;
  v_no    int := 0;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then raise exception 'ไม่มีใบขายที่จะออกบิล'; end if;

  for v_group in select * from jsonb_array_elements(p_groups) loop
    v_no := v_no + 1;
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_group -> 'sale_ids') x;
    if v_ids is null or cardinality(v_ids) = 0 then raise exception 'บิลที่ %: ไม่มีใบขาย', v_no; end if;

    -- ล็อกใบขาย และตรวจว่ายังออกบิลได้
    perform 1 from public.sales where id = any (v_ids) for update;
    select count(*) into v_n from public.sales where id = any (v_ids) and status = 'posted' and bill_id is null;
    if v_n <> cardinality(v_ids) then
      raise exception 'บิลที่ %: มีใบขายที่ถูกยกเลิกหรือออกบิลไปแล้ว', v_no;
    end if;

    -- ที่อยู่ลูกค้า / หมายเหตุ: จากกลุ่มที่ส่งมา ไม่มีก็ใช้ของใบขาย
    insert into public.bills (issued_at, customer, customer_address, note, subtotal, vat_amount, total)
    select coalesce(p_issued_at, current_date),
           coalesce(nullif(btrim(v_group ->> 'customer'), ''), min(customer)),
           coalesce(nullif(btrim(v_group ->> 'customer_address'), ''), min(customer_address)),
           coalesce(nullif(btrim(v_group ->> 'note'), ''), string_agg(note, ' · ')),
           sum(subtotal), sum(vat_amount), sum(total)
    from public.sales where id = any (v_ids)
    returning * into v_bill;

    insert into public.bill_sales (bill_id, sale_id) select v_bill.id, unnest(v_ids);
    update public.sales set bill_id = v_bill.id where id = any (v_ids);
    return next v_bill;
  end loop;
end;
$$;
