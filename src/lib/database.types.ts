// เขียนมือให้ตรงกับ supabase/migrations/20261009000000_wine_stock.sql
// เมื่อมี Supabase local แล้วให้รัน `npm run db:types` เพื่อ generate ทับไฟล์นี้

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Audit = {
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

type StoreRow = Audit & { id: number; code: string; name: string; sort_order: number }

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
      stores: ReadOnlyTable<StoreRow>
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
