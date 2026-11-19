// 7.0.28h: a new row keeps one React key when its temporary id is replaced by the real one, so it does not
// remount (and lose focus) the moment it is saved.
import 'fake-indexeddb/auto'
import type { Bootstrap, InventoryItem } from '@chatchiu/contracts'
import { vi } from 'vitest'
import { createAppQueryClient } from './query-client'
import { queryKeys } from './query'
import './register'
import { itemWrites } from './inventory'
import { newTempId, rowKey } from './resource'
import { startWrite } from './write'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('../core/api-client', () => ({ api }))

describe('rowKey', () => {
  it('is the id itself for a row that was never temporary', () => {
    expect(rowKey('inventory', 41)).toBe(41)
  })

  it('stays the temporary id after the server answers with the real one', async () => {
    const client = createAppQueryClient()
    client.mount()
    client.setQueryData(queryKeys.bootstrap, {
      items: [],
      locations: [],
      categories: [],
      summary: {},
    } as unknown as Bootstrap)
    api.post.mockResolvedValue({ id: 900, name: 'Milk', currentQuantity: 1 } as InventoryItem)
    const tempId = newTempId()
    const body = { name: 'Milk', quantity: 1, unit: 'pcs' } as never
    await startWrite(client, itemWrites.create, { tempId, body }).result
    expect(rowKey('inventory', 900)).toBe(tempId)
    // ids are per table: the same number in another list is a different row
    expect(rowKey('shopping', 900)).toBe(900)
    client.unmount()
  })
})
