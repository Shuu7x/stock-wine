// เขียนมือให้ตรงกับ supabase/migrations/20261009000000_wine_stock.sql
// เมื่อมี Supabase local แล้วให้รัน `npm run db:types` เพื่อ generate ทับไฟล์นี้

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Audit = {
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

type StoreRow = Audit & { id: number; code: string; name: string; sort_order: number; is_active: boolean }
type StoreWrite = Partial<Pick<StoreRow, 'code' | 'name' | 'sort_order' | 'is_active'>>

export type LookupCategory = 'country' | 'supplier' | 'rack'

type LookupValueRow = Audit & {
  id: string
  category: LookupCategory
  store_id: number | null
  value: string
  sort_order: number
  is_active: boolean
}
type LookupValueWrite = Partial<Pick<LookupValueRow, 'id' | 'category' | 'store_id' | 'value' | 'sort_order' | 'is_active'>>

type AppSettingRow = Audit & { key: string; value: Json }

type StockItemRow = Audit & {
  id: string
  store_id: number
  rack: string | null
  country: string | null
  wine_name: string
  vintage: number | null
  rating_rp: number | null
  rating_ws: number | null
  maturity_from: number | null
  maturity_to: number | null
  price_per_bottle: number | null
  supplier: string | null
  purchase_date: string | null
  remark: string | null
  balance: number
  deleted_at: string | null
  deleted_by: string | null
}

type DocStatus = 'posted' | 'void'

type ReceiptRow = Audit & {
  id: string
  doc_no: string
  received_at: string
  note: string | null
  status: DocStatus
  void_reason: string | null
  voided_at: string | null
  voided_by: string | null
  created_by_email: string | null
}

type ReceiptLineRow = Audit & {
  id: string
  receipt_id: string
  line_no: number
  stock_item_id: string
  is_new_item: boolean
  store_id: number
  rack: string | null
  country: string | null
  wine_name: string
  vintage: number | null
  rating_rp: number | null
  rating_ws: number | null
  maturity_from: number | null
  maturity_to: number | null
  qty: number
  price_per_bottle: number | null
  supplier: string | null
  purchase_date: string | null
  remark: string | null
}

type WithdrawalRow = Audit & {
  id: string
  doc_no: string
  note: string | null
  status: DocStatus
  void_reason: string | null
  voided_at: string | null
  voided_by: string | null
  created_by_email: string | null
}

type WithdrawalLineRow = Audit & {
  id: string
  withdrawal_id: string
  line_no: number
  stock_item_id: string
  withdraw_date: string
  qty: number
  remark: string | null
  store_id: number
  rack: string | null
  country: string | null
  wine_name: string
  vintage: number | null
  price_per_bottle: number | null
}

export type StockAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'receive'
  | 'withdraw'
  | 'void_receipt'
  | 'void_withdrawal'
  | 'sale'
  | 'void_sale'
  | 'adjust'
  | 'void_adjustment'
  | 'transfer_out'
  | 'transfer_in'
  | 'void_transfer'

type StockItemLogRow = Audit & {
  id: number
  stock_item_id: string
  action: StockAction
  ref_doc: string | null
  changes: Record<string, { old: Json | undefined; new: Json | undefined }>
  store_id: number
  wine_name: string
  vintage: number | null
  created_by_email: string | null
}

type DocBase = Audit & {
  id: string
  doc_no: string
  note: string | null
  status: DocStatus
  void_reason: string | null
  voided_at: string | null
  voided_by: string | null
  created_by_email: string | null
}

export type VatMode = 'included' | 'excluded'

type SaleRow = DocBase & {
  sold_at: string
  customer: string | null
  vat_mode: VatMode
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
}

type SaleLineRow = Audit & {
  id: string
  sale_id: string
  line_no: number
  stock_item_id: string
  qty: number
  unit_price: number
  has_vat: boolean
  amount_before_vat: number
  vat_amount: number
  line_total: number
  remark: string | null
  store_id: number
  rack: string | null
  country: string | null
  wine_name: string
  vintage: number | null
  cost_per_bottle: number | null
}

type AdjustmentRow = DocBase & { adjusted_at: string }

type AdjustmentLineRow = Audit & {
  id: string
  adjustment_id: string
  line_no: number
  stock_item_id: string
  balance_before: number
  balance_after: number
  diff: number
  reason: string
  remark: string | null
  store_id: number
  rack: string | null
  wine_name: string
  vintage: number | null
}

type TransferRow = DocBase & { transferred_at: string }

type TransferLineRow = Audit & {
  id: string
  transfer_id: string
  line_no: number
  from_stock_item_id: string
  to_stock_item_id: string
  to_is_new_item: boolean
  qty: number
  remark: string | null
  from_store_id: number
  from_rack: string | null
  to_store_id: number
  to_rack: string | null
  wine_name: string
  vintage: number | null
}

/** ตารางรายการ (lines) อ่านอย่างเดียว ที่ผูกกับหัวเอกสาร — ให้ select('*, <lines>(*)') ได้ type ถูก */
type LineTable<Row, FK extends string, Ref extends string> = {
  Row: Row
  Insert: never
  Update: never
  Relationships: [
    {
      foreignKeyName: `${string}_${FK}_fkey`
      columns: [FK]
      isOneToOne: false
      referencedRelation: Ref
      referencedColumns: ['id']
    },
  ]
}

type ReadOnlyTable<Row> = {
  Row: Row
  Insert: never
  Update: never
  Relationships: []
}

type StockItemUpdate = Partial<
  Pick<
    StockItemRow,
    | 'store_id'
    | 'rack'
    | 'country'
    | 'wine_name'
    | 'vintage'
    | 'rating_rp'
    | 'rating_ws'
    | 'maturity_from'
    | 'maturity_to'
    | 'price_per_bottle'
    | 'supplier'
    | 'purchase_date'
    | 'remark'
    | 'deleted_at'
    | 'deleted_by'
  >
>

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: StoreRow
        Insert: StoreWrite & Pick<StoreRow, 'code' | 'name'>
        Update: StoreWrite
        Relationships: []
      }
      lookup_values: {
        Row: LookupValueRow
        Insert: LookupValueWrite & Pick<LookupValueRow, 'category' | 'value'>
        Update: LookupValueWrite
        Relationships: []
      }
      app_settings: {
        Row: AppSettingRow
        Insert: { key: string; value: Json }
        Update: { value?: Json }
        Relationships: []
      }
      stock_items: {
        Row: StockItemRow
        Insert: never
        Update: StockItemUpdate
        Relationships: []
      }
      receipts: ReadOnlyTable<ReceiptRow>
      receipt_lines: {
        Row: ReceiptLineRow
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'receipt_lines_receipt_id_fkey'
            columns: ['receipt_id']
            isOneToOne: false
            referencedRelation: 'receipts'
            referencedColumns: ['id']
          },
        ]
      }
      stock_item_logs: ReadOnlyTable<StockItemLogRow>
      withdrawals: ReadOnlyTable<WithdrawalRow>
      sales: ReadOnlyTable<SaleRow>
      sale_lines: LineTable<SaleLineRow, 'sale_id', 'sales'>
      stock_adjustments: ReadOnlyTable<AdjustmentRow>
      stock_adjustment_lines: LineTable<AdjustmentLineRow, 'adjustment_id', 'stock_adjustments'>
      transfers: ReadOnlyTable<TransferRow>
      transfer_lines: LineTable<TransferLineRow, 'transfer_id', 'transfers'>
      withdrawal_lines: {
        Row: WithdrawalLineRow
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'withdrawal_lines_withdrawal_id_fkey'
            columns: ['withdrawal_id']
            isOneToOne: false
            referencedRelation: 'withdrawals'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      post_receipt: {
        Args: { p_received_at: string; p_note: string | null; p_lines: Json }
        Returns: ReceiptRow
      }
      post_withdrawal: {
        Args: { p_note: string | null; p_lines: Json }
        Returns: WithdrawalRow
      }
      post_sale: {
        Args: { p_sold_at: string; p_customer: string | null; p_note: string | null; p_vat_mode: VatMode; p_lines: Json }
        Returns: SaleRow
      }
      void_sale: { Args: { p_id: string; p_reason: string | null }; Returns: SaleRow }
      post_adjustment: { Args: { p_adjusted_at: string; p_note: string | null; p_lines: Json }; Returns: AdjustmentRow }
      void_adjustment: { Args: { p_id: string; p_reason: string | null }; Returns: AdjustmentRow }
      post_transfer: { Args: { p_transferred_at: string; p_note: string | null; p_lines: Json }; Returns: TransferRow }
      void_transfer: { Args: { p_id: string; p_reason: string | null }; Returns: TransferRow }
      save_stock_changes: {
        Args: { p_updates: Json; p_deletes: string[] }
        Returns: number
      }
      void_receipt: { Args: { p_id: string; p_reason: string | null }; Returns: ReceiptRow }
      void_withdrawal: { Args: { p_id: string; p_reason: string | null }; Returns: WithdrawalRow }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
