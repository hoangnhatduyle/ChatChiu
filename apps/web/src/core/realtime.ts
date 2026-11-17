// Live updates between devices (step 4.6, SPEC-KB-001 F-KB-16): a Supabase Realtime subscription on
// the three tables the board, shopping list and meal plan are built from. Realtime applies RLS, so a
// device only receives its own account's rows. This module only delivers typed changes; writing them
// into the cache is data/realtime-sync.ts (AR-LAYERS: core talks to Supabase, data owns the cache).
//
// @supabase/realtime-js is loaded after boot (dynamic import), so it does not count against the
// initial-JS budget (decision 815e65dc, roadmap 7.0.15).
import { getAccessToken } from './auth-actions'
import { getAuthClient, readSupabaseConfig } from './supabase.client'

export type RealtimeTable = 'inventory_items' | 'shopping_list' | 'meal_plans'
export type RealtimeChange = {
  table: RealtimeTable
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  /** camelCase; for a DELETE only what the database sends (the id). */
  row: Record<string, unknown> & { id: number }
}
export type RealtimeStatus = 'connecting' | 'live' | 'down'

const TABLES: readonly RealtimeTable[] = ['inventory_items', 'shopping_list', 'meal_plans']
const EVENTS = ['INSERT', 'UPDATE', 'DELETE'] as const
const CHANNEL_NAME = 'chatchiu-sync'
/** Waits before trying again when the client could not be created (offline at start). */
export const RECONNECT_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000] as const

type ChannelLike = {
  on: (
    type: 'postgres_changes',
    filter: object,
    callback: (payload: unknown) => void,
  ) => ChannelLike
  subscribe: (callback: (status: string) => void) => ChannelLike
}
/** The part of RealtimeClient used here (and faked in tests). */
export type ClientLike = {
  channel: (name: string) => ChannelLike
  removeChannel: (channel: ChannelLike) => unknown
  disconnect: () => unknown
}

export type RealtimeOptions = {
  connect: () => Promise<ClientLike>
  onChange: (change: RealtimeChange) => void
  /** On the first join and after every drop and reconnect: changes made meanwhile were not delivered, so refetch. */
  onResync: () => void
  onStatus?: (status: RealtimeStatus) => void
}

export interface Realtime {
  start: () => void
  stop: () => void
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const camel = (key: string) => key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase())

function toChange(payload: unknown): RealtimeChange | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { eventType, table, new: next, old } = payload as Record<string, unknown>
  if (!TABLES.includes(table as RealtimeTable)) return null
  if (!EVENTS.includes(eventType as (typeof EVENTS)[number])) return null
  const source = eventType === 'DELETE' ? old : next
  if (typeof source !== 'object' || source === null) return null
  // Own properties on a plain object, never a prototype key.
  const row = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !key.startsWith('__') && !FORBIDDEN_KEYS.has(key))
      .map(([key, value]) => [camel(key), value] as const)
      .filter(([key]) => !FORBIDDEN_KEYS.has(key)),
  )
  if (typeof row.id !== 'number') return null
  return {
    table: table as RealtimeTable,
    type: eventType as RealtimeChange['type'],
    row: row as RealtimeChange['row'],
  }
}

export function createRealtime({
  connect,
  onChange,
  onResync,
  onStatus,
}: RealtimeOptions): Realtime {
  let running = false
  let generation = 0 // a stop (or restart) makes every older callback a no-op
  let client: ClientLike | undefined
  let channel: ChannelLike | undefined
  let hasBeenLive = false
  let isDown = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const status = (s: RealtimeStatus) => onStatus?.(s)

  async function open(mine: number, attempt: number) {
    let loaded: ClientLike
    try {
      loaded = await connect()
    } catch {
      if (mine !== generation) return
      status('down')
      const wait =
        RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)] ?? 30_000
      retryTimer = setTimeout(() => void open(mine, attempt + 1), wait)
      return
    }
    if (mine !== generation) {
      void loaded.disconnect() // stopped while it loaded: close it, do not leak it
      return
    }
    client = loaded
    let next = loaded.channel(CHANNEL_NAME)
    for (const table of TABLES) {
      next = next.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if (mine !== generation) return
        const change = toChange(payload)
        if (change) onChange(change)
      })
    }
    channel = next.subscribe((state) => {
      if (mine !== generation) return
      if (state === 'SUBSCRIBED') {
        status('live')
        // The first join too: changes made between the page's first fetch and this join were not delivered.
        if (!hasBeenLive || isDown) onResync()
        hasBeenLive = true
        isDown = false
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        isDown = true
        status('down')
      }
    })
  }

  return {
    start: () => {
      if (running) return
      running = true
      hasBeenLive = false
      isDown = false
      generation += 1
      status('connecting')
      void open(generation, 0)
    },
    stop: () => {
      if (!running) return
      running = false
      generation += 1
      clearTimeout(retryTimer)
      if (client) {
        if (channel) void client.removeChannel(channel)
        void client.disconnect()
      }
      client = undefined
      channel = undefined
    },
  }
}

/**
 * The real client: realtime-js, loaded on first use. The socket must be given the user's token before
 * the channel joins: a join made without it is subscribed as the anonymous role, which RLS answers with
 * no rows at all (found against local Supabase: the subscription showed claims_role = anon). A token
 * refresh is passed on too, so the subscription outlives the hour a token lasts.
 */
export async function connectRealtime(userId: string): Promise<ClientLike> {
  const { url, anonKey } = readSupabaseConfig()
  const token = await getAccessToken()
  // No session: joining would subscribe as the anonymous role (no rows). Fail so the caller backs off.
  if (!token) throw new Error('Realtime needs a signed-in session.')
  const { RealtimeClient } = await import('@supabase/realtime-js')
  const socket = new RealtimeClient(`${url.replace(/\/$/, '')}/realtime/v1`, {
    params: { apikey: anonKey },
    accessToken: () => getAccessToken(),
  })
  await socket.setAuth(token)
  const { data } = getAuthClient().onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session && session.user.id !== userId)) {
      // Another account signed in (another tab) or this one ended: this socket must not carry on
      // with a different person's token, nor wait for the screen to unmount.
      void socket.disconnect()
    } else if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
      void socket.setAuth(session.access_token)
    }
  })
  return {
    channel: (name) => socket.channel(name) as unknown as ChannelLike,
    removeChannel: (channel) => socket.removeChannel(channel as never),
    disconnect: () => {
      data.subscription.unsubscribe()
      return socket.disconnect()
    },
  }
}
