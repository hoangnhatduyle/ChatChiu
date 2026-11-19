// UI refresh foundation: Card, BrandMark.
import { render, screen } from '@testing-library/react'
import { BRAND_ICON_LARGE, BRAND_ICON_SMALL } from './brand'
import { BrandMark } from './BrandMark'
import { Card } from './Card'

describe('Card', () => {
  it('draws the paper surface on the element it is given', () => {
    render(
      <Card as="section" aria-label="Fridge">
        hello
      </Card>,
    )
    const card = screen.getByRole('region', { name: 'Fridge' })
    expect(card.tagName).toBe('SECTION')
    expect(card).toHaveClass('bg-surface', 'rounded-card', 'border-line')
  })

  it('lifts on hover only when asked to', () => {
    const { rerender } = render(<Card data-testid="c">a</Card>)
    expect(screen.getByTestId('c').className).not.toMatch(/hover:/)
    rerender(
      <Card lift data-testid="c">
        a
      </Card>,
    )
    expect(screen.getByTestId('c').className).toMatch(/hover:-translate-y/)
  })
})

describe('BrandMark', () => {
  it("uses the user's own icon: 96 px up to 48 px, 192 px above, never the 1.5 MB original", () => {
    const { rerender } = render(<BrandMark size={44} />)
    expect(document.querySelector('img')).toHaveAttribute('src', BRAND_ICON_SMALL)
    rerender(<BrandMark size={88} />)
    const img = document.querySelector('img')
    expect(img).toHaveAttribute('src', BRAND_ICON_LARGE)
    expect(img?.getAttribute('src')).not.toMatch(/chac-chiu-icon/)
  })

  it('has explicit dimensions and is decorative unless it has a label', () => {
    const { rerender } = render(<BrandMark size={44} />)
    const img = document.querySelector('img')
    expect(img).toHaveAttribute('width', '44')
    expect(img).toHaveAttribute('height', '44')
    expect(img).toHaveAttribute('alt', '')
    rerender(<BrandMark size={44} label="Chắt Chiu" />)
    expect(screen.getByRole('img', { name: 'Chắt Chiu' })).toBeInTheDocument()
  })
})
