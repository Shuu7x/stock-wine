import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/auth'
import { receiptHandlers } from '@/mocks/handlers/receipts'
import { stockHandlers } from '@/mocks/handlers/stock'
import { withdrawalHandlers } from '@/mocks/handlers/withdrawals'

export const worker = setupWorker(...authHandlers, ...stockHandlers, ...receiptHandlers, ...withdrawalHandlers)
