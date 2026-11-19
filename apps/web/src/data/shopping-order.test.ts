// 7.0.29c: rows that came back after a refused "clear bought" return to their old places, not to the end.
import 'fake-indexeddb/auto'
import type { ShoppingItem } from '@chatchiu/contracts'
import { vi } from 'vitest'
import { ApiClientError } from '../core/errors'
import { createAppQueryClient } from './query-client'
import { queryKeys } from './query'
import './register'
import { clearPurchased } from './shopping'
import { startWrite } from './write'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../core/api-client', () => ({ api }))

const row = (id: number): ShoppingItem =>
  ({ id, name: `r${id}`, isPurchased: true }) as ShoppingItem

describe('clearPurchased rollback', () => {
  it('puts the rows back in their old places', async () => {
    api.post.mockRejectedValue(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'no' }),
    )
    const client = createAppQueryClient()
    client.mount()
    client.setQueryData(queryKeys.shopping, [row(1), row(2), row(3), row(4)])
    const result = await startWrite(client, clearPurchased, { ids: [2, 3] }).result
    expect(result.status).toBe('failed')
    expect(client.getQueryData<ShoppingItem[]>(queryKeys.shopping)?.map((r) => r.id)).toEqual([
      1, 2, 3, 4,
    ])
    client.unmount()
  })
})
