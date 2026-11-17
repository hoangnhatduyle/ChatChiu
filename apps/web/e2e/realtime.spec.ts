// Step 4.6 against local Supabase Realtime, in Node (F-KB-16): a change made as one user reaches a second
// connection of the same account within 3 seconds, and never reaches another account (RLS). Uses the real
// realtime-js client through core/realtime.ts with real tokens. The roadmap's two-browser check needs the
// board screen (5.1); roadmap row 7.0.21 keeps that one.
import { RealtimeClient } from '@supabase/realtime-js'
import { expect, test } from '@playwright/test'
import { createRealtime, type ClientLike, type RealtimeChange } from '../src/core/realtime'
import { createAccount, signInRest, supabaseEnv, type Account } from './support/supabase'

const WITHIN_MS = 3_000

async function rest(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const { url, anonKey } = supabaseEnv()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

function listen(token: string) {
  const { url, anonKey } = supabaseEnv()
  const changes: RealtimeChange[] = []
  let live: () => void = () => undefined
  const isLive = new Promise<void>((resolve) => (live = resolve))
  const realtime = createRealtime({
    connect: () =>
      (async () => {
        // The same steps as connectRealtime (core/realtime.ts), with a fixed token instead of a session.
        const socket = new RealtimeClient(`${url}/realtime/v1`, {
          params: { apikey: anonKey },
          accessToken: () => Promise.resolve(token),
        })
        await socket.setAuth(token)
        return socket as unknown as ClientLike
      })(),
    onChange: (c) => changes.push(c),
    onResync: () => undefined,
    onStatus: (s) => s === 'live' && live(),
  })
  realtime.start()
  return { changes, isLive, stop: () => realtime.stop() }
}

async function waitFor(check: () => boolean, ms = WITHIN_MS) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return check()
}

test('F-KB-16: a change reaches another connection of the same account within 3 s, and no row of hers reaches another account', async () => {
  const account: Account = await createAccount()
  const stranger = await createAccount()
  const token = (await signInRest(account)).access_token
  const strangerToken = (await signInRest(stranger)).access_token

  const tablet = listen(token)
  const intruder = listen(strangerToken)
  try {
    await Promise.all([tablet.isLive, intruder.isLive])

    const [category] = (await rest(token, 'categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E', user_id: account.userId, is_system: false }),
    })) as Array<{ id: number }>
    const [row] = (await rest(token, 'inventory_items', {
      method: 'POST',
      body: JSON.stringify({
        user_id: account.userId,
        name: 'Milk',
        category_id: category?.id,
        quantity: 2,
        unit: 'l',
        expiration_date: '2030-01-01',
        current_quantity: 2,
      }),
    })) as Array<{ id: number }>
    const id = row?.id as number

    expect(
      await waitFor(() => tablet.changes.some((c) => c.type === 'INSERT' && c.row.id === id)),
    ).toBe(true)
    const inserted = tablet.changes.find((c) => c.type === 'INSERT')
    expect(inserted).toMatchObject({
      table: 'inventory_items',
      row: { name: 'Milk', currentQuantity: 2 },
    })

    await rest(token, `inventory_items?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_quantity: 1 }),
    })
    expect(
      await waitFor(() =>
        tablet.changes.some((c) => c.type === 'UPDATE' && c.row.currentQuantity === 1),
      ),
    ).toBe(true)

    await rest(token, `inventory_items?id=eq.${id}`, { method: 'DELETE' })
    expect(
      await waitFor(() => tablet.changes.some((c) => c.type === 'DELETE' && c.row.id === id)),
    ).toBe(true)

    // RLS: the other account got no row of hers. Realtime cannot filter a DELETE by RLS (the old row
    // is only its key), so it may see that some id was deleted, and nothing else.
    expect(intruder.changes.filter((c) => c.type !== 'DELETE')).toEqual([])
    for (const c of intruder.changes) expect(Object.keys(c.row)).toEqual(['id'])
  } finally {
    tablet.stop()
    intruder.stop()
  }
})
