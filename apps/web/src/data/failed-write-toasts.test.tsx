// F-AP-04 / SPEC-QP-001 ROLLED_BACK: a refused write says "Couldn't save · <what>" with Retry and Discard.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ToastProvider } from '../core/toast'
import { ApiClientError } from '../core/errors'
import { FailedWriteToasts } from './failed-write-toasts'
import { createAppQueryClient } from './query-client'
import { defineWrite, silenceFailure, startWrite } from './write'

const calls = vi.fn()
const save = defineWrite<{ n: number }, null, undefined>({
  key: 'test/toast-save',
  label: 'Save a note',
  request: (input) => {
    calls(input)
    return calls.mock.calls.length === 1
      ? Promise.reject(new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'no' }))
      : Promise.resolve(null)
  },
})
const namedWrite = defineWrite<{ name: string }, null, undefined>({
  key: 'test/toast-named',
  label: 'Add an item',
  describe: ({ name }) => `Add ${name}`,
  request: () =>
    Promise.reject(
      new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'Name is too long.' }),
    ),
})
const gone = defineWrite<{ n: number }, null, undefined>({
  key: 'test/toast-gone',
  label: 'Tick a row',
  request: () =>
    Promise.reject(new ApiClientError({ status: 404, code: 'NOT_FOUND', message: 'No such row' })),
})
const conflictWrite = defineWrite<{ n: number }, null, undefined>({
  key: 'test/toast-conflict',
  label: 'Add a note',
  request: () =>
    Promise.reject(
      new ApiClientError({ status: 409, code: 'CONFLICT', message: 'taken', existingId: 5 }),
    ),
})
const aiWrite = defineWrite<{ n: number }, null, undefined>({
  key: 'test/toast-ai',
  label: 'Ask the AI',
  persist: false,
  request: () =>
    Promise.reject(new ApiClientError({ status: 400, code: 'BAD_REQUEST', message: 'no' })),
})

function setup() {
  const client = createAppQueryClient()
  client.mount()
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <FailedWriteToasts />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return client
}

describe('FailedWriteToasts', () => {
  it('F-AP-04: a refused write shows "Couldn\'t save" with Retry, and Retry sends it again', async () => {
    calls.mockClear()
    const client = setup()
    await act(async () => void (await startWrite(client, save, { n: 1 }).result))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getAllByText(/^Couldn't save · Save a note/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2))
    client.unmount()
  })

  it('7.0.27a / 7.0.29a: the toast names the item and gives the reason the server gave', async () => {
    const client = setup()
    await act(async () => void (await startWrite(client, namedWrite, { name: 'Milk' }).result))
    expect(
      await screen.findAllByText("Couldn't save · Add Milk: Name is too long."),
    ).not.toHaveLength(0)
    client.unmount()
  })

  it('7.0.26f / 7.0.29b / 7.0.30d: a write that can only fail the same way again (404, 409) has no Retry', async () => {
    const client = setup()
    await act(async () => void (await startWrite(client, gone, { n: 1 }).result))
    expect(await screen.findAllByText(/^Couldn't save · Tick a row: .*deleted/)).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    await act(async () => void (await startWrite(client, conflictWrite, { n: 2 }).result))
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    client.unmount()
  })

  it('a silent write (the reverse of an Undo, reported by the undo manager) gets no failed-write toast', async () => {
    const client = setup()
    await act(async () => {
      const handle = startWrite(client, namedWrite, { name: 'Milk' })
      silenceFailure(handle.requestId)
      await handle.result
    })
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument()
    client.unmount()
  })

  it('NC-MP-NO-UNHANDLED-409: a conflict that names the row in the way is left to the screen, with no toast', async () => {
    const client = setup()
    await act(
      async () =>
        void (await startWrite(client, conflictWrite, { n: 1 }, { handlesConflict: true }).result),
    )
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument()
    client.unmount()
  })

  it('a conflict nobody is waiting for (a replayed or retried write) still gets the toast', async () => {
    const client = setup()
    await act(async () => void (await startWrite(client, conflictWrite, { n: 1 }).result))
    expect(await screen.findAllByText(/^Couldn't save · Add a note/)).not.toHaveLength(0)
    client.unmount()
  })

  it('Discard removes the failed write', async () => {
    calls.mockReset()
    calls.mockReturnValueOnce(undefined)
    const client = setup()
    await act(async () => void (await startWrite(client, save, { n: 1 }).result))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(
      client
        .getMutationCache()
        .getAll()
        .filter((m) => m.state.status === 'error'),
    ).toHaveLength(0)
    client.unmount()
  })

  it('an AI call that fails is not announced as an unsaved change', async () => {
    const client = setup()
    await act(async () => void (await startWrite(client, aiWrite, { n: 1 }).result))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    client.unmount()
  })
})
