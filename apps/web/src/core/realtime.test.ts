// F-KB-16: live updates between devices. Rows arrive as snake_case Postgres changes; this module
// turns them into camelCase changes for data/realtime-sync.ts, reports whether the link is live, and
// asks for a resync after a drop (events during the gap are lost).
import { afterEach, beforeEach, vi } from 'vitest'
import {
  createRealtime,
  RECONNECT_BACKOFF_MS,
  type ClientLike,
  type RealtimeChange,
} from './realtime'

type Handler = (payload: unknown) => void
function fakeClient() {
  const handlers: Handler[] = []
  const filters: unknown[] = []
  let statusCb: (status: string) => void = () => undefined
  const channel = {
    on: (_type: string, filter: unknown, cb: Handler) => {
      filters.push(filter)
      handlers.push(cb)
      return channel
    },
    subscribe: (cb: (status: string) => void) => {
      statusCb = cb
      return channel
    },
  }
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    disconnect: vi.fn(),
  } satisfies ClientLike
  return {
    client,
    filters,
    // Like the real client: a change goes to the handler whose filter matches its table.
    emit: (payload: unknown) => {
      const table = (payload as { table?: string } | null)?.table
      handlers.forEach((h, i) => {
        if ((filters[i] as { table: string }).table === table) h(payload)
      })
    },
    status: (s: string) => statusCb(s),
  }
}

function setup(connect?: () => Promise<ClientLike>) {
  const fake = fakeClient()
  const changes: RealtimeChange[] = []
  const statuses: string[] = []
  const onResync = vi.fn()
  const realtime = createRealtime({
    connect: connect ?? (() => Promise.resolve(fake.client)),
    onChange: (c) => changes.push(c),
    onResync,
    onStatus: (s) => statuses.push(s),
  })
  return { fake, changes, statuses, onResync, realtime }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('realtime', () => {
  it('F-KB-16: listens to inventory_items, shopping_list and meal_plans, and nothing else', async () => {
    const { fake, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.filters).toEqual([
      { event: '*', schema: 'public', table: 'inventory_items' },
      { event: '*', schema: 'public', table: 'shopping_list' },
      { event: '*', schema: 'public', table: 'meal_plans' },
    ])
  })

  it('F-KB-16: turns a change into a camelCase row', async () => {
    const { fake, changes, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    fake.status('SUBSCRIBED')
    fake.emit({
      eventType: 'UPDATE',
      table: 'inventory_items',
      new: { id: 4, current_quantity: 2, expiration_date: '2030-01-01' },
      old: { id: 4 },
    })
    expect(changes).toEqual([
      {
        table: 'inventory_items',
        type: 'UPDATE',
        row: { id: 4, currentQuantity: 2, expirationDate: '2030-01-01' },
      },
    ])
  })

  it('a delete carries only the old row (its id)', async () => {
    const { fake, changes, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    fake.emit({ eventType: 'DELETE', table: 'shopping_list', new: {}, old: { id: 9 } })
    expect(changes).toEqual([{ table: 'shopping_list', type: 'DELETE', row: { id: 9 } }])
  })

  it('never maps a key onto the prototype', async () => {
    const { fake, changes, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    fake.emit({
      eventType: 'INSERT',
      table: 'meal_plans',
      new: JSON.parse('{"id":1,"__proto__":{"x":1},"constructor":2,"meal_name":"a"}'),
    })
    const row = changes[0]?.row as Record<string, unknown>
    expect(Object.keys(row).sort()).toEqual(['id', 'mealName'])
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('ignores anything that is not a known table, event or a row with a numeric id', async () => {
    const { fake, changes, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    fake.emit({ eventType: 'INSERT', table: 'secrets', new: { id: 1 } })
    fake.emit({ eventType: 'TRUNCATE', table: 'meal_plans', new: { id: 1 } })
    fake.emit({ eventType: 'INSERT', table: 'meal_plans', new: { id: 'x' } })
    fake.emit({ eventType: 'INSERT', table: 'meal_plans' })
    fake.emit(null)
    expect(changes).toEqual([])
  })

  it('reports connecting, live and down', async () => {
    const { fake, statuses, realtime } = setup()
    realtime.start()
    expect(statuses).toEqual(['connecting'])
    await vi.advanceTimersByTimeAsync(0)
    fake.status('SUBSCRIBED')
    fake.status('CHANNEL_ERROR')
    expect(statuses).toEqual(['connecting', 'live', 'down'])
  })

  it('F-KB-16: on the first join and after a drop and a reconnect it asks for a resync (changes during the gap were not delivered)', async () => {
    const { fake, onResync, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    fake.status('SUBSCRIBED')
    expect(onResync).toHaveBeenCalledTimes(1)
    fake.status('SUBSCRIBED') // a repeated notice is not a reconnect
    expect(onResync).toHaveBeenCalledTimes(1)
    fake.status('TIMED_OUT')
    fake.status('SUBSCRIBED')
    expect(onResync).toHaveBeenCalledTimes(2)
  })

  it('a client that cannot be created is retried with backoff and reported down', async () => {
    const connect = vi.fn<() => Promise<ClientLike>>().mockRejectedValueOnce(new Error('offline'))
    const { fake, statuses, realtime } = setup(connect)
    connect.mockResolvedValue(fake.client)
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses).toContain('down')
    await vi.advanceTimersByTimeAsync(RECONNECT_BACKOFF_MS[0] ?? 0)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(fake.client.channel).toHaveBeenCalledTimes(1)
  })

  it('start is idempotent, and stop removes the channel, disconnects and ignores late events', async () => {
    const { fake, changes, statuses, realtime } = setup()
    realtime.start()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.client.channel).toHaveBeenCalledTimes(1)
    realtime.stop()
    expect(fake.client.removeChannel).toHaveBeenCalledTimes(1)
    expect(fake.client.disconnect).toHaveBeenCalledTimes(1)
    fake.emit({ eventType: 'INSERT', table: 'meal_plans', new: { id: 1 } })
    fake.status('SUBSCRIBED')
    expect(changes).toEqual([])
    expect(statuses.at(-1)).not.toBe('live')
  })

  it('stop before the client has loaded creates nothing', async () => {
    const { fake, realtime } = setup()
    realtime.start()
    realtime.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.client.channel).not.toHaveBeenCalled()
    expect(fake.client.disconnect).toHaveBeenCalledTimes(1) // the loaded client is closed again, not leaked
  })

  it('can be started again after stop', async () => {
    const { fake, realtime } = setup()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    realtime.stop()
    realtime.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.client.channel).toHaveBeenCalledTimes(2)
  })
})
