import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/auth'
import { receiptHandlers } from '@/mocks/handlers/receipts'
import { settingsHandlers } from '@/mocks/handlers/settings'
import { stockHandlers } from '@/mocks/handlers/stock'
import { withdrawalHandlers } from '@/mocks/handlers/withdrawals'

export const worker = setupWorker(...authHandlers, ...settingsHandlers, ...stockHandlers, ...receiptHandlers, ...withdrawalHandlers)
