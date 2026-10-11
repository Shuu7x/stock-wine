-- ═══════════════════════════════════════════════════════════════════════════
-- เลิกรวมหลายใบขายเป็นบิลเดียว: 1 ใบขาย = 1 บิล (ออกเมื่อกดพิมพ์บิล)
-- ยกเลิกใบขาย = ยกเลิกบิลของใบนั้นไปด้วย (ไม่มีหน้าออกบิลให้ไปยกเลิกแยกแล้ว)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.void_sale(p_id uuid, p_reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.sales;
begin
  if auth.uid() is null then raise exception 'ต้อง login ก่อน' using errcode = '42501'; end if;
  select * into v_doc from public.sales where id = p_id for update;
  if v_doc.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if v_doc.status = 'void' then raise exception 'เอกสารนี้ถูกยกเลิกแล้ว'; end if;

  -- บิลของใบขายนี้ยกเลิกตาม (บิลเก่าที่เคยรวมหลายใบ: ใบอื่นกลับไปพิมพ์บิลใหม่ได้)
  if v_doc.bill_id is not null then
    update public.bills
    set status = 'void',
        void_reason = 'ยกเลิกพร้อมใบขาย ' || v_doc.doc_no || coalesce(' — ' || nullif(btrim(p_reason), ''), ''),
        voided_at = now(),
        voided_by = auth.uid()
    where id = v_doc.bill_id and status = 'posted';
    update public.sales set bill_id = null where bill_id = v_doc.bill_id;
  end if;

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
