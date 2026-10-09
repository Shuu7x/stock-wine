import { z } from 'zod'

const schema = z.object({
  VITE_ENABLE_MOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export const env = schema.parse(import.meta.env)
