import type { LinkProps } from '@tanstack/react-router'
import { Building2, ListChecks, SlidersHorizontal, UserCog, Users, type LucideIcon } from 'lucide-react'

export type SettingsSection = {
  id: string
  /** ไม่มี = ยังไม่เปิดใช้ (แสดงเป็น "เร็วๆ นี้") */
  to?: LinkProps['to']
  label: string
  description: string
  icon: LucideIcon
  group: SettingsGroup
}

export const SETTINGS_GROUPS = ['ระบบ', 'ข้อมูลหลัก', 'ส่วนตัว'] as const
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number]

/**
 * เมนูตั้งค่าทั้งหมดอยู่ที่นี่ที่เดียว
 * เพิ่มหัวข้อใหม่ = เพิ่มรายการในนี้ + สร้าง route ที่ src/routes/_authenticated/settings/<ชื่อ>.tsx
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    to: '/settings/general',
    label: 'ทั่วไป',
    description: 'ค่าเริ่มต้นการรับเข้า แจ้งเตือนไวน์ใกล้หมด กติกาการเบิก',
    icon: SlidersHorizontal,
    group: 'ระบบ',
  },
  {
    id: 'users',
    label: 'ผู้ใช้และสิทธิ์',
    description: 'กำหนดบทบาท ผู้ดูแล / พนักงาน / ดูอย่างเดียว',
    icon: Users,
    group: 'ระบบ',
  },
  {
    id: 'stores',
    to: '/settings/stores',
    label: 'คลังสินค้า',
    description: 'ชื่อ รหัส ลำดับ และการเปิด/ปิดคลัง',
    icon: Building2,
    group: 'ข้อมูลหลัก',
  },
  {
    id: 'lookups',
    to: '/settings/lookups',
    label: 'ตัวเลือกที่ใช้บ่อย',
    description: 'ประเทศ ผู้ขาย ชั้นวาง ที่ให้เลือกในตาราง',
    icon: ListChecks,
    group: 'ข้อมูลหลัก',
  },
  {
    id: 'account',
    to: '/settings/account',
    label: 'บัญชีของฉัน',
    description: 'รหัสผ่าน และข้อมูลที่จำไว้ในเครื่องนี้',
    icon: UserCog,
    group: 'ส่วนตัว',
  },
]
