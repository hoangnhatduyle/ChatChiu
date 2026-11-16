import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiagnosticsPage from './DiagnosticsPage.tsx'

test('shows device checks and the three tests', () => {
  render(<DiagnosticsPage />)
  expect(screen.getByRole('heading', { name: 'Notification diagnostics' })).toBeInTheDocument()
  expect(screen.getByText('Push API (PushManager)')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '1. Local notification' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '2. Push now' })).toBeEnabled()
  expect(screen.getByRole('button', { name: /3\. Push in 20s/ })).toBeEnabled()
})

test('logs a clear failure when the push API is missing (jsdom has none)', async () => {
  render(<DiagnosticsPage />)
  await userEvent.click(screen.getByRole('button', { name: '2. Push now' }))
  expect(await screen.findByText(/Push API not available/)).toBeInTheDocument()
})
