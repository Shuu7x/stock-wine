-- ═══════════════════════════════════════════════════════════════════════════
-- ใบรับเข้า: "ซื้อจากใคร" + "วันที่ซื้อ" อยู่ที่หัวเอกสาร · แนบรูป/ไฟล์บิลที่ซื้อมาได้
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.receipts
  add column supplier      text,
  add column purchase_date date;

-- ─── ไฟล์แนบ (รูปบิล) ─────────────────────────────────────────────────────────
create table public.receipt_attachments (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts (id),
  path        text not null,          -- ตำแหน่งใน storage bucket "receipt-files"
  file_name   text not null,
  mime_type   text,
  size_bytes  integer,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index receipt_attachments_receipt_idx on public.receipt_attachments (receipt_id);

alter table public.receipt_attachments enable row level security;
create policy receipt_attachments_select on public.receipt_attachments for select to authenticated using (true);
-- เพิ่มผ่าน post_receipt เท่านั้น (security definer) — ไม่มี policy insert/update/delete

-- bucket ส่วนตัว: ผู้ที่ login อัปโหลด/ดูได้ · ไม่มีการลบ
insert into storage.buckets (id, name, public)
values ('receipt-files', 'receipt-files', false)
on conflict (id) do nothing;

create policy receipt_files_read on storage.objects for select to authenticated
  using (bucket_id = 'receipt-files');
create policy receipt_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipt-files');

-- ─── post_receipt: หัวเอกสาร (ผู้ขาย · วันที่ซื้อ) + ไฟล์แนบ ─────────────────────
drop function public.post_receipt(date, text, jsonb);

create function public.post_receipt(
  p_received_at   date,
  p_note          text,
  p_lines         jsonb,
  p_supplier      text default null,
  p_purchase_date date default null,
  p_attachments   jsonb default '[]'::jsonb  -- [{ path, file_name, mime_type, size_bytes }]
)
returns public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt  public.receipts;
  v_line     jsonb;
  v_file     jsonb;
  v_item_id  uuid;
  v_is_new   boolean;
  v_no       smallint := 0;
  v_supplier text := nullif(btrim(p_supplier), '');
begin
  if auth.uid() is null then
    raise exception 'ต้อง login ก่อน' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีรายการรับเข้า';
  end if;

  insert into public.receipts (received_at, note, supplier, purchase_date)
  values (coalesce(p_received_at, current_date), nullif(btrim(p_note), ''), v_supplier, p_purchase_date)
  returning * into v_receipt;

  perform set_config('app.stock_action', 'receive', true);
  perform set_config('app.ref_doc', v_receipt.doc_no, true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    if coalesce((v_line ->> 'qty')::int, 0) <= 0 then
      raise exception 'แถว %: จำนวนรับต้องมากกว่า 0', v_no;
    end if;
    -- บังคับเลือกคลัง + ชั้นวาง
    if (v_line ->> 'store_id') is null or nullif(btrim(v_line ->> 'rack'), '') is null then
      raise exception 'แถว %: เลือกคลังและ Wine racks (ชั้นวาง)', v_no;
    end if;
    -- ผู้ขาย / วันที่ซื้อ ของหัวเอกสารใช้กับทุกรายการ (ถ้ารายการไม่ได้ระบุเอง)
    v_line := v_line
      || jsonb_build_object('supplier', coalesce(nullif(btrim(v_line ->> 'supplier'), ''), v_supplier))
      || jsonb_build_object('purchase_date', coalesce(v_line ->> 'purchase_date', p_purchase_date::text));

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

  for v_file in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.receipt_attachments (receipt_id, path, file_name, mime_type, size_bytes)
    values (
      v_receipt.id,
      v_file ->> 'path',
      coalesce(nullif(btrim(v_file ->> 'file_name'), ''), 'ไฟล์แนบ'),
      v_file ->> 'mime_type',
      (v_file ->> 'size_bytes')::int
    );
  end loop;

  return v_receipt;
end;
$$;

revoke execute on function public.post_receipt(date, text, jsonb, text, date, jsonb) from public, anon;
grant  execute on function public.post_receipt(date, text, jsonb, text, date, jsonb) to authenticated;
