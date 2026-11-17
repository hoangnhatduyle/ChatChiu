// SPEC-AP-001 connectivity_and_queue: the state the sync badge shows.
import { syncState } from './sync-state'

describe('syncState', () => {
  it('F-AP-01: nothing pending is ONLINE_IDLE', () => {
    expect(syncState({ reachable: true, waiting: 0, syncing: 0 })).toBe('ONLINE_IDLE')
  })

  it('F-AP-01: a write being sent is ONLINE_SYNCING', () => {
    expect(syncState({ reachable: true, waiting: 0, syncing: 1 })).toBe('ONLINE_SYNCING')
  })

  it('F-AP-01: writes waiting while the API is unreachable are OFFLINE_QUEUED', () => {
    expect(syncState({ reachable: false, waiting: 2, syncing: 0 })).toBe('OFFLINE_QUEUED')
  })

  it('F-AP-01: back online with writes still waiting is ONLINE_SYNCING (they are being resumed)', () => {
    expect(syncState({ reachable: true, waiting: 2, syncing: 0 })).toBe('ONLINE_SYNCING')
  })

  it('FORBID connectivity_and_queue OFFLINE_QUEUED->ONLINE_IDLE: it is never idle while a write is pending', () => {
    for (const reachable of [true, false]) {
      for (const [waiting, syncing] of [
        [1, 0],
        [0, 1],
        [3, 2],
      ] as const) {
        expect(syncState({ reachable, waiting, syncing })).not.toBe('ONLINE_IDLE')
      }
    }
  })

  it('a write being sent while the API looks unreachable is still ONLINE_SYNCING (nothing is paused yet)', () => {
    expect(syncState({ reachable: false, waiting: 0, syncing: 1 })).toBe('ONLINE_SYNCING')
  })

  it('offline with nothing waiting is still ONLINE_IDLE (there is nothing to sync)', () => {
    expect(syncState({ reachable: false, waiting: 0, syncing: 0 })).toBe('ONLINE_IDLE')
  })
})
