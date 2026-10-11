import { queryOptions } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { todayIso } from '@/lib/format'

export type Period = '7d' | '30d' | 'month' | 'year'

export const PERIOD_LABEL: Record<Period, string> = {
  '7d': '7 วัน',
  '30d': '30 วัน',
  month: 'เดือนนี้',
  year: 'ปีนี้',
}

export type Range = { from: string; to: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** ช่วงที่เลือก + ช่วงก่อนหน้าที่ยาวเท่ากัน (ไว้เทียบ %) */
export function periodRanges(p: Period, today = new Date(`${todayIso()}T00:00:00`)): { cur: Range; prev: Range } {
  if (p === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    // เทียบกับช่วงวันเดียวกันของเดือนก่อน (1 → วันที่เท่ากัน)
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()))
    return { cur: { from: iso(start), to: iso(today) }, prev: { from: iso(prevStart), to: iso(prevEnd) } }
  }
  if (p === 'year') {
    const start = new Date(today.getFullYear(), 0, 1)
    const prevStart = new Date(today.getFullYear() - 1, 0, 1)
    const prevEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    return { cur: { from: iso(start), to: iso(today) }, prev: { from: iso(prevStart), to: iso(prevEnd) } }
  }
  const days = p === '7d' ? 7 : 30
  const start = addDays(today, -(days - 1))
  return {
    cur: { from: iso(start), to: iso(today) },
    prev: { from: iso(addDays(start, -days)), to: iso(addDays(start, -1)) },
  }
}

/** แบ่งช่วงเป็นแท่งกราฟ: รายวัน หรือรายเดือน (ปีนี้) */
export function buckets(p: Period, r: Range): Array<{ key: string; label: string; from: string; to: string }> {
  const out: Array<{ key: string; label: string; from: string; to: string }> = []
  const start = new Date(`${r.from}T00:00:00`)
  const end = new Date(`${r.to}T00:00:00`)
  if (p === 'year') {
    for (let m = 0; m <= end.getMonth(); m++) {
      const a = new Date(start.getFullYear(), m, 1)
      const b = new Date(start.getFullYear(), m + 1, 0)
      out.push({ key: iso(a).slice(0, 7), label: a.toLocaleDateString('th-TH', { month: 'short' }), from: iso(a), to: iso(b) })
    }
    return out
  }
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const k = iso(d)
    out.push({ key: k, label: String(d.getDate()), from: k, to: k })
  }
  return out
}

type Sale = Tables<'sales'> & { sale_lines: Tables<'sale_lines'>[] }
type Receipt = Tables<'receipts'> & { receipt_lines: Tables<'receipt_lines'>[] }
type Withdrawal = Tables<'withdrawals'> & { withdrawal_lines: Tables<'withdrawal_lines'>[] }

export type Activity = { sales: Sale[]; receipts: Receipt[]; withdrawalLines: Tables<'withdrawal_lines'>[] }

/**
 * เอกสารที่บันทึกแล้วตั้งแต่ต้นช่วงก่อนหน้าถึงวันนี้ (ครอบทั้งสองช่วง ใช้ query ชุดเดียว)
 * อยู่ใต้ ['ops'] → บันทึกขาย/รับเข้า/เบิก/ยกเลิก แล้ว dashboard รีเฟรชเอง
 */
export const activityOptions = (from: string, to: string) =>
  queryOptions({
    queryKey: ['ops', 'dashboard', { from, to }] as const,
    queryFn: async (): Promise<Activity> => {
      const [sales, receipts, withdrawals] = await Promise.all([
        supabase.from('sales').select('*, sale_lines(*)').eq('status', 'posted').gte('sold_at', from).lte('sold_at', to).limit(5000),
        supabase.from('receipts').select('*, receipt_lines(*)').eq('status', 'posted').gte('received_at', from).lte('received_at', to).limit(5000),
        // ใบเบิกไม่มีวันที่หัวเอกสาร (วันที่อยู่ที่แต่ละรายการ) → ดึงใบที่สร้างไม่นานมานี้ แล้วกรองตามวันที่เบิก
        supabase
          .from('withdrawals')
          .select('*, withdrawal_lines(*)')
          .eq('status', 'posted')
          .gte('created_at', new Date(new Date(`${from}T00:00:00`).getTime() - 120 * 864e5).toISOString())
          .limit(5000),
      ])
      for (const r of [sales, receipts, withdrawals]) if (r.error) throw r.error
      return {
        sales: (sales.data ?? []) as Sale[],
        receipts: (receipts.data ?? []) as Receipt[],
        withdrawalLines: ((withdrawals.data ?? []) as Withdrawal[])
          .flatMap((w) => w.withdrawal_lines)
          .filter((l) => l.withdraw_date >= from && l.withdraw_date <= to),
      }
    },
  })
