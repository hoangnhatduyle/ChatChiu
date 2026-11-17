import { render, screen } from '@testing-library/react'
import App from './App.tsx'

test('F-AP-05: renders the shell at / with the brand "Chắt Chiu"', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Kitchen' })).toBeInTheDocument()
  expect(screen.getAllByRole('img', { name: 'Chắt Chiu' }).length).toBeGreaterThan(0)
})

test('the dev-only diagnostics link is absent unless VITE_ENABLE_DIAGNOSTICS is set (7.0.3)', async () => {
  render(<App />)
  await screen.findByRole('heading', { level: 1, name: 'Kitchen' })
  expect(screen.queryByRole('link', { name: 'Notification diagnostics' })).toBeNull()
})
