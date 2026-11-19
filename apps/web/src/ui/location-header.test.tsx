// UI refresh foundation: the shelf-label header shared by the Kitchen cards and the Settings preview.
import { render, screen } from '@testing-library/react'
import { LocationHeader } from './LocationHeader'

describe('LocationHeader', () => {
  it('shows the name, the status line and the count on the chosen tint', () => {
    const { container } = render(
      <LocationHeader
        location={{ name: 'Freezer', icon: 'snow', color: 'ice' }}
        title="Freezer"
        status="2 expired · 1 low"
        count={11}
        headingId="h"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Freezer' })).toHaveAttribute('id', 'h')
    expect(screen.getByText('2 expired · 1 low')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('bg-loc-ice')
    expect(container.querySelector('svg[data-icon="snow"]')).not.toBeNull()
  })

  it('guesses the icon and tint from the name when none was chosen', () => {
    const { container } = render(<LocationHeader location={{ name: 'Fridge' }} title="Fridge" />)
    expect(container.firstElementChild).toHaveClass('bg-loc-mint')
    expect(container.querySelector('svg[data-icon="fridge"]')).not.toBeNull()
  })
})
