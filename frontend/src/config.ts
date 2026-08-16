import { z } from 'zod'

const environmentSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1),
  VITE_MEDIA_BASE_URL: z.string(),
})

const environment = environmentSchema.parse(import.meta.env)

export const config = {
  apiBaseUrl: environment.VITE_API_BASE_URL,
  mediaBaseUrl: environment.VITE_MEDIA_BASE_URL,
} as const
