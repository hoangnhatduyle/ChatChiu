import { z } from 'zod'
import { optionalText, requiredText } from './fields.js'

/** The icons a location can show on the Kitchen board (UI refresh): the web app draws each from `ui/Icon.tsx`. */
export const LOCATION_ICONS = [
  'counter',
  'snow',
  'fridge',
  'shelf',
  'refill',
  'cookie',
  'spice',
  'jar',
  'bowl',
  'bag',
  'bottle',
  'leaf',
  'bread',
  'box',
  'pin',
] as const
export type LocationIcon = (typeof LOCATION_ICONS)[number]

/** The tints a location header can have; each is a theme token `--loc-<name>` in the web app. */
export const LOCATION_COLORS = [
  'sand',
  'ice',
  'mint',
  'clay',
  'teal',
  'rose',
  'saffron',
  'lilac',
] as const
export type LocationColor = (typeof LOCATION_COLORS)[number]

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
