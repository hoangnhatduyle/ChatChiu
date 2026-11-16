import { render, screen } from '@testing-library/react'
import App from './App.tsx'

test('renders the app name', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Chắt Chiu' })).toBeInTheDocument()
})
