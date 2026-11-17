// F-AP-04 / SPEC-QP-001 ROLLED_BACK: a refused write says "Couldn't save · <what>" with Retry and Discard.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ToastProvider } from '../core/toast'
import { ApiClientError } from '../core/errors'
import { FailedWriteToasts } from './failed-write-toasts'
import { createAppQueryClient } from './query-client'
import { defineWrite, startWrite } from './write'

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
    expect(screen.getAllByText("Couldn't save · Save a note").length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2))
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
