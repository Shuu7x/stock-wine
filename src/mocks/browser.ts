import { setupWorker } from 'msw/browser'
import { accessHandlers } from '@/mocks/handlers/access'
import { authHandlers } from '@/mocks/handlers/auth'
import { billHandlers } from '@/mocks/handlers/bills'
import { operationHandlers } from '@/mocks/handlers/operations'
import { receiptHandlers } from '@/mocks/handlers/receipts'
import { settingsHandlers } from '@/mocks/handlers/settings'
import { stockHandlers } from '@/mocks/handlers/stock'
import { storageHandlers } from '@/mocks/handlers/storage'
import { withdrawalHandlers } from '@/mocks/handlers/withdrawals'

export const worker = setupWorker(
  ...authHandlers,
  ...accessHandlers,
  ...settingsHandlers,
  ...stockHandlers,
  ...receiptHandlers,
  ...withdrawalHandlers,
  ...operationHandlers,
  ...billHandlers,
  ...storageHandlers,
)
