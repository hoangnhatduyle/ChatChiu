import { z } from 'zod'
import { optionalText, requiredText } from './fields.js'

export const locationCreate = z.object({
  name: requiredText(100),
  subLocation: optionalText(100),
})
export type LocationCreate = z.infer<typeof locationCreate>

export const locationUpdate = locationCreate.partial()
export type LocationUpdate = z.infer<typeof locationUpdate>

export interface Location {
  id: number
  userId: string
  name: string
  subLocation: string | null
  createdAt: string
}
