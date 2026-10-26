import type { LinkProps } from '@tanstack/react-router'
import { Database, Receipt, SlidersHorizontal, Type, UserCog, Users, type LucideIcon } from 'lucide-react'

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
    description: 'ค่าตั้งต้นของการรับเข้า เบิก และขาย',
    icon: SlidersHorizontal,
    group: 'ระบบ',
  },
  {
    id: 'bill',
    to: '/settings/bill',
    label: 'ใบเสร็จ / บิล',
    description: 'หัวบิล ท้ายบิล และขนาดกระดาษ',
    icon: Receipt,
    group: 'ระบบ',
  },
  {
    id: 'users',
    to: '/settings/users',
    label: 'ผู้ใช้และสิทธิ์',
    description: 'ใครเข้าระบบได้ และทำอะไรได้บ้าง',
    icon: Users,
    group: 'ระบบ',
  },
  {
    id: 'lookups',
    to: '/settings/lookups',
    label: 'ข้อมูลหลัก',
    description: 'ตัวเลือกในตาราง: คลัง ประเภท ขนาด ประเทศ ฯลฯ · การเรียงลำดับ',
    icon: Database,
    group: 'ข้อมูลหลัก',
  },
  {
    id: 'display',
    to: '/settings/display',
    label: 'การแสดงผล',
    description: 'ขนาดตัวหนังสือทั้งระบบ (เฉพาะเครื่องนี้)',
    icon: Type,
    group: 'ส่วนตัว',
  },
  {
    id: 'account',
    to: '/settings/account',
    label: 'บัญชีของฉัน',
    description: 'รหัสผ่าน และข้อมูลในเครื่องนี้',
    icon: UserCog,
    group: 'ส่วนตัว',
  },
]
